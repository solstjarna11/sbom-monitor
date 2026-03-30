import { Command } from "commander";
import { ComparisonService } from "../services/comparison-service";
import { ReportService } from "../services/report-service";
import { JsonFileStorageAdapter } from "../storage/json-file-storage-adapter";
import { getDefaultDataRoot } from "../utils/paths";
import { logger } from "../utils/logger";

export function createCompareCommand(): Command {
  const command = new Command("compare");

  command
    .description("Compare two persisted scans")
    .requiredOption("--baseline <scanId>", "Baseline scan id")
    .requiredOption("--target <scanId>", "Target scan id")
    .option(
      "--storage-root <path>",
      "Root directory for JSON storage",
      getDefaultDataRoot()
    )
    .action(async (options: CompareCommandOptions) => {
      const storage = new JsonFileStorageAdapter(options.storageRoot);
      const comparisonService = new ComparisonService(storage);
      const reportService = new ReportService(storage);

      const comparison = await comparisonService.compareScans(
        options.baseline,
        options.target
      );

      await reportService.generateComparisonReportFromReport(comparison);

      logger.info("Comparison completed", {
        comparisonId: comparison.id,
        addedDependencies: comparison.summary.addedDependencyCount,
        removedDependencies: comparison.summary.removedDependencyCount,
        changedDependencies: comparison.summary.changedDependencyCount,
        introducedVulnerabilities:
          comparison.summary.introducedVulnerabilityCount
      });

      process.stdout.write(`${JSON.stringify(comparison, null, 2)}\n`);
    });

  return command;
}

interface CompareCommandOptions {
  baseline: string;
  target: string;
  storageRoot: string;
}