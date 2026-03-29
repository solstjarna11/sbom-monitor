import { readFile } from "node:fs/promises";
import path from "node:path";
import { Analyzer, AnalyzerContext } from "./types";
import { Finding } from "../core/types";

interface PackageJsonManifest {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  scripts?: Record<string, string>;
}

export class SourceTrustAnalyzer implements Analyzer {
  public readonly name = "source-trust";

  public async analyze(context: AnalyzerContext): Promise<Finding[]> {
    const findings: Finding[] = [];
    const manifest = await this.readManifest(context.repositoryPath);

    if (
      context.projectFiles.packageLockJson === undefined &&
      context.projectFiles.npmShrinkwrapJson === undefined
    ) {
      findings.push({
        id: `source-trust-lockfile-missing-${context.scanId}`,
        severity: "high",
        category: "source-trust",
        title: "Missing npm lockfile",
        description:
          "No package-lock.json or npm-shrinkwrap.json was detected. This weakens reproducibility and source trust.",
        evidence: {
          packageLockJson: context.projectFiles.packageLockJson ?? null,
          npmShrinkwrapJson: context.projectFiles.npmShrinkwrapJson ?? null
        },
        remediation:
          "Generate and commit a lockfile to pin resolved package versions and improve supply chain reproducibility.",
        references: [],
        detectedAt: context.timestamp
      });
    }

    const dependencySets = [
      ["dependencies", manifest.dependencies ?? {}],
      ["devDependencies", manifest.devDependencies ?? {}],
      ["optionalDependencies", manifest.optionalDependencies ?? {}]
    ] as const;

    for (const [section, dependencies] of dependencySets) {
      for (const [name, version] of Object.entries(dependencies)) {
        if (isLooseSemver(version)) {
          findings.push({
            id: `source-trust-semver-${section}-${name}`,
            severity: "low",
            category: "source-trust",
            title: "Loose semver range",
            description: `Dependency "${name}" uses a loose version selector "${version}".`,
            evidence: {
              section,
              packageName: name,
              version
            },
            remediation:
              "Pin dependency versions to exact versions where practical, especially for security-sensitive packages.",
            references: [],
            detectedAt: context.timestamp
          });
        }

        if (isNonStandardSource(version)) {
          findings.push({
            id: `source-trust-source-${section}-${name}`,
            severity: "medium",
            category: "source-trust",
            title: "Non-standard dependency source",
            description: `Dependency "${name}" is referenced from a non-registry source "${version}".`,
            evidence: {
              section,
              packageName: name,
              version
            },
            remediation:
              "Prefer registry-published package versions and review trust and integrity controls for external sources.",
            references: [],
            detectedAt: context.timestamp
          });
        }
      }
    }

    for (const scriptName of ["preinstall", "install", "postinstall", "prepare"]) {
      const scriptCommand = manifest.scripts?.[scriptName];
      if (scriptCommand === undefined) {
        continue;
      }

      findings.push({
        id: `source-trust-lifecycle-${scriptName}-${context.scanId}`,
        severity: scriptName === "postinstall" || scriptName === "preinstall"
          ? "medium"
          : "low",
        category: "source-trust",
        title: "Lifecycle script present",
        description: `The package defines a "${scriptName}" lifecycle script, which can affect installation trust boundaries.`,
        evidence: {
          scriptName,
          command: scriptCommand
        },
        remediation:
          "Review lifecycle scripts carefully and remove unnecessary install-time execution where possible.",
        references: [],
        detectedAt: context.timestamp
      });
    }

    return findings;
  }

  private async readManifest(repositoryPath: string): Promise<PackageJsonManifest> {
    const packageJsonPath = path.join(repositoryPath, "package.json");
    const raw = await readFile(packageJsonPath, "utf-8");
    return JSON.parse(raw) as PackageJsonManifest;
  }
}

function isLooseSemver(version: string): boolean {
  return (
    version.startsWith("^") ||
    version.startsWith("~") ||
    version === "*" ||
    version.includes("||") ||
    /(?:^|[^\w])(x|X|\*)$/.test(version)
  );
}

function isNonStandardSource(version: string): boolean {
  const normalized = version.toLowerCase();

  return (
    normalized.startsWith("git+") ||
    normalized.startsWith("git@") ||
    normalized.startsWith("github:") ||
    normalized.startsWith("http://") ||
    normalized.startsWith("https://") ||
    normalized.startsWith("file:") ||
    normalized.startsWith("link:") ||
    normalized.endsWith(".tgz") ||
    normalized.endsWith(".tar.gz")
  );
}