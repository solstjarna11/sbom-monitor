import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { ToolExecutionError } from "./errors";

const execFileAsync = promisify(execFile);

export async function runNpmJsonCommand(
  args: string[],
  cwd: string
): Promise<unknown> {
  try {
    const result = await execFileAsync("npm", args, {
      cwd,
      maxBuffer: 1024 * 1024 * 50
    });

    return parseJsonOutput(result.stdout, args, cwd);
  } catch (error: unknown) {
    const stdout =
      typeof error === "object" &&
      error !== null &&
      "stdout" in error &&
      typeof (error as { stdout?: unknown }).stdout === "string"
        ? (error as { stdout: string }).stdout
        : "";

    if (stdout.trim().length > 0) {
      return parseJsonOutput(stdout, args, cwd);
    }

    throw new ToolExecutionError(`npm command failed: npm ${args.join(" ")}`, {
      cause: error,
      details: {
        args,
        cwd
      },
      exitCode: 2
    });
  }
}

function parseJsonOutput(output: string, args: string[], cwd: string): unknown {
  const trimmed = output.trim();

  if (trimmed.length === 0) {
    return {};
  }

  try {
    return JSON.parse(trimmed) as unknown;
  } catch (error: unknown) {
    throw new ToolExecutionError(
      `Failed to parse JSON output from npm ${args.join(" ")}`,
      {
        cause: error,
        details: {
          args,
          cwd,
          output: trimmed.slice(0, 2000)
        },
        exitCode: 2
      }
    );
  }
}