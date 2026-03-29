import { Analyzer, AnalyzerContext } from "./types";
import { Finding } from "../core/types";

export class MaintenanceAnalyzer implements Analyzer {
  public name = "maintenance";

  public async analyze(context: AnalyzerContext): Promise<Finding[]> {
    const findings: Finding[] = [];

    for (const component of context.components) {
      if (component.metadata?.deprecated === true) {
        findings.push({
          id: `deprecated-${component.id}`,
          componentId: component.id,
          severity: "medium",
          category: "maintenance",
          title: "Deprecated package",
          description: `Package "${component.name}" is deprecated.`,
          evidence: component.metadata,
          remediation: "Replace with a maintained alternative.",
          references: [],
          detectedAt: context.timestamp
        });
      }
    }

    return findings;
  }
}