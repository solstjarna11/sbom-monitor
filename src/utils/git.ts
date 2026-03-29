// src/utils/git.ts

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { GitCommandError, InvalidRepositoryError } from "./errors";

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
    const stderr =
      typeof error === "object" &&
      error !== null &&
      "stderr" in error &&
      typeof (error as { stderr?: unknown }).stderr === "string"
        ? (error as { stderr: string }).stderr
        : "";

    const normalizedStderr = stderr.toLowerCase();

    const isRevParseHead =
      args.length === 2 && args[0] === "rev-parse" && args[1] === "HEAD";

    if (
      isRevParseHead &&
      (normalizedStderr.includes("unknown revision or path not in the working tree") ||
        normalizedStderr.includes("ambiguous argument 'head'") ||
        normalizedStderr.includes("bad revision 'head'") ||
        normalizedStderr.includes("needed a single revision"))
    ) {
      throw new InvalidRepositoryError("Repository has no commits yet.", {
        code: "EMPTY_GIT_REPOSITORY",
        cause: error,
        details: {
          args,
          cwd: options.cwd,
          stderr
        },
        exitCode: 2
      });
    }

    throw new GitCommandError(`Git command failed: git ${args.join(" ")}`, {
      cause: error,
      details: {
        args,
        cwd: options.cwd,
        stderr
      }
    });
  }
}