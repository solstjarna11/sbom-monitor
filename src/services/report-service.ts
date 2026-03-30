import { ComparisonReport, ScanRecord } from "../core/types";
import { MarkdownReportRenderer } from "../reporting/markdown-report-renderer";
import { StorageAdapter } from "../storage/storage-adapter";

export class ReportService {
  private readonly renderer = new MarkdownReportRenderer();

  public constructor(private readonly storage: StorageAdapter) {}

  public async generateScanReport(
    scanId: string
  ): Promise<{ scan: ScanRecord; markdown: string }> {
    const scan = await this.storage.getScan(scanId);
    const markdown = this.renderer.renderScanReport(scan);

    await this.storage.saveScanReport(scan.repository.slug, scan.metadata.id, markdown);

    return { scan, markdown };
  }

  public async generateComparisonReport(
    comparisonId: string
  ): Promise<{ comparison: ComparisonReport; markdown: string }> {
    const comparison = await this.storage.getComparison(comparisonId);
    return this.generateComparisonReportFromReport(comparison);
  }

  public async generateComparisonReportFromReport(
    comparison: ComparisonReport
  ): Promise<{ comparison: ComparisonReport; markdown: string }> {
    const baseline = await this.storage.getScan(comparison.baselineScanId);
    const target = await this.storage.getScan(comparison.targetScanId);

    const markdown = this.renderer.renderComparisonReport(
      comparison,
      baseline,
      target
    );

    await this.storage.saveComparisonReport(
      comparison.repositorySlug,
      comparison.id,
      markdown
    );

    return { comparison, markdown };
  }
}