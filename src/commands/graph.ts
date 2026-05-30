import { Command } from "commander";
import { GraphService, GraphOutputFormat } from "../services/graph-service";
import { JsonFileStorageAdapter } from "../storage/json-file-storage-adapter";
import { getDefaultDataRoot } from "../utils/paths";
import { logger } from "../utils/logger";
import { ValidationError } from "../utils/errors";

export function createGraphCommand(): Command {
  const command = new Command("graph");

  command
    .description("Generate a visual dependency graph from a persisted scan")
    .requiredOption("--scan <scanId>", "Scan id to visualize")
    .option(
      "--direct-only",
      "Only include root -> direct dependency edges and direct dependency nodes"
    )
    .option(
      "--max-nodes <n>",
      "Maximum number of package nodes to include",
      parsePositiveInteger
    )
    .option(
      "--format <format>",
      "Output format: dot or svg (DOT is always generated; SVG is attempted when format=svg)",
      "svg"
    )
    .option(
      "--storage-root <path>",
      "Root directory for JSON storage",
      getDefaultDataRoot()
    )
    .action(async (options: GraphCommandOptions) => {
      const format = normalizeFormat(options.format);
      const storage = new JsonFileStorageAdapter(options.storageRoot);
      const service = new GraphService(storage);

      const result = await service.generateGraph({
        scanId: options.scan,
        directOnly: options.directOnly === true,
        maxNodes: options.maxNodes,
        format
      });

      logger.info("Graph generation completed", {
        scanId: options.scan,
        dotPath: result.dotPath,
        svgPath: result.svgPath,
        warnings: result.warnings
      });

      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    });

  return command;
}

interface GraphCommandOptions {
  scan: string;
  directOnly?: boolean;
  maxNodes?: number;
  format: string;
  storageRoot: string;
}

function parsePositiveInteger(value: string): number {
  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new ValidationError(`Invalid --max-nodes value: ${value}`);
  }

  return parsed;
}

function normalizeFormat(value: string): GraphOutputFormat {
  if (value === "dot" || value === "svg") {
    return value;
  }

  throw new ValidationError(`Invalid --format value: ${value}`);
}