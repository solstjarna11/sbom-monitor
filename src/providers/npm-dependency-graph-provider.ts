import { readFile } from "node:fs/promises";
import path from "node:path";
import {
    ComponentRecord,
    DependencyEdge,
    DependencyGraphRecord,
    DependencyRelationship,
    DependencyScope,
    RepositoryProjectFiles
} from "../core/types";
import { pathExists } from "../utils/paths";
import { runCommand } from "../utils/command";
import { InvalidRepositoryError } from "../utils/errors";

interface PackageJsonManifest {
    name?: string;
    version?: string;
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
    optionalDependencies?: Record<string, string>;
}

interface LockfileData {
    name?: string;
    version?: string;
    lockfileVersion?: number;
    packages?: Record<string, LockfilePackageEntry>;
}

interface LockfilePackageEntry {
    name?: string;
    version?: string;
    resolved?: string;
    integrity?: string;
    license?: string;
    dev?: boolean;
    optional?: boolean;
    dependencies?: Record<string, string>;
}

interface NpmLsNode {
    name?: string;
    version?: string;
    resolved?: string;
    integrity?: string;
    dependencies?: Record<string, NpmLsNode>;
}

interface GenerateDependencyGraphInput {
    repositoryId: string;
    repositoryPath: string;
    projectFiles: RepositoryProjectFiles;
    scanId: string;
    generatedAt: string;
}

type RootDependencySets = {
    runtime: Set<string>;
    development: Set<string>;
    optional: Set<string>;
};

export class NpmDependencyGraphProvider {
    public async generateDependencyGraph(
        input: GenerateDependencyGraphInput
    ): Promise<DependencyGraphRecord> {
        const rootManifest = await this.readRootManifest(input.projectFiles.packageJson);
        const rootDependencySets = this.getRootDependencySets(rootManifest);

        const graph =
            input.projectFiles.packageLockJson !== undefined ||
                input.projectFiles.npmShrinkwrapJson !== undefined
                ? await this.generateFromLockfile(input, rootDependencySets)
                : await this.generateFromNpmLs(input, rootDependencySets);

        return {
            schemaVersion: "1.0",
            packageManager: "npm",
            repositoryId: input.repositoryId,
            scanId: input.scanId,
            generatedAt: input.generatedAt,
            components: graph.components,
            edges: graph.edges
        };
    }

    private async generateFromLockfile(
        input: GenerateDependencyGraphInput,
        rootDependencySets: RootDependencySets
    ): Promise<Pick<DependencyGraphRecord, "components" | "edges">> {
        const lockfilePath =
            input.projectFiles.packageLockJson ?? input.projectFiles.npmShrinkwrapJson;

        if (lockfilePath === undefined) {
            throw new InvalidRepositoryError("No lockfile found for npm dependency graph generation.");
        }

        let lockfile: LockfileData;
        try {
            lockfile = await this.readJsonFile<LockfileData>(lockfilePath);
        } catch (error) {
            if (error instanceof InvalidRepositoryError) {
                throw new InvalidRepositoryError(`Lockfile is not valid JSON: ${lockfilePath}`, {
                    code: "INVALID_LOCKFILE",
                    cause: error,
                    details: {
                        filePath: lockfilePath
                    },
                    exitCode: 2
                });
            }

            throw error;
        }

        if (lockfile.packages === undefined) {
            throw new InvalidRepositoryError(`Unsupported npm lockfile format: ${lockfilePath}`, {
                code: "UNSUPPORTED_LOCKFILE_FORMAT",
                details: {
                    filePath: lockfilePath
                },
                exitCode: 2
            });
        }

        const packageEntries = Object.entries(lockfile.packages).sort(([left], [right]) =>
            left.localeCompare(right)
        );

        const { components, pathToComponentId } = this.buildComponentsFromLockfile(
            packageEntries,
            rootDependencySets
        );

        const edges = this.buildEdgesFromLockfile(
            packageEntries,
            pathToComponentId,
            lockfile.packages,
            rootDependencySets,
            input.repositoryId
        );

        return {
            components: Array.from(components.values()).sort((left, right) =>
                left.id.localeCompare(right.id)
            ),
            edges: this.sortAndDedupeEdges(edges)
        };
    }

    private buildComponentsFromLockfile(
        packageEntries: Array<[string, LockfilePackageEntry]>,
        rootDependencySets: RootDependencySets
    ): { components: Map<string, ComponentRecord>; pathToComponentId: Map<string, string> } {
        const pathToComponentId = new Map<string, string>();
        const components = new Map<string, ComponentRecord>();

        for (const [packagePath, entry] of packageEntries) {
            if (packagePath === "") {
                continue;
            }

            const component = this.createComponentFromLockfileEntry(
                packagePath,
                entry,
                rootDependencySets
            );

            if (component === undefined) {
                continue;
            }

            pathToComponentId.set(packagePath, component.id);
            this.mergeComponent(components, component);
        }

        return { components, pathToComponentId };
    }

