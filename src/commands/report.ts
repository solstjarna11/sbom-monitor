import { Command } from "commander";
import { ReportService } from "../services/report-service";
import { JsonFileStorageAdapter } from "../storage/json-file-storage-adapter";
import { getDefaultDataRoot } from "../utils/paths";
import { ValidationError } from "../utils/errors";

export function createReportCommand(): Command {
  const command = new Command("report");

  command
    .description("Generate a Markdown report for a stored scan or comparison")
    .option("--scan <scanId>", "Scan id to report on")
    .option("--comparison <comparisonId>", "Comparison report id to render")
    .option(
      "--storage-root <path>",
      "Root directory for JSON storage",
      getDefaultDataRoot()
    )
    .action(async (options: ReportCommandOptions) => {
      const selectedCount =
        Number(options.scan !== undefined) +
        Number(options.comparison !== undefined);

      if (selectedCount !== 1) {
        throw new ValidationError(
          "Provide exactly one of --scan or --comparison."
        );
      }

      const storage = new JsonFileStorageAdapter(options.storageRoot);
      const service = new ReportService(storage);

      if (options.scan !== undefined) {
        const result = await service.generateScanReport(options.scan);
        process.stdout.write(`${result.markdown}\n`);
        return;
      }

      const result = await service.generateComparisonReport(
        options.comparison as string
      );
      process.stdout.write(`${result.markdown}\n`);
    });

  return command;
}

interface ReportCommandOptions {
  scan?: string;
  comparison?: string;
  storageRoot: string;
}