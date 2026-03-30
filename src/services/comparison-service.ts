import {
  ComparisonReport,
  ComponentRecord,
  ComponentVersionChange,
  Finding
} from "../core/types";
import { findingFingerprint } from "../core/models";
import { StorageAdapter } from "../storage/storage-adapter";
import { ValidationError } from "../utils/errors";

export class ComparisonService {
  public constructor(private readonly storage: StorageAdapter) {}

  public async compareScans(
    baselineScanId: string,
    targetScanId: string
  ): Promise<ComparisonReport> {
    const baseline = await this.storage.getScan(baselineScanId);
    const target = await this.storage.getScan(targetScanId);

    if (baseline.repository.id !== target.repository.id) {
      throw new ValidationError(
        "Scans must belong to the same repository to be compared."
      );
    }

    const baselineComponentIds = new Set(baseline.components.map((component) => component.id));
    const targetComponentIds = new Set(target.components.map((component) => component.id));

    const addedDependencies = target.components
      .filter((component) => !baselineComponentIds.has(component.id))
      .sort(sortComponents);

    const removedDependencies = baseline.components
      .filter((component) => !targetComponentIds.has(component.id))
      .sort(sortComponents);

    const changedDependencies = this.buildVersionChanges(
      baseline.components,
      target.components
    );

    const baselineFindingMap = this.buildFindingMap(baseline.findings);
    const targetFindingMap = this.buildFindingMap(target.findings);

    const addedFindings = this.diffFindings(targetFindingMap, baselineFindingMap);
    const removedFindings = this.diffFindings(baselineFindingMap, targetFindingMap);

    const introducedVulnerabilities = addedFindings.filter(
      (finding) => finding.category === "known-vulnerability"
    );
    const resolvedVulnerabilities = removedFindings.filter(
      (finding) => finding.category === "known-vulnerability"
    );
    const introducedTrustAndIntegrityFindings = addedFindings.filter((finding) =>
      finding.category === "source-trust" || finding.category === "integrity"
    );
    const removedTrustAndIntegrityFindings = removedFindings.filter((finding) =>
      finding.category === "source-trust" || finding.category === "integrity"
    );

    const report: ComparisonReport = {
      id: `${baselineScanId}__${targetScanId}`,
      repositoryId: baseline.repository.id,
      repositorySlug: baseline.repository.slug,
      baselineScanId,
      targetScanId,
      generatedAt: new Date().toISOString(),
      addedDependencies,
      removedDependencies,
      changedDependencies,
      findingsDelta: {
        added: addedFindings,
        removed: removedFindings,
        introducedVulnerabilities,
        resolvedVulnerabilities,
        introducedTrustAndIntegrityFindings,
        removedTrustAndIntegrityFindings
      },
      summary: {
        addedDependencyCount: addedDependencies.length,
        removedDependencyCount: removedDependencies.length,
        changedDependencyCount: changedDependencies.length,
        upgradedDependencyCount: changedDependencies.filter(
          (change) => change.changeType === "upgraded"
        ).length,
        downgradedDependencyCount: changedDependencies.filter(
          (change) => change.changeType === "downgraded"
        ).length,
        addedFindingsCount: addedFindings.length,
        removedFindingsCount: removedFindings.length,
        introducedVulnerabilityCount: introducedVulnerabilities.length,
        resolvedVulnerabilityCount: resolvedVulnerabilities.length,
        introducedTrustIntegrityFindingCount:
          introducedTrustAndIntegrityFindings.length,
        removedTrustIntegrityFindingCount:
          removedTrustAndIntegrityFindings.length
      }
    };

    await this.storage.saveComparison(report);
    return report;
  }

  private buildFindingMap(findings: Finding[]): Map<string, Finding> {
    return new Map(
      findings.map((finding) => [findingFingerprint(finding), finding])
    );
  }

  private diffFindings(
    left: Map<string, Finding>,
    right: Map<string, Finding>
  ): Finding[] {
    const results: Finding[] = [];

    for (const [key, finding] of left.entries()) {
      if (!right.has(key)) {
        results.push(finding);
      }
    }

    return results.sort((a, b) => a.id.localeCompare(b.id));
  }

  private buildVersionChanges(
    baselineComponents: ComponentRecord[],
    targetComponents: ComponentRecord[]
  ): ComponentVersionChange[] {
    const baselineByName = this.groupComponentsByName(baselineComponents);
    const targetByName = this.groupComponentsByName(targetComponents);

    const names = new Set([
      ...baselineByName.keys(),
      ...targetByName.keys()
    ]);

    const changes: ComponentVersionChange[] = [];

    for (const name of names) {
      const baselinePreferred = this.preferredComponent(baselineByName.get(name) ?? []);
      const targetPreferred = this.preferredComponent(targetByName.get(name) ?? []);

      if (baselinePreferred === undefined || targetPreferred === undefined) {
        continue;
      }

      if (baselinePreferred.version === targetPreferred.version) {
        continue;
      }

      changes.push({
        componentName: name,
        previousVersion: baselinePreferred.version,
        currentVersion: targetPreferred.version,
        changeType: classifyVersionChange(
          baselinePreferred.version,
          targetPreferred.version
        ),
        directDependency: baselinePreferred.direct || targetPreferred.direct
      });
    }

    return changes.sort((left, right) =>
      left.componentName.localeCompare(right.componentName)
    );
  }

  private groupComponentsByName(
    components: ComponentRecord[]
  ): Map<string, ComponentRecord[]> {
    const grouped = new Map<string, ComponentRecord[]>();

    for (const component of components) {
      const group = grouped.get(component.name) ?? [];
      group.push(component);
      grouped.set(component.name, group);
    }

    return grouped;
  }

  private preferredComponent(
    components: ComponentRecord[]
  ): ComponentRecord | undefined {
    return [...components].sort((left, right) => {
      if (left.direct !== right.direct) {
        return left.direct ? -1 : 1;
      }

      return left.version.localeCompare(right.version);
    })[0];
  }
}

function sortComponents(left: ComponentRecord, right: ComponentRecord): number {
  return left.id.localeCompare(right.id);
}

function classifyVersionChange(
  previousVersion: string,
  currentVersion: string
): "upgraded" | "downgraded" | "changed" {
  const previous = parseVersion(previousVersion);
  const current = parseVersion(currentVersion);

  if (previous === undefined || current === undefined) {
    return "changed";
  }

  const length = Math.max(previous.length, current.length);
  for (let index = 0; index < length; index += 1) {
    const previousPart = previous[index] ?? 0;
    const currentPart = current[index] ?? 0;

    if (currentPart > previousPart) {
      return "upgraded";
    }

    if (currentPart < previousPart) {
      return "downgraded";
    }
  }

  return "changed";
}

function parseVersion(version: string): number[] | undefined {
  const match = new RegExp(/\d+(?:\.\d+)*/).exec(version);
  if (match === null) {
    return undefined;
  }

  return match[0].split(".").map(Number);
}