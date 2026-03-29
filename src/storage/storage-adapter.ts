import { ComparisonReport, ScanRecord } from "../core/types";

export interface StorageAdapter {
  saveScan(scan: ScanRecord): Promise<void>;
  getScan(scanId: string): Promise<ScanRecord>;
  listScans(): Promise<ScanRecord[]>;
  saveComparison(report: ComparisonReport): Promise<void>;
  getComparison(reportId: string): Promise<ComparisonReport>;
}