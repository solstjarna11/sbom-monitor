import { Analyzer, AnalyzerContext } from "./types";
import { Finding } from "../core/types";
import { NecessityAnalyzer } from "./necessity-analyzer";
import { VulnerabilityAnalyzer } from "./vulnerability-analyzer";
import { MaintenanceAnalyzer } from "./maintenance-analyzer";
import { SourceTrustAnalyzer } from "./source-trust-analyzer";

export class AnalyzerEngine {
  private readonly analyzers: Analyzer[] = [
    new NecessityAnalyzer(),
    new VulnerabilityAnalyzer(),
    new MaintenanceAnalyzer(),
    new SourceTrustAnalyzer()
  ];

  public async run(context: AnalyzerContext): Promise<Finding[]> {
    const results: Finding[] = [];

    for (const analyzer of this.analyzers) {
      const findings = await analyzer.analyze(context);
      results.push(...findings);
    }

    return results;
  }
}