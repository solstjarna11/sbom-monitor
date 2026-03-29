import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { Analyzer, AnalyzerContext } from "./types";
import { Finding } from "../core/types";

interface PackageJsonManifest {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  scripts?: Record<string, string>;
}

const SOURCE_DIRS = ["src", "app", "server", "lib", "pages", "components"];
const SOURCE_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs"
]);

const REDUNDANT_PACKAGE_PAIRS: Array<[string, string]> = [
  ["lodash", "lodash-es"],
  ["moment", "dayjs"],
  ["request", "node-fetch"],
  ["uuid", "nanoid"]
];

export class NecessityAnalyzer implements Analyzer {
  public readonly name = "necessity";

  public async analyze(context: AnalyzerContext): Promise<Finding[]> {
    const manifest = await this.readManifest(context.repositoryPath);
    const findings: Finding[] = [];

    const sourceText = await this.collectSourceText(context.repositoryPath);
    const scriptsText = Object.values(manifest.scripts ?? {}).join("\n");

    for (const component of context.components) {
      if (!component.direct || component.devDependency) {
        continue;
      }

      const packageName = component.name;
      const referenced =
        this.isPackageReferenced(sourceText, packageName) ||
        this.isPackageReferenced(scriptsText, packageName);

      if (!referenced && sourceText.trim().length > 0) {
        findings.push({
          id: `necessity-unused-${component.id}`,
          componentId: component.id,
          severity: "low",
          category: "necessity",
          title: "Possible unused direct dependency",
          description: `Direct dependency "${packageName}" was not detected in common source files or package scripts.`,
          evidence: {
            packageName,
            direct: true,
            searchedDirectories: SOURCE_DIRS
          },
          remediation:
            "Review whether this dependency is still required. Remove it if it is no longer used.",
          references: [],
          detectedAt: context.timestamp
        });
      }
    }

    const productionScriptKeys = ["start", "serve", "preview", "build"];
    const productionScripts = Object.entries(manifest.scripts ?? {})
      .filter(([key]) => productionScriptKeys.includes(key))
      .map(([key, value]) => `${key}: ${value}`)
      .join("\n");

    for (const component of context.components) {
      if (!component.direct || !component.devDependency) {
        continue;
      }

      if (this.isPackageReferenced(productionScripts, component.name)) {
        findings.push({
          id: `necessity-dev-prod-${component.id}`,
          componentId: component.id,
          severity: "medium",
          category: "necessity",
          title: "Dev dependency referenced in production-relevant scripts",
          description: `Direct dev dependency "${component.name}" appears in build or runtime-oriented package scripts.`,
          evidence: {
            packageName: component.name,
            scripts: productionScripts
          },
          remediation:
            "Confirm this package belongs in devDependencies and is not required by production runtime or build promotion flow.",
          references: [],
          detectedAt: context.timestamp
        });
      }
    }

    const declaredPackages = new Set([
      ...Object.keys(manifest.dependencies ?? {}),
      ...Object.keys(manifest.devDependencies ?? {})
    ]);

    for (const [left, right] of REDUNDANT_PACKAGE_PAIRS) {
      if (declaredPackages.has(left) && declaredPackages.has(right)) {
        findings.push({
          id: `necessity-redundant-${left}-${right}`,
          severity: "low",
          category: "necessity",
          title: "Potentially redundant package pair",
          description: `Both "${left}" and "${right}" are declared. This can indicate overlapping functionality.`,
          evidence: {
            packages: [left, right]
          },
          remediation:
            "Review whether both packages are required. Consolidate to one where practical.",
          references: [],
          detectedAt: context.timestamp
        });
      }
    }

    return findings;
  }

  private async readManifest(repositoryPath: string): Promise<PackageJsonManifest> {
    const packageJsonPath = path.join(repositoryPath, "package.json");
    const raw = await readFile(packageJsonPath, "utf-8");
    return JSON.parse(raw) as PackageJsonManifest;
  }

  private async collectSourceText(repositoryPath: string): Promise<string> {
    const chunks: string[] = [];

    for (const dirName of SOURCE_DIRS) {
      const absoluteDir = path.join(repositoryPath, dirName);
      const files = await this.collectFilesRecursively(absoluteDir);

      for (const filePath of files) {
        const extension = path.extname(filePath).toLowerCase();
        if (!SOURCE_EXTENSIONS.has(extension)) {
          continue;
        }

        try {
          chunks.push(await readFile(filePath, "utf-8"));
        } catch {
          continue;
        }
      }
    }

    return chunks.join("\n");
  }

  private async collectFilesRecursively(directoryPath: string): Promise<string[]> {
    try {
      const entries = await readdir(directoryPath, { withFileTypes: true });
      const files: string[] = [];

      for (const entry of entries) {
        const absolutePath = path.join(directoryPath, entry.name);

        if (entry.isDirectory()) {
          files.push(...(await this.collectFilesRecursively(absolutePath)));
          continue;
        }

        if (entry.isFile()) {
          files.push(absolutePath);
        }
      }

      return files;
    } catch {
      return [];
    }
  }

  private isPackageReferenced(text: string, packageName: string): boolean {
    if (text.trim().length === 0) {
      return false;
    }

    const escapedName = escapeRegExp(packageName);
    const simpleName = escapeRegExp(packageName.split("/").at(-1) ?? packageName);

    const patterns = [
      new RegExp(`['"\`]${escapedName}['"\`]`),
      new RegExp(`require\\(\\s*['"\`]${escapedName}['"\`]\\s*\\)`),
      new RegExp(`from\\s+['"\`]${escapedName}['"\`]`),
      new RegExp(`\\b${simpleName}\\b`)
    ];

    return patterns.some((pattern) => pattern.test(text));
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}