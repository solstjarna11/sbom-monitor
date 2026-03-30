// src/analyzers/integrity-analyzer.ts

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

interface LockfileData {
  lockfileVersion?: number;
  packages?: Record<string, LockfilePackageEntry>;
}

interface LockfilePackageEntry {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
}

type DependencySection =
  | "dependencies"
  | "devDependencies"
  | "optionalDependencies";

const SCRIPT_PATTERN_RULES: Array<{
  label: string;
  severity: "low" | "medium" | "high";
  regex: RegExp;
  remediation: string;
}> = [
  {
    label: "Network download piped to shell",
    severity: "high",
    regex:
      /\b(curl|wget)\b[^\n|;]*\|\s*(bash|sh)\b|\b(Invoke-WebRequest|iwr)\b[^\n|;]*\|\s*(iex|Invoke-Expression)\b/i,
    remediation:
      "Avoid piping downloaded content directly into a shell. Download, verify, and execute only trusted, reviewed content."
  },
  {
    label: "Remote script execution",
    severity: "medium",
    regex: /\b(node|python|bash|sh)\b\s+-e\b/i,
    remediation:
      "Avoid inline script execution in install or build stages unless the source and contents are tightly controlled."
  },
  {
    label: "Use of npm install in automation-sensitive scripts",
    severity: "low",
    regex: /\bnpm\s+install\b/i,
    remediation:
      "Prefer npm ci in deterministic build environments to reduce integrity drift."
  }
];

export class IntegrityAnalyzer implements Analyzer {
  public readonly name = "integrity";

  public async analyze(context: AnalyzerContext): Promise<Finding[]> {
    const findings: Finding[] = [];
    const manifest = await this.readManifest(context.repositoryPath);

    findings.push(
      ...(await this.analyzeManifestLockfileConsistency(context, manifest))
    , ...this.analyzeScripts(manifest, context), ...this.analyzeDependencySources(manifest, context), ...(await this.analyzeNpmrc(context)), ...(await this.analyzeWorkflows(context)));

    return findings;
  }

  private async analyzeManifestLockfileConsistency(
    context: AnalyzerContext,
    manifest: PackageJsonManifest
  ): Promise<Finding[]> {
    const findings: Finding[] = [];
    const lockfilePath =
      context.projectFiles.packageLockJson ?? context.projectFiles.npmShrinkwrapJson;

    if (lockfilePath === undefined) {
      return findings;
    }

    try {
      const raw = await readFile(lockfilePath, "utf-8");
      const lockfile = JSON.parse(raw) as LockfileData;
      const rootPackage = lockfile.packages?.[""] ?? {};
      const directComponentNames = new Set(
        context.components
          .filter((component) => component.direct)
          .map((component) => component.name)
      );

      for (const section of [
        "dependencies",
        "devDependencies",
        "optionalDependencies"
      ] as const) {
        const manifestEntries = manifest[section] ?? {};
        const lockfileEntries = rootPackage[section] ?? {};

        for (const [packageName, manifestVersion] of Object.entries(
          manifestEntries
        )) {
          const lockfileVersion = lockfileEntries[packageName];

          if (lockfileVersion === undefined) {
            findings.push({
              id: `integrity-lockfile-missing-${section}-${packageName}`,
              severity: "medium",
              category: "integrity",
              title: "Manifest dependency missing from lockfile root entry",
              description: `Declared ${section} entry "${packageName}" was not found in the root lockfile package entry.`,
              evidence: {
                section,
                packageName,
                manifestVersion,
                lockfilePath
              },
              remediation:
                "Regenerate the lockfile and verify that the committed lockfile matches the current manifest.",
              references: [],
              detectedAt: context.timestamp
            });
            continue;
          }

          if (lockfileVersion !== manifestVersion) {
            findings.push({
              id: `integrity-lockfile-mismatch-${section}-${packageName}`,
              severity: "low",
              category: "integrity",
              title: "Manifest and lockfile version spec differ",
              description: `Dependency "${packageName}" has different version specifiers in package.json and the lockfile root entry.`,
              evidence: {
                section,
                packageName,
                manifestVersion,
                lockfileVersion,
                lockfilePath
              },
              remediation:
                "Ensure package.json and the lockfile were updated together and committed in sync.",
              references: [],
              detectedAt: context.timestamp
            });
          }

          if (!directComponentNames.has(packageName)) {
            findings.push({
              id: `integrity-resolved-missing-${section}-${packageName}`,
              severity: "medium",
              category: "integrity",
              title: "Declared dependency missing from resolved direct dependency graph",
              description: `Declared ${section} package "${packageName}" was not identified as a resolved direct dependency.`,
              evidence: {
                section,
                packageName,
                manifestVersion
              },
              remediation:
                "Reinstall dependencies and verify the lockfile and resolved dependency graph are consistent with the manifest.",
              references: [],
              detectedAt: context.timestamp
            });
          }
        }
      }
    } catch {
      return findings;
    }

    return findings;
  }

