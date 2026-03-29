import { ComparisonReport, DependencyGraphRecord, ScanRecord } from "../core/types";

export interface StorageAdapter {
  getRootDirectory(): string;
  createScanDirectory(repositorySlug: string, scanId: string): Promise<string>;
  saveScan(scan: ScanRecord): Promise<void>;
  saveSbom(
    repositorySlug: string,
    scanId: string,
    sbom: Record<string, unknown>
  ): Promise<void>;
  saveDependencyGraph(
    repositorySlug: string,
    scanId: string,
    graph: DependencyGraphRecord
  ): Promise<void>;
  getScan(scanId: string): Promise<ScanRecord>;
  listScans(): Promise<ScanRecord[]>;
  saveComparison(report: ComparisonReport): Promise<void>;
  getComparison(reportId: string): Promise<ComparisonReport>;
}