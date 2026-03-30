//src/analyzers/analyzer-engine.ts

import { AnalyzerContext, Analyzer } from "./types";
import { Finding } from "../core/types";
import { NecessityAnalyzer } from "./necessity-analyzer";
import { VulnerabilityAnalyzer } from "./vulnerability-analyzer";
import { MaintenanceAnalyzer } from "./maintenance-analyzer";
import { SourceTrustAnalyzer } from "./source-trust-analyzer";
import { IntegrityAnalyzer } from "./integrity-analyzer";

export class AnalyzerEngine {
  private readonly analyzers: Analyzer[] = [
    new NecessityAnalyzer(),
    new VulnerabilityAnalyzer(),
    new MaintenanceAnalyzer(),
    new SourceTrustAnalyzer(),
    new IntegrityAnalyzer()
  ];

  public async run(context: AnalyzerContext): Promise<Finding[]> {
    const findings: Finding[] = [];

    for (const analyzer of this.analyzers) {
      const analyzerFindings = await analyzer.analyze(context);
      findings.push(...analyzerFindings);
    }

    return findings;
  }
}