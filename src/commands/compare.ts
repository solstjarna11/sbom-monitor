import { Command } from "commander";
import { ComparisonService } from "../services/comparison-service";
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
      const service = new ComparisonService(storage);

      const report = await service.compareScans(
        options.baseline,
        options.target
      );

      logger.info("Comparison completed", {
        baselineScanId: report.baselineScanId,
        targetScanId: report.targetScanId,
        newComponents: report.newComponents.length,
        removedComponents: report.removedComponents.length,
        changedComponents: report.changedComponents.length
      });

      process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    });

  return command;
}

interface CompareCommandOptions {
  baseline: string;
  target: string;
  storageRoot: string;
}