    private getRootDependencyNames(rootDependencySets: RootDependencySets): string[] {
        return Array.from(
            new Set([
                ...rootDependencySets.runtime,
                ...rootDependencySets.development,
                ...rootDependencySets.optional
            ])
        ).sort((left, right) => left.localeCompare(right));
    }

    private buildEdgesFromLockfile(
        packageEntries: Array<[string, LockfilePackageEntry]>,
        pathToComponentId: Map<string, string>,
        packages: Record<string, LockfilePackageEntry>,
        rootDependencySets: RootDependencySets,
        repositoryId: string
    ): DependencyEdge[] {
        const edges: DependencyEdge[] = [];

        for (const [packagePath, entry] of packageEntries) {
            const dependencyNames =
                packagePath === ""
                    ? this.getRootDependencyNames(rootDependencySets)
                    : Object.keys(entry.dependencies ?? {}).sort((left, right) =>
                        left.localeCompare(right)
                    );

            for (const dependencyName of dependencyNames) {
                const edge = this.createEdgeForDependency(
                    dependencyName,
                    packagePath,
                    pathToComponentId,
                    packages,
                    rootDependencySets,
                    repositoryId
                );

                if (edge !== undefined) {
                    edges.push(edge);
                }
            }
        }

        return edges;
    }

    private createEdgeForDependency(
        dependencyName: string,
        packagePath: string,
        pathToComponentId: Map<string, string>,
        packages: Record<string, LockfilePackageEntry>,
        rootDependencySets: RootDependencySets,
        repositoryId: string
    ): DependencyEdge | undefined {
        const childPackagePath = this.resolveDependencyPackagePath(
            dependencyName,
            packagePath,
            packages
        );

        if (childPackagePath === undefined) {
            return undefined;
        }

        const childComponentId = pathToComponentId.get(childPackagePath);
        if (childComponentId === undefined) {
            return undefined;
        }

        const relationship: DependencyRelationship =
            packagePath === "" ? "direct" : "transitive";

        const scope =
            packagePath === ""
                ? this.scopeForDirectDependencyName(dependencyName, rootDependencySets)
                : this.scopeForLockfileEntry(packages[childPackagePath]);

        return {
            fromComponentId:
                packagePath === ""
                    ? repositoryId
                    : (pathToComponentId.get(packagePath) ?? repositoryId),
            toComponentId: childComponentId,
            relationship,
            scope
        };
    }

    private async generateFromNpmLs(
        input: GenerateDependencyGraphInput,
        rootDependencySets: RootDependencySets
    ): Promise<Pick<DependencyGraphRecord, "components" | "edges">> {
        const stdout = await runCommand("npm", ["ls", "--all", "--json"], {
            cwd: input.repositoryPath
        });

        const rootNode = JSON.parse(stdout) as NpmLsNode;
        const components = new Map<string, ComponentRecord>();
        const edges: DependencyEdge[] = [];

        const visitNode = (
            node: NpmLsNode,
            parentComponentId: string,
            depth: number
        ): void => {
            const dependencyEntries = Object.entries(node.dependencies ?? {}).sort(
                ([left], [right]) => left.localeCompare(right)
            );

            for (const [dependencyName, dependencyNode] of dependencyEntries) {
                const version = dependencyNode.version ?? "unknown";
                const direct = depth === 0;
                const scope = direct
                    ? this.scopeForDirectDependencyName(dependencyName, rootDependencySets)
                    : "unknown";

                const component = createComponentRecord({
                    id: buildNpmComponentId(dependencyName, version),
                    name: dependencyName,
                    version,
                    ecosystem: "npm",
                    packageUrl: buildNpmPackageUrl(dependencyName, version),
                    checksum: dependencyNode.integrity,
                    sourceUrl: dependencyNode.resolved,
                    relationship: direct ? "direct" : "transitive",
                    scope,
                    direct,
                    transitive: !direct,
                    devDependency: scope === "development",
                    metadata: {},
                    license: undefined,
                    supplier: undefined
                });

                this.mergeComponent(components, component);

                edges.push({
                    fromComponentId: parentComponentId,
                    toComponentId: component.id,
                    relationship: direct ? "direct" : "transitive",
                    scope
                });

                visitNode(dependencyNode, component.id, depth + 1);
            }
        };

        visitNode(rootNode, input.repositoryId, 0);

        return {
            components: Array.from(components.values()).sort((left, right) =>
                left.id.localeCompare(right.id)
            ),
            edges: this.sortAndDedupeEdges(edges)
        };
    }

