import { mkdir, readdir, stat } from "node:fs/promises";
import path from "node:path";
import {
  RepositoryMetadata,
  RepositoryProjectFiles,
  RepositorySourceType
} from "./types";
import {
  InvalidRepositoryError,
  RepositoryPreparationError
} from "../utils/errors";
import { runGitCommand } from "../utils/git";
import { pathExists, toAbsolutePath } from "../utils/paths";

export interface PrepareRepositoryInput {
  repositoryPathOrUrl: string;
  repositoryName?: string;
  selectedRef?: string;
  artifactsRoot: string;
  scanId: string;
  scanTimestamp: string;
}

export interface PreparedRepository {
  repository: RepositoryMetadata;
  workingDirectory: string;
}

export async function prepareRepository(
  input: PrepareRepositoryInput
): Promise<PreparedRepository> {
  const sourceType = detectRepositorySourceType(input.repositoryPathOrUrl);
  const repoSlug = buildRepositorySlug(input.repositoryPathOrUrl);
  const repositoryName = input.repositoryName ?? repoSlug;

  let workingDirectory: string;
  let remoteUrl: string | undefined;

  if (sourceType === "git-url") {
    workingDirectory = path.join(
      input.artifactsRoot,
      ".workdirs",
      repoSlug,
      input.scanId,
      "repo"
    );

    await mkdir(path.dirname(workingDirectory), { recursive: true });

    await runGitCommand([
      "clone",
      "--quiet",
      input.repositoryPathOrUrl,
      workingDirectory
    ]);

    if (input.selectedRef !== undefined) {
      await runGitCommand(["checkout", input.selectedRef], {
        cwd: workingDirectory
      });
    }

    remoteUrl = input.repositoryPathOrUrl;
  } else {
    const absolutePath = toAbsolutePath(input.repositoryPathOrUrl);
    await validateLocalRepositoryPath(absolutePath);
    workingDirectory = absolutePath;
    remoteUrl = await tryReadRemoteUrl(workingDirectory);
  }

  await validateGitRepository(workingDirectory);

  const selectedRef =
    input.selectedRef ?? (await tryReadCurrentRef(workingDirectory)) ?? "HEAD";

  const commitHash = await runGitCommand(["rev-parse", "HEAD"], {
    cwd: workingDirectory
  });

  const projectFiles = await detectRepositoryProjectFiles(workingDirectory);

  if (!(await pathExists(projectFiles.packageJson))) {
    throw new InvalidRepositoryError(
      `package.json not found in repository root: ${workingDirectory}`
    );
  }

  const repositoryBase: RepositoryMetadata = {
    id: repoSlug,
    slug: repoSlug,
    name: repositoryName,
    path: workingDirectory,
    source: input.repositoryPathOrUrl,
    sourceType,
    commitHash,
    selectedRef,
    ecosystem: "npm",
    manifestFiles: collectManifestFiles(projectFiles, workingDirectory),
    projectFiles,
    createdAt: input.scanTimestamp
  };

  const repository: RepositoryMetadata = {
    ...repositoryBase,
    ...(selectedRef === "HEAD" ? {} : { branch: selectedRef }),
    ...(remoteUrl === undefined ? {} : { remoteUrl })
  };

  return {
    repository,
    workingDirectory
  };
}

function detectRepositorySourceType(
  repositoryPathOrUrl: string
): RepositorySourceType {
  if (isGitUrl(repositoryPathOrUrl)) {
    return "git-url";
  }

  return "local";
}

function isGitUrl(value: string): boolean {
  return /^(https?:\/\/|git@|ssh:\/\/)/i.test(value) || value.endsWith(".git");
}

function buildRepositorySlug(repositoryPathOrUrl: string): string {
  const normalized = repositoryPathOrUrl.replace(/\/+$/, "");
  const baseName = path.basename(normalized).replace(/\.git$/i, "");
  const fallback = baseName.length > 0 ? baseName : "repository";

  return fallback
    .toLowerCase()
    .replaceAll(/[^a-z0-9._-]+/g, "-")
    .replaceAll(/^-+|-+$/g, "");
}

