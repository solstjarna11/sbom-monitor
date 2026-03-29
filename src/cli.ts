import { Command } from "commander";
import { createScanCommand } from "./commands/scan";
import { createCompareCommand } from "./commands/compare";
import { createReportCommand } from "./commands/report";
import { AppError, UnknownCliError } from "./utils/errors";
import { logger } from "./utils/logger";

export async function runCli(argv: string[]): Promise<void> {
  const program = new Command();

  program
    .name("sbom-monitor")
    .description("CLI-based software supply chain monitoring tool")
    .version("0.1.0");

  program.addCommand(createScanCommand());
  program.addCommand(createCompareCommand());
  program.addCommand(createReportCommand());

  try {
    await program.parseAsync(argv);
  } catch (error: unknown) {
    const appError =
      error instanceof AppError
        ? error
        : new UnknownCliError("Unexpected CLI failure", { cause: error });

    logger.error(appError.message, {
      code: appError.code,
      details: appError.details
    });

    process.exitCode = appError.exitCode;
  }
}