    private async readRootManifest(packageJsonPath: string): Promise<PackageJsonManifest> {
        if (!(await pathExists(packageJsonPath))) {
            throw new InvalidRepositoryError(`package.json not found: ${packageJsonPath}`);
        }

        return this.readJsonFile<PackageJsonManifest>(packageJsonPath);
    }

    private async readJsonFile<T>(filePath: string): Promise<T> {
        const raw = await readFile(filePath, "utf-8");
        return JSON.parse(raw) as T;
    }

    private getRootDependencySets(rootManifest: PackageJsonManifest): RootDependencySets {
        return {
            runtime: new Set(Object.keys(rootManifest.dependencies ?? {})),
            development: new Set(Object.keys(rootManifest.devDependencies ?? {})),
            optional: new Set(Object.keys(rootManifest.optionalDependencies ?? {}))
        };
    }

    private isTopLevelPackagePath(packagePath: string): boolean {
        const segments = packagePath.split("/").filter(Boolean);

        if (segments[0] !== "node_modules") {
            return false;
        }

        if (segments[1]?.startsWith("@")) {
            return segments.length === 3;
        }

        return segments.length === 2;
    }

    private createComponentFromLockfileEntry(
        packagePath: string,
        entry: LockfilePackageEntry,
        rootDependencySets: RootDependencySets
    ): ComponentRecord | undefined {
        const packageName = entry.name ?? derivePackageNameFromPackagePath(packagePath);
        const version = entry.version;

        if (packageName === undefined || version === undefined) {
            return undefined;
        }

        const isTopLevel = this.isTopLevelPackagePath(packagePath);
        const isDeclared = this.isDirectDependency(packageName, rootDependencySets);

        const direct = isTopLevel && isDeclared;
        const scope = direct
            ? this.scopeForDirectDependencyName(packageName, rootDependencySets)
            : this.scopeForLockfileEntry(entry);

        return createComponentRecord({
            id: buildNpmComponentId(packageName, version),
            name: packageName,
            version,
            ecosystem: "npm",
            packageUrl: buildNpmPackageUrl(packageName, version),
            checksum: entry.integrity,
            license: entry.license,
            sourceUrl: entry.resolved,
            relationship: direct ? "direct" : "transitive",
            scope,
            direct,
            transitive: !direct,
            devDependency: scope === "development",
            metadata: {
                lockfilePath: packagePath,
                optional: entry.optional ?? false,
                dev: entry.dev ?? false
            },
            supplier: undefined
        });
    }

    private isDirectDependency(
        packageName: string,
        rootDependencySets: RootDependencySets
    ): boolean {
        return (
            rootDependencySets.runtime.has(packageName) ||
            rootDependencySets.development.has(packageName) ||
            rootDependencySets.optional.has(packageName)
        );
    }

    private scopeForDirectDependencyName(
        packageName: string,
        rootDependencySets: RootDependencySets
    ): DependencyScope {
        if (rootDependencySets.optional.has(packageName)) {
            return "optional";
        }

        if (rootDependencySets.development.has(packageName)) {
            return "development";
        }

        if (rootDependencySets.runtime.has(packageName)) {
            return "runtime";
        }

        return "unknown";
    }

    private scopeForLockfileEntry(
        entry: LockfilePackageEntry | undefined
    ): DependencyScope {
        if (entry?.optional === true) {
            return "optional";
        }

        if (entry?.dev === true) {
            return "development";
        }

        return "runtime";
    }

    private resolveDependencyPackagePath(
        dependencyName: string,
        parentPackagePath: string,
        packages: Record<string, LockfilePackageEntry>
    ): string | undefined {
        const candidatePaths = buildLockfileCandidatePaths(parentPackagePath, dependencyName);

        for (const candidatePath of candidatePaths) {
            if (candidatePath in packages) {
                return candidatePath;
            }
        }

        return undefined;
    }

    private mergeComponent(
        componentMap: Map<string, ComponentRecord>,
        candidate: ComponentRecord
    ): void {
        const existing = componentMap.get(candidate.id);

        if (existing === undefined) {
            componentMap.set(candidate.id, candidate);
            return;
        }

        const mergedDirect = existing.direct || candidate.direct;
        const mergedTransitive = !mergedDirect;

        let mergedScope: DependencyScope;
        if (existing.direct) {
            mergedScope = existing.scope;
        } else if (candidate.direct) {
            mergedScope = candidate.scope;
        } else {
            mergedScope = existing.scope;
        }

        componentMap.set(
            candidate.id,
            createComponentRecord({
                id: existing.id,
                name: existing.name,
                version: existing.version,
                ecosystem: "npm",
                packageUrl: existing.packageUrl ?? candidate.packageUrl,
                checksum: existing.checksum ?? candidate.checksum,
                license: existing.license ?? candidate.license,
                supplier: existing.supplier ?? candidate.supplier,
                sourceUrl: existing.sourceUrl ?? candidate.sourceUrl,
                relationship: mergedDirect ? "direct" : "transitive",
                scope: mergedScope,
                direct: mergedDirect,
                transitive: mergedTransitive,
                devDependency: existing.devDependency && candidate.devDependency,
                metadata: {
                    ...existing.metadata,
                    ...candidate.metadata
                }
            })
        );
    }

