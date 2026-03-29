import path from "node:path";
import {
  ComponentRecord,
  Finding,
  RepositoryMetadata,
  ScanMetadata,
  ScanRecord
} from "../core/types";
import { buildScanSummary } from "../core/models";
import { StorageAdapter } from "../storage/storage-adapter";
import { RepositoryNotFoundError } from "../utils/errors";
import { pathExists, toAbsolutePath } from "../utils/paths";

export interface CreateInitialScanInput {
  repositoryPath: string;
  repositoryName?: string;
  scanId?: string;
}

export class ScanService {
  public constructor(private readonly storage: StorageAdapter) {}

  public async createInitialScan(
    input: CreateInitialScanInput
  ): Promise<ScanRecord> {
    const repositoryPath = toAbsolutePath(input.repositoryPath);

    if (!(await pathExists(repositoryPath))) {
      throw new RepositoryNotFoundError(
        `Repository path does not exist: ${repositoryPath}`
      );
    }

    const now = new Date().toISOString();
    const repositoryId = this.buildRepositoryId(repositoryPath);
    const scanId = input.scanId ?? `scan-${Date.now()}`;

    const repository: RepositoryMetadata = {
      id: repositoryId,
      name: input.repositoryName ?? path.basename(repositoryPath),
      path: repositoryPath,
      ecosystem: "npm",
      manifestFiles: [],
      createdAt: now
    };

    const metadata: ScanMetadata = {
      id: scanId,
      repositoryId,
      startedAt: now,
      completedAt: now,
      status: "completed",
      toolVersion: "0.1.0",
      scannerName: "sbom-monitor",
      notes: [
        "Initial scaffold scan; external integrations are intentionally not implemented in this stage."
      ]
    };

    const components: ComponentRecord[] = [];
    const findings: Finding[] = [];

    const scan: ScanRecord = {
      repository,
      metadata,
      components,
      dependencyEdges: [],
      findings,
      summary: buildScanSummary({
        components,
        findings
      })
    };

    await this.storage.saveScan(scan);
    return scan;
  }

  private buildRepositoryId(repositoryPath: string): string {
    return repositoryPath.replaceAll(/[^\w.-]+/g, "_");
  }
}