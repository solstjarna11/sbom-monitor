import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  ComparisonReport,
  DependencyGraphRecord,
  Finding,
  ScanRecord,
  ScanSummary
} from "../core/types";
import { buildScanSummary } from "../core/models";
import { StorageAdapter } from "./storage-adapter";
import { StorageError } from "../utils/errors";
import { pathExists } from "../utils/paths";

interface PersistedScanMetadataFile {
  repository: ScanRecord["repository"];
  metadata: ScanRecord["metadata"];
}

export class JsonFileStorageAdapter implements StorageAdapter {
  private readonly scansDir: string;
  private readonly comparisonsDir: string;
  //private readonly reportsDir: string;

  public constructor(private readonly rootDir: string) {
    this.scansDir = path.join(rootDir, "scans");
    this.comparisonsDir = path.join(rootDir, "comparisons");
    //this.reportsDir = path.join(rootDir, "reports");
  }

  public getRootDirectory(): string {
    return this.rootDir;
  }

  public async createScanDirectory(
    repositorySlug: string,
    scanId: string
  ): Promise<string> {
    await this.ensureDirectories();
    const scanDir = this.getScanDirectory(repositorySlug, scanId);
    await mkdir(scanDir, { recursive: true });
    return scanDir;
  }

  public async saveScan(scan: ScanRecord): Promise<void> {
    await this.ensureDirectories();

    const scanDir = await this.createScanDirectory(
      scan.repository.slug,
      scan.metadata.id
    );

    const filePath = path.join(scanDir, "metadata.json");
    const persisted: PersistedScanMetadataFile = {
      repository: scan.repository,
      metadata: scan.metadata
    };

    await this.writeJson(filePath, persisted);
  }

  public async saveSbom(
    repositorySlug: string,
    scanId: string,
    sbom: Record<string, unknown>
  ): Promise<void> {
    const scanDir = await this.createScanDirectory(repositorySlug, scanId);
    const filePath = path.join(scanDir, "sbom.cdx.json");
    await this.writeJson(filePath, sbom);
  }

  public async saveDependencyGraph(
    repositorySlug: string,
    scanId: string,
    graph: DependencyGraphRecord
  ): Promise<void> {
    const scanDir = await this.createScanDirectory(repositorySlug, scanId);
    const filePath = path.join(scanDir, "dependency-graph.json");
    await this.writeJson(filePath, graph);
  }

  public async saveFindings(
    repositorySlug: string,
    scanId: string,
    findings: Finding[]
  ): Promise<void> {
    const scanDir = await this.createScanDirectory(repositorySlug, scanId);
    const filePath = path.join(scanDir, "findings.json");
    await this.writeJson(filePath, findings);
  }

  public async saveSummary(
    repositorySlug: string,
    scanId: string,
    summary: ScanSummary
  ): Promise<void> {
    const scanDir = await this.createScanDirectory(repositorySlug, scanId);
    const filePath = path.join(scanDir, "summary.json");
    await this.writeJson(filePath, summary);
  }

  public async saveScanReport(
    repositorySlug: string,
    scanId: string,
    markdown: string
  ): Promise<void> {
    const scanDir = await this.createScanDirectory(repositorySlug, scanId);
    const filePath = path.join(scanDir, "report.md");
    await this.writeText(filePath, markdown);
  }

  public async saveComparison(report: ComparisonReport): Promise<void> {
    await this.ensureDirectories();
    const comparisonDir = this.getComparisonDirectory(report.repositorySlug);
    await mkdir(comparisonDir, { recursive: true });
    const filePath = path.join(comparisonDir, `${report.id}.json`);
    await this.writeJson(filePath, report);
  }

  public async saveComparisonReport(
    repositorySlug: string,
    comparisonId: string,
    markdown: string
  ): Promise<void> {
    await this.ensureDirectories();
    const comparisonDir = this.getComparisonDirectory(repositorySlug);
    await mkdir(comparisonDir, { recursive: true });
    const filePath = path.join(comparisonDir, `${comparisonId}.md`);
    await this.writeText(filePath, markdown);
  }

  public async getScan(scanId: string): Promise<ScanRecord> {
    await this.ensureDirectories();

    const metadataFilePath = await this.findScanMetadataFile(scanId);
    const persisted = await this.readJson<PersistedScanMetadataFile>(
      metadataFilePath,
      `Scan not found: ${scanId}`
    );

    const scanDir = path.dirname(metadataFilePath);
    const dependencyGraphPath = path.join(scanDir, "dependency-graph.json");
    const findingsPath = path.join(scanDir, "findings.json");
    const summaryPath = path.join(scanDir, "summary.json");

    const dependencyGraph = (await pathExists(dependencyGraphPath))
      ? await this.readJson<DependencyGraphRecord>(
          dependencyGraphPath,
          `Dependency graph not found for scan: ${scanId}`
        )
      : undefined;

    const findings = (await pathExists(findingsPath))
      ? await this.readJson<Finding[]>(
          findingsPath,
          `Findings not found for scan: ${scanId}`
        )
      : [];

    const storedSummary = (await pathExists(summaryPath))
      ? await this.readJson<ScanSummary>(
          summaryPath,
          `Summary not found for scan: ${scanId}`
        )
      : undefined;

    const components = dependencyGraph?.components ?? [];
    const dependencyEdges = dependencyGraph?.edges ?? [];
    const summary =
      storedSummary ??
      buildScanSummary({
        components,
        findings
      });

    return {
      repository: persisted.repository,
      metadata: persisted.metadata,
      components,
      dependencyEdges,
      findings,
      summary
    };
  }