async function validateLocalRepositoryPath(repositoryPath: string): Promise<void> {
  if (!(await pathExists(repositoryPath))) {
    throw new InvalidRepositoryError(
      `Repository path does not exist: ${repositoryPath}`
    );
  }

  const repositoryStat = await stat(repositoryPath);
  if (!repositoryStat.isDirectory()) {
    throw new InvalidRepositoryError(
      `Repository path is not a directory: ${repositoryPath}`
    );
  }
}

async function validateGitRepository(repositoryPath: string): Promise<void> {
  try {
    await runGitCommand(["rev-parse", "--is-inside-work-tree"], {
      cwd: repositoryPath
    });
  } catch (error: unknown) {
    throw new InvalidRepositoryError(
      `Not a valid Git repository: ${repositoryPath}`,
      {
        cause: error
      }
    );
  }
}

async function tryReadCurrentRef(
  repositoryPath: string
): Promise<string | undefined> {
  try {
    const ref = await runGitCommand(["symbolic-ref", "--short", "HEAD"], {
      cwd: repositoryPath
    });
    return ref.length > 0 ? ref : undefined;
  } catch {
    return undefined;
  }
}

async function tryReadRemoteUrl(
  repositoryPath: string
): Promise<string | undefined> {
  try {
    const remoteUrl = await runGitCommand(["config", "--get", "remote.origin.url"], {
      cwd: repositoryPath
    });
    return remoteUrl.length > 0 ? remoteUrl : undefined;
  } catch {
    return undefined;
  }
}

async function detectRepositoryProjectFiles(
  repositoryPath: string
): Promise<RepositoryProjectFiles> {
  const workflowsDirectory = path.join(repositoryPath, ".github", "workflows");
  const githubWorkflows =
    (await pathExists(workflowsDirectory)) &&
    (await stat(workflowsDirectory)).isDirectory()
      ? await listWorkflowFiles(workflowsDirectory)
      : [];

  const projectFilesBase: RepositoryProjectFiles = {
    packageJson: path.join(repositoryPath, "package.json"),
    githubWorkflows
  };

  const packageLockJsonPath = path.join(repositoryPath, "package-lock.json");
  const npmShrinkwrapJsonPath = path.join(repositoryPath, "npm-shrinkwrap.json");
  const npmrcPath = path.join(repositoryPath, ".npmrc");

  return {
    ...projectFilesBase,
    ...((await pathExists(packageLockJsonPath))
      ? { packageLockJson: packageLockJsonPath }
      : {}),
    ...((await pathExists(npmShrinkwrapJsonPath))
      ? { npmShrinkwrapJson: npmShrinkwrapJsonPath }
      : {}),
    ...((await pathExists(npmrcPath)) ? { npmrc: npmrcPath } : {})
  };
}

async function listWorkflowFiles(workflowsDirectory: string): Promise<string[]> {
  try {
    const entries = await readdir(workflowsDirectory, { withFileTypes: true });

    return entries
      .filter(
        (entry) =>
          entry.isFile() &&
          (entry.name.endsWith(".yml") || entry.name.endsWith(".yaml"))
      )
      .map((entry) => path.join(workflowsDirectory, entry.name))
      .sort((left, right) => left.localeCompare(right));
  } catch (error: unknown) {
    throw new RepositoryPreparationError(
      `Failed to inspect workflow files in: ${workflowsDirectory}`,
      {
        cause: error
      }
    );
  }
}

function collectManifestFiles(
  projectFiles: RepositoryProjectFiles,
  repositoryPath: string
): string[] {
  const files = [
    projectFiles.packageJson,
    projectFiles.packageLockJson,
    projectFiles.npmShrinkwrapJson,
    projectFiles.npmrc,
    ...projectFiles.githubWorkflows
  ].filter((filePath): filePath is string => filePath !== undefined);

  return files
    .map((filePath) => path.relative(repositoryPath, filePath))
    .sort((left, right) => left.localeCompare(right));
}