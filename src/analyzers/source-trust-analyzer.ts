import { Analyzer, AnalyzerContext } from "./types";
import { Finding } from "../core/types";
import { readFile } from "node:fs/promises";
import path from "node:path";

export class SourceTrustAnalyzer implements Analyzer {
  public name = "source-trust";

  public async analyze(context: AnalyzerContext): Promise<Finding[]> {
    const findings: Finding[] = [];

    try {
      const packageJsonPath = path.join(context.repositoryPath, "package.json");
      const raw = await readFile(packageJsonPath, "utf-8");
      const pkg = JSON.parse(raw);

      for (const [name, version] of Object.entries<string>(pkg.dependencies ?? {})) {
        if (version.startsWith("^") || version.startsWith("~")) {
          findings.push({
            id: `semver-${name}`,
            severity: "low",
            category: "source-trust",
            title: "Loose semver range",
            description: `${name} uses non-pinned version "${version}"`,
            evidence: { name, version },
            remediation: "Pin dependency versions to exact versions.",
            references: [],
            detectedAt: context.timestamp
          });
        }

        if (version.includes("git") || version.includes("http")) {
          findings.push({
            id: `source-${name}`,
            severity: "medium",
            category: "source-trust",
            title: "Non-standard dependency source",
            description: `${name} is installed from a non-registry source`,
            evidence: { name, version },
            remediation: "Use registry-published versions when possible.",
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
}