  public async listScans(): Promise<ScanRecord[]> {
    await this.ensureDirectories();

    const repositoryEntries = await readdir(this.scansDir, { withFileTypes: true });
    const scans: ScanRecord[] = [];

    for (const repositoryEntry of repositoryEntries) {
      if (!repositoryEntry.isDirectory()) {
        continue;
      }

      const repositoryPath = path.join(this.scansDir, repositoryEntry.name);
      const scanEntries = await readdir(repositoryPath, { withFileTypes: true });

      for (const scanEntry of scanEntries) {
        if (!scanEntry.isDirectory()) {
          continue;
        }

        const scanDir = path.join(repositoryPath, scanEntry.name);
        const scan = await this.tryLoadScanFromDirectory(scanDir);

        if (scan !== undefined) {
          scans.push(scan);
        }
      }
    }

    return scans.sort((left, right) =>
      left.metadata.startedAt.localeCompare(right.metadata.startedAt)
    );
  }

  public async getComparison(reportId: string): Promise<ComparisonReport> {
    await this.ensureDirectories();

    const repositoryEntries = await readdir(this.comparisonsDir, {
      withFileTypes: true
    });

    for (const repositoryEntry of repositoryEntries) {
      if (!repositoryEntry.isDirectory()) {
        continue;
      }

      const filePath = path.join(
        this.comparisonsDir,
        repositoryEntry.name,
        `${reportId}.json`
      );

      if (!(await pathExists(filePath))) {
        continue;
      }

      return this.readJson<ComparisonReport>(
        filePath,
        `Comparison report not found: ${reportId}`
      );
    }

    throw new StorageError(`Comparison report not found: ${reportId}`, {
      details: { reportId }
    });
  }

  private getScanDirectory(repositorySlug: string, scanId: string): string {
    return path.join(this.scansDir, repositorySlug, scanId);
  }

  private getComparisonDirectory(repositorySlug: string): string {
    return path.join(this.comparisonsDir, repositorySlug);
  }

  private async tryLoadScanFromDirectory(
    scanDir: string
  ): Promise<ScanRecord | undefined> {
    const metadataFilePath = path.join(scanDir, "metadata.json");
    const dependencyGraphPath = path.join(scanDir, "dependency-graph.json");
    const findingsPath = path.join(scanDir, "findings.json");
    const summaryPath = path.join(scanDir, "summary.json");

    try {
      const persisted = await this.readJson<PersistedScanMetadataFile>(
        metadataFilePath,
        `Unable to read scan metadata file: ${metadataFilePath}`
      );

      const dependencyGraph = await this.readOptionalJson<DependencyGraphRecord>(
        dependencyGraphPath,
        `Unable to read dependency graph file: ${dependencyGraphPath}`
      );

      const findings =
        (await this.readOptionalJson<Finding[]>(
          findingsPath,
          `Unable to read findings file: ${findingsPath}`
        )) ?? [];

      const storedSummary = await this.readOptionalJson<ScanSummary>(
        summaryPath,
        `Unable to read summary file: ${summaryPath}`
      );

      const components = dependencyGraph?.components ?? [];
      const dependencyEdges = dependencyGraph?.edges ?? [];
      const summary =
        storedSummary ??
        buildScanSummary({
          components,
          findings
        });

      return {
        repository: persisted.repository,
        metadata: persisted.metadata,
        components,
        dependencyEdges,
        findings,
        summary
      };
    } catch {
      return undefined;
    }
  }

  private async readOptionalJson<T>(
    filePath: string,
    message: string
  ): Promise<T | undefined> {
    if (!(await pathExists(filePath))) {
      return undefined;
    }

    return this.readJson<T>(filePath, message);
  }

  private async findScanMetadataFile(scanId: string): Promise<string> {
    const repositoryEntries = await readdir(this.scansDir, { withFileTypes: true });

    for (const repositoryEntry of repositoryEntries) {
      if (!repositoryEntry.isDirectory()) {
        continue;
      }

      const metadataFilePath = path.join(
        this.scansDir,
        repositoryEntry.name,
        scanId,
        "metadata.json"
      );

      try {
        await readFile(metadataFilePath, "utf-8");
        return metadataFilePath;
      } catch {
        continue;
      }
    }

    throw new StorageError(`Scan not found: ${scanId}`, {
      details: { scanId }
    });
  }

  private async ensureDirectories(): Promise<void> {
    await Promise.all([
      mkdir(this.rootDir, { recursive: true }),
      mkdir(this.scansDir, { recursive: true }),
      mkdir(this.comparisonsDir, { recursive: true }),
      //mkdir(this.reportsDir, { recursive: true })
    ]);
  }

  private async readJson<T>(filePath: string, message: string): Promise<T> {
    try {
      const raw = await readFile(filePath, "utf-8");
      return JSON.parse(raw) as T;
    } catch (error: unknown) {
      throw new StorageError(message, {
        cause: error,
        details: { filePath }
      });
    }
  }

  private async writeJson(filePath: string, value: unknown): Promise<void> {
    try {
      const raw = JSON.stringify(value, null, 2);
      await writeFile(filePath, raw, "utf-8");
    } catch (error: unknown) {
      throw new StorageError("Failed to write JSON file", {
        cause: error,
        details: { filePath }
      });
    }
  }

  private async writeText(filePath: string, value: string): Promise<void> {
    try {
      await writeFile(filePath, value, "utf-8");
    } catch (error: unknown) {
      throw new StorageError("Failed to write text file", {
        cause: error,
        details: { filePath }
      });
    }
  }
}