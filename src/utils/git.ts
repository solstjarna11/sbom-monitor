import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { GitCommandError } from "./errors";

const execFileAsync = promisify(execFile);

export interface RunGitCommandOptions {
  cwd?: string;
}

export async function runGitCommand(
  args: string[],
  options: RunGitCommandOptions = {}
): Promise<string> {
  try {
    const result = await execFileAsync("git", args, {
      cwd: options.cwd
    });

    return result.stdout.trim();
  } catch (error: unknown) {
    throw new GitCommandError(`Git command failed: git ${args.join(" ")}`, {
      cause: error,
      details: {
        args,
        cwd: options.cwd
      }
    });
  }
}