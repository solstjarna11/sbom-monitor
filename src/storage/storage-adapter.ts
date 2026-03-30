import {
  ComparisonReport,
  DependencyGraphRecord,
  Finding,
  ScanRecord,
  ScanSummary
} from "../core/types";

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
  saveFindings(
    repositorySlug: string,
    scanId: string,
    findings: Finding[]
  ): Promise<void>;
  saveSummary(
    repositorySlug: string,
    scanId: string,
    summary: ScanSummary
  ): Promise<void>;
  saveScanReport(
    repositorySlug: string,
    scanId: string,
    markdown: string
  ): Promise<void>;
  saveComparison(report: ComparisonReport): Promise<void>;
  saveComparisonReport(
    repositorySlug: string,
    comparisonId: string,
    markdown: string
  ): Promise<void>;
  getScan(scanId: string): Promise<ScanRecord>;
  listScans(): Promise<ScanRecord[]>;
  getComparison(reportId: string): Promise<ComparisonReport>;
}
