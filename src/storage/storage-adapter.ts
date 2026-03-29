import { ComparisonReport, ScanRecord } from "../core/types";

export interface StorageAdapter {
  getRootDirectory(): string;
  createScanDirectory(repositorySlug: string, scanId: string): Promise<string>;
  saveScan(scan: ScanRecord): Promise<void>;
  getScan(scanId: string): Promise<ScanRecord>;
  listScans(): Promise<ScanRecord[]>;
  saveComparison(report: ComparisonReport): Promise<void>;
  getComparison(reportId: string): Promise<ComparisonReport>;
}