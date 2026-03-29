import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { ComparisonReport, ScanRecord } from "../core/types";
import { StorageAdapter } from "./storage-adapter";
import { StorageError } from "../utils/errors";

export class JsonFileStorageAdapter implements StorageAdapter {
  private readonly scansDir: string;
  private readonly comparisonsDir: string;
  private readonly reportsDir: string;

  public constructor(private readonly rootDir: string) {
    this.scansDir = path.join(rootDir, "scans");
    this.comparisonsDir = path.join(rootDir, "comparisons");
    this.reportsDir = path.join(rootDir, "reports");
  }

  public async saveScan(scan: ScanRecord): Promise<void> {
    await this.ensureDirectories();
    const filePath = path.join(this.scansDir, `${scan.metadata.id}.json`);
    await this.writeJson(filePath, scan);
  }

  public async getScan(scanId: string): Promise<ScanRecord> {
    await this.ensureDirectories();
    const filePath = path.join(this.scansDir, `${scanId}.json`);
    return this.readJson<ScanRecord>(filePath, `Scan not found: ${scanId}`);
  }

  public async listScans(): Promise<ScanRecord[]> {
    await this.ensureDirectories();
    const files = await readdir(this.scansDir, { withFileTypes: true });
    const scanFiles = files
      .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
      .map((entry) => path.join(this.scansDir, entry.name));

    const scans = await Promise.all(
      scanFiles.map((filePath) =>
        this.readJson<ScanRecord>(filePath, `Unable to read scan file: ${filePath}`)
      )
    );

    return scans.sort((left, right) =>
      left.metadata.startedAt.localeCompare(right.metadata.startedAt)
    );
  }

  public async saveComparison(report: ComparisonReport): Promise<void> {
    await this.ensureDirectories();
    const filePath = path.join(this.comparisonsDir, `${report.id}.json`);
    await this.writeJson(filePath, report);
  }

  public async getComparison(reportId: string): Promise<ComparisonReport> {
    await this.ensureDirectories();
    const filePath = path.join(this.comparisonsDir, `${reportId}.json`);
    return this.readJson<ComparisonReport>(
      filePath,
      `Comparison report not found: ${reportId}`
    );
  }

  public async saveRenderedReport(scan: ScanRecord): Promise<void> {
    await this.ensureDirectories();
    const filePath = path.join(this.reportsDir, `${scan.metadata.id}.json`);
    await this.writeJson(filePath, scan);
  }

  private async ensureDirectories(): Promise<void> {
    await Promise.all([
      mkdir(this.rootDir, { recursive: true }),
      mkdir(this.scansDir, { recursive: true }),
      mkdir(this.comparisonsDir, { recursive: true }),
      mkdir(this.reportsDir, { recursive: true })
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
}