import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { ToolExecutionError } from "./errors";

const execFileAsync = promisify(execFile);

export interface RunCommandOptions {
  cwd?: string;
}

export async function runCommand(
  command: string,
  args: string[],
  options: RunCommandOptions = {}
): Promise<string> {
  try {
    const result = await execFileAsync(command, args, {
      cwd: options.cwd,
      maxBuffer: 1024 * 1024 * 50
    });

    return result.stdout.trim();
  } catch (error: unknown) {
    throw new ToolExecutionError(`Command failed: ${command} ${args.join(" ")}`, {
      cause: error,
      details: {
        command,
        args,
        cwd: options.cwd
      }
    });
  }
}