import { Command } from "commander";
import { ReportService } from "../services/report-service";
import { JsonFileStorageAdapter } from "../storage/json-file-storage-adapter";
import { getDefaultDataRoot } from "../utils/paths";
import { logger } from "../utils/logger";

export function createReportCommand(): Command {
  const command = new Command("report");

  command
    .description("Generate a JSON report for a persisted scan")
    .requiredOption("--scan <scanId>", "Scan id to report on")
    .option(
      "--storage-root <path>",
      "Root directory for JSON storage",
      getDefaultDataRoot()
    )
    .action(async (options: ReportCommandOptions) => {
      const storage = new JsonFileStorageAdapter(options.storageRoot);
      const service = new ReportService(storage);

      const report = await service.generateScanReport(options.scan);

      logger.info("Report generated", {
        scanId: report.metadata.id,
        totalComponents: report.summary.totalComponents,
        totalFindings: report.summary.totalFindings
      });

      process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    });

  return command;
}

interface ReportCommandOptions {
  scan: string;
  storageRoot: string;
}