    private sortAndDedupeEdges(edges: DependencyEdge[]): DependencyEdge[] {
        const edgeMap = new Map<string, DependencyEdge>();

        for (const edge of edges) {
            const key = [
                edge.fromComponentId,
                edge.toComponentId,
                edge.relationship,
                edge.scope
            ].join("::");

            edgeMap.set(key, edge);
        }

        return Array.from(edgeMap.values()).sort((left, right) => {
            const leftKey = `${left.fromComponentId}::${left.toComponentId}::${left.relationship}::${left.scope}`;
            const rightKey = `${right.fromComponentId}::${right.toComponentId}::${right.relationship}::${right.scope}`;
            return leftKey.localeCompare(rightKey);
        });
    }
}

function derivePackageNameFromPackagePath(packagePath: string): string | undefined {
    const segments = packagePath.split("/").filter((segment) => segment.length > 0);
    const nodeModulesIndexes: number[] = [];

    for (let index = 0; index < segments.length; index += 1) {
        if (segments[index] === "node_modules") {
            nodeModulesIndexes.push(index);
        }
    }

    const lastNodeModulesIndex = nodeModulesIndexes.at(-1);
    if (lastNodeModulesIndex === undefined) {
        return undefined;
    }

    const remainingSegments = segments.slice(lastNodeModulesIndex + 1);
    if (remainingSegments.length === 0) {
        return undefined;
    }

    if (remainingSegments[0]?.startsWith("@")) {
        if (remainingSegments.length < 2) {
            return undefined;
        }

        return `${remainingSegments[0]}/${remainingSegments[1]}`;
    }

    return remainingSegments[0];
}

function buildNpmComponentId(packageName: string, version: string): string {
    return `pkg:npm/${encodePurlName(packageName)}@${version}`;
}

function buildNpmPackageUrl(packageName: string, version: string): string {
    return buildNpmComponentId(packageName, version);
}

function encodePurlName(packageName: string): string {
    return packageName
        .split("/")
        .map((segment) => encodeURIComponent(segment))
        .join("/");
}

function buildLockfileCandidatePaths(
    parentPackagePath: string,
    dependencyName: string
): string[] {
    const dependencySegments = dependencyName.split("/");
    const candidates: string[] = [];

    if (parentPackagePath === "") {
        candidates.push(path.posix.join("node_modules", ...dependencySegments));
        return candidates;
    }

    let currentPath = parentPackagePath;

    while (currentPath.length > 0) {
        candidates.push(path.posix.join(currentPath, "node_modules", ...dependencySegments));

        const previousNodeModulesIndex = currentPath.lastIndexOf("/node_modules/");
        if (previousNodeModulesIndex === -1) {
            break;
        }

        currentPath = currentPath.slice(0, previousNodeModulesIndex);
    }

    candidates.push(path.posix.join("node_modules", ...dependencySegments));

    return candidates;
}

interface CreateComponentRecordInput {
    id: string;
    name: string;
    version: string;
    ecosystem: "npm";
    packageUrl: string | undefined;
    checksum: string | undefined;
    license: string | undefined;
    supplier: string | undefined;
    sourceUrl: string | undefined;
    relationship: DependencyRelationship;
    scope: DependencyScope;
    direct: boolean;
    transitive: boolean;
    devDependency: boolean;
    metadata: Record<string, string | number | boolean | null>;
}

function createComponentRecord(input: CreateComponentRecordInput): ComponentRecord {
    return {
        id: input.id,
        name: input.name,
        version: input.version,
        ecosystem: input.ecosystem,
        relationship: input.relationship,
        scope: input.scope,
        direct: input.direct,
        transitive: input.transitive,
        devDependency: input.devDependency,
        metadata: input.metadata,
        ...(input.packageUrl === undefined ? {} : { packageUrl: input.packageUrl }),
        ...(input.checksum === undefined ? {} : { checksum: input.checksum }),
        ...(input.license === undefined ? {} : { license: input.license }),
        ...(input.supplier === undefined ? {} : { supplier: input.supplier }),
        ...(input.sourceUrl === undefined ? {} : { sourceUrl: input.sourceUrl })
    };
}