import { ScanRecord } from "../core/types";
import { StorageAdapter } from "../storage/storage-adapter";

export class ReportService {
  public constructor(private readonly storage: StorageAdapter) {}

  public async generateScanReport(scanId: string): Promise<ScanRecord> {
    return this.storage.getScan(scanId);
  }
}