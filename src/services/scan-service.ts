import path from "node:path";
import { buildScanSummary } from "../core/models";
import { prepareRepository, PrepareRepositoryInput } from "../core/repository-intake";
import { ScanMetadata, ScanRecord } from "../core/types";
import { StorageAdapter } from "../storage/storage-adapter";

export interface CreateInitialScanInput {
  repositoryPath: string;
  repositoryName?: string;
  scanId?: string;
  selectedRef?: string;
}

export class ScanService {
  public constructor(private readonly storage: StorageAdapter) {}

  public async createInitialScan(
    input: CreateInitialScanInput
  ): Promise<ScanRecord> {
    const scanTimestamp = new Date().toISOString();
    const scanId = input.scanId ?? `scan-${Date.now()}`;
    const artifactsRoot = this.storage.getRootDirectory();

    const prepareInput: PrepareRepositoryInput = {
      repositoryPathOrUrl: input.repositoryPath,
      artifactsRoot,
      scanId,
      scanTimestamp
    };

    if (input.repositoryName !== undefined) {
      prepareInput.repositoryName = input.repositoryName;
    }

    if (input.selectedRef !== undefined) {
      prepareInput.selectedRef = input.selectedRef;
    }

    const preparedRepository = await prepareRepository(prepareInput);

    const scanRoot = await this.storage.createScanDirectory(
      preparedRepository.repository.slug,
      scanId
    );

    const metadata: ScanMetadata = {
      id: scanId,
      repositoryId: preparedRepository.repository.id,
      scanRoot,
      startedAt: scanTimestamp,
      completedAt: scanTimestamp,
      status: "prepared",
      toolVersion: "0.1.0",
      scannerName: "sbom-monitor",
      notes: [
        "Repository prepared and metadata saved.",
        "SBOM generation and analyzers are not implemented in this stage."
      ]
    };

    const scan: ScanRecord = {
      repository: preparedRepository.repository,
      metadata,
      components: [],
      dependencyEdges: [],
      findings: [],
      summary: buildScanSummary({
        components: [],
        findings: []
      })
    };

    await this.storage.saveScan(scan);
    return scan;
  }

  public static getScanMetadataFilePath(
    artifactsRoot: string,
    repositorySlug: string,
    scanId: string
  ): string {
    return path.join(artifactsRoot, "scans", repositorySlug, scanId, "metadata.json");
  }
}