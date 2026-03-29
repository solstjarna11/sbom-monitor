import { Analyzer, AnalyzerContext } from "./types";
import { Finding } from "../core/types";

export class NecessityAnalyzer implements Analyzer {
  public name = "necessity";

  public async analyze(context: AnalyzerContext): Promise<Finding[]> {
    const findings: Finding[] = [];

    for (const component of context.components) {
      if (component.direct && component.devDependency) {
        findings.push({
          id: `necessity-dev-${component.id}`,
          componentId: component.id,
          severity: "low",
          category: "necessity",
          title: "Dev dependency present in production scope",
          description: `Dependency "${component.name}" is marked as development but included as direct dependency.`,
          evidence: {
            component
          },
          remediation: "Ensure devDependencies are not required in production builds.",
          references: [],
          detectedAt: context.timestamp
        });
      }
    }

    return findings;
  }
}