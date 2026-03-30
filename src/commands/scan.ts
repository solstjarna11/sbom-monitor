import { Command } from "commander";
import { ScanService } from "../services/scan-service";
import { JsonFileStorageAdapter } from "../storage/json-file-storage-adapter";
import { getDefaultDataRoot } from "../utils/paths";
import { logger } from "../utils/logger";

export function createScanCommand(): Command {
  const command = new Command("scan");

  command
    .description("Create and persist a scan snapshot for a repository")
    .requiredOption("-r, --repo <path>", "Path to the repository to scan")
    .option("--repo-name <name>", "Optional display name for the repository")
    .option(
      "--scan-id <id>",
      "Optional scan identifier; defaults to a timestamp-based id"
    )
    .option(
      "--selected-ref <ref>",
      "Optional git branch, tag, or commit hash to scan"
    )
    .option(
      "--storage-root <path>",
      "Root directory for JSON storage",
      getDefaultDataRoot()
    )
    .action(async (options: ScanCommandOptions) => {
      const storage = new JsonFileStorageAdapter(options.storageRoot);
      const service = new ScanService(storage);

      const input: CreateInitialScanCommandInput = {
        repositoryPath: options.repo
      };

      if (options.repoName !== undefined) {
        input.repositoryName = options.repoName;
      }

      if (options.scanId !== undefined) {
        input.scanId = options.scanId;
      }

      if (options.selectedRef !== undefined) {
        input.selectedRef = options.selectedRef;
      }

      const result = await service.createInitialScan(input);

      logger.info("Scan completed", {
        scanId: result.metadata.id,
        selectedRef: result.metadata.selectedRef,
        repository: result.repository.name,
        findings: result.summary.findingsBySeverity
      });

      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    });

  return command;
}

interface ScanCommandOptions {
  repo: string;
  repoName?: string;
  scanId?: string;
  selectedRef?: string;
  storageRoot: string;
}

interface CreateInitialScanCommandInput {
  repositoryPath: string;
  repositoryName?: string;
  scanId?: string;
  selectedRef?: string;
}