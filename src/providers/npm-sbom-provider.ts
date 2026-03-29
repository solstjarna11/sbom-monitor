// src/providers/npm-sbom-provider.ts

import { readFile } from "node:fs/promises";
import { RepositoryProjectFiles } from "../core/types";
import { runCommand } from "../utils/command";
import { InvalidRepositoryError } from "../utils/errors";

export interface GenerateSbomInput {
  repositoryPath: string;
  projectFiles: RepositoryProjectFiles;
}

export class NpmSbomProvider {
  public async generateSbom(
    input: GenerateSbomInput
  ): Promise<Record<string, unknown> | undefined> {
    const lockfilePath =
      input.projectFiles.packageLockJson ?? input.projectFiles.npmShrinkwrapJson;

    const hasLockfile = lockfilePath !== undefined;

    if (lockfilePath !== undefined) {
      await this.validateJsonFile(lockfilePath);
    }

    const args = hasLockfile
      ? ["sbom", "--sbom-format", "cyclonedx", "--json", "--package-lock-only"]
      : ["sbom", "--sbom-format", "cyclonedx", "--json"];

    try {
      const stdout = await runCommand("npm", args, {
        cwd: input.repositoryPath
      });

      return JSON.parse(stdout) as Record<string, unknown>;
    } catch (error) {
      if (!hasLockfile) {
        return undefined;
      }

      throw error;
    }
  }

  private async validateJsonFile(filePath: string): Promise<void> {
    try {
      const raw = await readFile(filePath, "utf-8");
      JSON.parse(raw);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : String(error);

      throw new InvalidRepositoryError(`Lockfile is not valid JSON: ${filePath}`, {
        code: "INVALID_LOCKFILE",
        cause: error,
        details: {
          filePath,
          parseError: message
        },
        exitCode: 2
      });
    }
  }
}