  private analyzeScripts(
    manifest: PackageJsonManifest,
    context: AnalyzerContext
  ): Finding[] {
    const findings: Finding[] = [];
    const relevantScriptNames = new Set([
      "preinstall",
      "install",
      "postinstall",
      "prepare",
      "build",
      "prebuild",
      "postbuild"
    ]);

    for (const [scriptName, command] of Object.entries(manifest.scripts ?? {})) {
      if (!relevantScriptNames.has(scriptName)) {
        continue;
      }

      for (const rule of SCRIPT_PATTERN_RULES) {
        if (!rule.regex.test(command)) {
          continue;
        }

        findings.push({
          id: `integrity-script-${scriptName}-${slugify(rule.label)}`,
          severity: rule.severity,
          category: "integrity",
          title: `Risky install/build script pattern: ${rule.label}`,
          description: `The "${scriptName}" script contains a pattern that expands trust boundaries during install or build execution.`,
          evidence: {
            scriptName,
            command,
            matchedRule: rule.label
          },
          remediation: rule.remediation,
          references: [],
          detectedAt: context.timestamp
        });
      }
    }

    return findings;
  }

  private analyzeDependencySources(
    manifest: PackageJsonManifest,
    context: AnalyzerContext
  ): Finding[] {
    const findings: Finding[] = [];

    for (const [section, dependencies] of [
      ["dependencies", manifest.dependencies ?? {}],
      ["devDependencies", manifest.devDependencies ?? {}],
      ["optionalDependencies", manifest.optionalDependencies ?? {}]
    ] as const) {
      for (const [packageName, version] of Object.entries(dependencies)) {
        if (!isNonStandardSource(version)) {
          continue;
        }

        findings.push({
          id: `integrity-source-${section}-${packageName}`,
          severity: version.toLowerCase().startsWith("http://") ? "high" : "medium",
          category: "integrity",
          title: "Dependency uses less-trusted or non-standard source",
          description: `Dependency "${packageName}" is sourced from "${version}", which bypasses normal registry trust and integrity expectations.`,
          evidence: {
            section,
            packageName,
            version
          },
          remediation:
            "Prefer registry-published artifacts over git, tarball, local, or direct URL sources unless there is a reviewed exception.",
          references: [],
          detectedAt: context.timestamp
        });
      }
    }

    return findings;
  }

