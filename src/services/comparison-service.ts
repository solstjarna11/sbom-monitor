import {
  ComparisonReport,
  ComponentRecord,
  ComponentVersionChange,
  Finding
} from "../core/types";
import { comparisonSummary, findingFingerprint } from "../core/models";
import { StorageAdapter } from "../storage/storage-adapter";

export class ComparisonService {
  public constructor(private readonly storage: StorageAdapter) {}

  public async compareScans(
    baselineScanId: string,
    targetScanId: string
  ): Promise<ComparisonReport> {
    const baseline = await this.storage.getScan(baselineScanId);
    const target = await this.storage.getScan(targetScanId);

    const baselineComponents = this.mapComponentsByName(baseline.components);
    const targetComponents = this.mapComponentsByName(target.components);

    const newComponents: ComponentRecord[] = [];
    const removedComponents: ComponentRecord[] = [];
    const changedComponents: ComponentVersionChange[] = [];

    for (const [name, component] of targetComponents.entries()) {
      const previous = baselineComponents.get(name);
      if (!previous) {
        newComponents.push(component);
        continue;
      }

      if (previous.version !== component.version) {
        changedComponents.push({
          componentName: name,
          previousVersion: previous.version,
          currentVersion: component.version
        });
      }
    }

    for (const [name, component] of baselineComponents.entries()) {
      if (!targetComponents.has(name)) {
        removedComponents.push(component);
      }
    }

    const baselineFindingMap = this.mapFindings(baseline.findings);
    const targetFindingMap = this.mapFindings(target.findings);

    const addedFindings = this.diffFindings(targetFindingMap, baselineFindingMap);
    const removedFindings = this.diffFindings(
      baselineFindingMap,
      targetFindingMap
    );

    const report: ComparisonReport = {
      id: `compare-${baselineScanId}-to-${targetScanId}`,
      baselineScanId,
      targetScanId,
      generatedAt: new Date().toISOString(),
      newComponents,
      removedComponents,
      changedComponents,
      findingsDelta: {
        added: addedFindings,
        removed: removedFindings
      },
      summary: {
        newComponentCount: 0,
        removedComponentCount: 0,
        changedComponentCount: 0,
        addedFindingsCount: 0,
        removedFindingsCount: 0
      }
    };

    report.summary = comparisonSummary(report);

    await this.storage.saveComparison(report);
    return report;
  }

  private mapComponentsByName(
    components: ComponentRecord[]
  ): Map<string, ComponentRecord> {
    return new Map(components.map((component) => [component.name, component]));
  }

  private mapFindings(findings: Finding[]): Map<string, Finding> {
    return new Map(findings.map((finding) => [findingFingerprint(finding), finding]));
  }

  private diffFindings(
    source: Map<string, Finding>,
    comparison: Map<string, Finding>
  ): Finding[] {
    const results: Finding[] = [];

    for (const [key, finding] of source.entries()) {
      if (!comparison.has(key)) {
        results.push(finding);
      }
    }

    return results;
  }
}