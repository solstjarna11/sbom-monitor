import path from "node:path";
import { buildScanSummary } from "../core/models";
import { prepareRepository, PrepareRepositoryInput } from "../core/repository-intake";
import { ScanMetadata, ScanRecord } from "../core/types";
import { NpmDependencyGraphProvider } from "../providers/npm-dependency-graph-provider";
import { NpmSbomProvider } from "../providers/npm-sbom-provider";
import { StorageAdapter } from "../storage/storage-adapter";

export interface CreateInitialScanInput {
  repositoryPath: string;
  repositoryName?: string;
  scanId?: string;
  selectedRef?: string;
}

export class ScanService {
  private readonly sbomProvider = new NpmSbomProvider();
  private readonly dependencyGraphProvider = new NpmDependencyGraphProvider();

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

    const sbom = await this.sbomProvider.generateSbom({
      repositoryPath: preparedRepository.workingDirectory,
      projectFiles: preparedRepository.repository.projectFiles,
    });

    const dependencyGraph =
      await this.dependencyGraphProvider.generateDependencyGraph({
        repositoryId: preparedRepository.repository.id,
        repositoryPath: preparedRepository.workingDirectory,
        projectFiles: preparedRepository.repository.projectFiles,
        scanId,
        generatedAt: scanTimestamp
      });

    const metadata: ScanMetadata = {
      id: scanId,
      repositoryId: preparedRepository.repository.id,
      scanRoot,
      startedAt: scanTimestamp,
      completedAt: new Date().toISOString(),
      status: "completed",
      toolVersion: "0.1.0",
      scannerName: "sbom-monitor",
      notes: [
        "Repository prepared.",
        "CycloneDX SBOM generated for npm project.",
        "Normalized dependency graph generated from npm lockfile or dependency tree."
      ]
    };

    const scan: ScanRecord = {
      repository: preparedRepository.repository,
      metadata,
      components: dependencyGraph.components,
      dependencyEdges: dependencyGraph.edges,
      findings: [],
      summary: buildScanSummary({
        components: dependencyGraph.components,
        findings: []
      })
    };

    if (sbom !== undefined) {
      await this.storage.saveSbom(scan.repository.slug, scan.metadata.id, sbom);
    }
    await this.storage.saveDependencyGraph(
      scan.repository.slug,
      scan.metadata.id,
      dependencyGraph
    );
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