  private async analyzeNpmrc(context: AnalyzerContext): Promise<Finding[]> {
    const findings: Finding[] = [];
    const npmrcPath = context.projectFiles.npmrc;

    if (npmrcPath === undefined) {
      return findings;
    }

    try {
      const raw = await readFile(npmrcPath, "utf-8");
      const lines = raw
        .split(/\r?\n/u)
        .map((line) => line.trim())
        .filter((line) => line.length > 0 && !line.startsWith("#"));

      for (const line of lines) {
        if (/^strict-ssl\s*=\s*false$/i.test(line)) {
          findings.push({
            id: `integrity-npmrc-strict-ssl-${context.scanId}`,
            severity: "high",
            category: "integrity",
            title: "npm strict SSL verification disabled",
            description:
              "The .npmrc configuration disables strict SSL verification, weakening transport integrity checks for package downloads.",
            evidence: {
              file: npmrcPath,
              line
            },
            remediation:
              "Enable strict SSL verification and ensure package downloads use trusted HTTPS endpoints.",
            references: [],
            detectedAt: context.timestamp
          });
        }

        if (/^registry\s*=\s*http:\/\//i.test(line)) {
          findings.push({
            id: `integrity-npmrc-http-registry-${context.scanId}`,
            severity: "high",
            category: "integrity",
            title: "npm registry uses insecure HTTP",
            description:
              "The configured npm registry uses HTTP, which weakens integrity and authenticity guarantees during package retrieval.",
            evidence: {
              file: npmrcPath,
              line
            },
            remediation:
              "Use HTTPS for registry configuration and review any package manager settings that bypass normal transport protections.",
            references: [],
            detectedAt: context.timestamp
          });
        }

        if (
          /^registry\s*=/i.test(line) &&
          !/registry\.npmjs\.org/i.test(line) &&
          !/^registry\s*=\s*https:\/\/registry\.npmjs\.org\/?$/i.test(line)
        ) {
          findings.push({
            id: `integrity-npmrc-custom-registry-${context.scanId}-${slugify(line)}`,
            severity: "low",
            category: "integrity",
            title: "Custom npm registry configured",
            description:
              "A custom npm registry is configured. This changes the package trust boundary and should be explicitly reviewed.",
            evidence: {
              file: npmrcPath,
              line
            },
            remediation:
              "Verify the custom registry is trusted, access-controlled, and configured with appropriate integrity protections.",
            references: [],
            detectedAt: context.timestamp
          });
        }
      }
    } catch {
      return findings;
    }

    return findings;
  }

  private async analyzeWorkflows(context: AnalyzerContext): Promise<Finding[]> {
    const findings: Finding[] = [];

    for (const workflowPath of context.projectFiles.githubWorkflows) {
      try {
        const raw = await readFile(workflowPath, "utf-8");

        findings.push(...this.findUnpinnedActions(raw, workflowPath, context), ...this.findRiskyWorkflowCommands(raw, workflowPath, context));
      } catch {
        continue;
      }
    }

    return findings;
  }

  private findUnpinnedActions(
    raw: string,
    workflowPath: string,
    context: AnalyzerContext
  ): Finding[] {
    const findings: Finding[] = [];
    const actionPattern = /^\s*(?:-\s*)?uses:\s*([^\s#]+)\s*$/gmu;
    let match: RegExpExecArray | null = actionPattern.exec(raw);

    while (match !== null) {
      const usesValue = match[1]!;
      const atIndex = usesValue.lastIndexOf("@");

      if (atIndex > 0) {
        const action = usesValue.slice(0, atIndex);
        const ref = usesValue.slice(atIndex + 1);

        if (!/^[a-f0-9]{40}$/iu.test(ref)) {
          findings.push({
            id: `integrity-workflow-action-${slugify(action)}-${slugify(ref)}`,
            severity: "medium",
            category: "integrity",
            title: "GitHub Action not pinned to commit SHA",
            description:
              `Workflow action "${action}@${ref}" is not pinned to a full commit SHA, which weakens integrity assumptions for CI execution.`,
            evidence: {
              file: workflowPath,
              action,
              ref
            },
            remediation:
              "Pin GitHub Actions to full commit SHAs, especially for security-sensitive workflows.",
            references: [],
            detectedAt: context.timestamp
          });
        }
      }

      match = actionPattern.exec(raw);
    }

    return findings;
  }

  private findRiskyWorkflowCommands(
    raw: string,
    workflowPath: string,
    context: AnalyzerContext
  ): Finding[] {
    const findings: Finding[] = [];

    for (const rule of SCRIPT_PATTERN_RULES) {
      if (!rule.regex.test(raw)) {
        continue;
      }

      findings.push({
        id: `integrity-workflow-command-${slugify(rule.label)}-${slugify(
          workflowPath
        )}`,
        severity: rule.severity,
        category: "integrity",
        title: `Risky workflow command pattern: ${rule.label}`,
        description:
          "The CI workflow contains a command pattern that expands trust boundaries or reduces build determinism.",
        evidence: {
          file: workflowPath,
          matchedRule: rule.label
        },
        remediation: rule.remediation,
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

function slugify(value: string): string {
  return value.toLowerCase().replaceAll(/[^a-z0-9]+/g, "-").replaceAll(/^-+|-+$/g, "");
}