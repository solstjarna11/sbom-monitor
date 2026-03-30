// src/core/models.ts

import {
  ComparisonReport,
  Finding,
  FindingCategory,
  FindingSeverity,
  ScanRecord,
  ScanSummary
} from "./types";

export function createEmptySeverityMap(): Record<FindingSeverity, number> {
  return {
    low: 0,
    medium: 0,
    high: 0,
    critical: 0
  };
}

export function createEmptyCategoryMap(): Record<FindingCategory, number> {
  return {
    necessity: 0,
    "known-vulnerability": 0,
    maintenance: 0,
    "source-trust": 0,
    integrity: 0,
    metadata: 0
  };
}

export function buildScanSummary(
  scan: Pick<ScanRecord, "components" | "findings">
): ScanSummary {
  const findingsBySeverity = createEmptySeverityMap();
  const findingsByCategory = createEmptyCategoryMap();

  for (const finding of scan.findings) {
    findingsBySeverity[finding.severity] += 1;
    findingsByCategory[finding.category] += 1;
  }

  const directDependencies = scan.components.filter(
    (component) => component.direct
  ).length;

  const transitiveDependencies = scan.components.length - directDependencies;

  return {
    totalComponents: scan.components.length,
    directDependencies,
    transitiveDependencies,
    totalFindings: scan.findings.length,
    findingsBySeverity,
    findingsByCategory
  };
}

export function findingFingerprint(finding: Finding): string {
  return [
    finding.componentId ?? "global",
    finding.category,
    finding.severity,
    finding.title
  ].join("::");
}

export function comparisonSummary(
  report: ComparisonReport
): ComparisonReport["summary"] {
  return {
    addedDependencyCount: report.addedDependencies.length,
    removedDependencyCount: report.removedDependencies.length,
    changedDependencyCount: report.changedDependencies.length,
    upgradedDependencyCount: report.changedDependencies.filter(
      (change) => change.changeType === "upgraded"
    ).length,
    downgradedDependencyCount: report.changedDependencies.filter(
      (change) => change.changeType === "downgraded"
    ).length,
    addedFindingsCount: report.findingsDelta.added.length,
    removedFindingsCount: report.findingsDelta.removed.length,
    introducedVulnerabilityCount:
      report.findingsDelta.introducedVulnerabilities.length,
    resolvedVulnerabilityCount:
      report.findingsDelta.resolvedVulnerabilities.length,
    introducedTrustIntegrityFindingCount:
      report.findingsDelta.introducedTrustAndIntegrityFindings.length,
    removedTrustIntegrityFindingCount:
      report.findingsDelta.removedTrustAndIntegrityFindings.length
  };
}