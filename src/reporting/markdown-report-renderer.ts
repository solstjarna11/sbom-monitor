import { ComparisonReport, Finding, ScanRecord } from "../core/types";

export class MarkdownReportRenderer {
    public renderScanReport(scan: ScanRecord): string {
        const lines: string[] = [];

        lines.push(`# SBOM Monitor Scan Report`, "", `## Repository`, `- Name: ${scan.repository.name}`, `- Slug: ${scan.repository.slug}`, `- Source: ${scan.repository.source}`, `- Commit: ${scan.repository.commitHash ?? "unknown"}`, `- Scan ID: ${scan.metadata.id}`, `- Completed At: ${scan.metadata.completedAt}`, "", `## Dependency Summary`, `- Total components: ${scan.summary.totalComponents}`, `- Direct dependencies: ${scan.summary.directDependencies}`, `- Transitive dependencies: ${scan.summary.transitiveDependencies}`, "", `## Findings Summary`, `- Total findings: ${scan.summary.totalFindings}`, `- By severity: ${formatCountMap(scan.summary.findingsBySeverity)}`, `- By category: ${formatCountMap(scan.summary.findingsByCategory)}`, "");

        const grouped = groupFindings(scan.findings);

        for (const [category, findings] of grouped) {
            lines.push(`## ${toTitleCase(category)} Findings`);
            if (findings.length === 0) {
                lines.push(`No findings.`, "");
                continue;
            }

            for (const finding of findings.slice(0, 20)) {
                lines.push(`### ${finding.title}`, `- Severity: ${finding.severity}`);
                if (finding.componentId !== undefined) {
                    lines.push(`- Component ID: ${finding.componentId}`);
                }
                lines.push(`- Description: ${finding.description}`, `- Remediation: ${finding.remediation}`, "");
            }
        }

        lines.push(`## Recommended Next Steps`,
            `1. Address critical and high-severity vulnerability and integrity findings first.`
            ,
            `2. Review direct dependency changes and remove unnecessary packages where practical.`
            ,
            `3. Tighten trust boundaries around lockfiles, package sources, and CI workflow execution.`
            , "");

        return lines.join("\n");
    }

    public renderComparisonReport(
        comparison: ComparisonReport,
        baseline: ScanRecord,
        target: ScanRecord
    ): string {
        const lines: string[] = [];

        lines.push(`# SBOM Monitor Comparison Report`, "", `## Repository`, `- Name: ${target.repository.name}`, `- Slug: ${comparison.repositorySlug}`, `- Baseline Scan: ${comparison.baselineScanId}`, `- Target Scan: ${comparison.targetScanId}`, `- Generated At: ${comparison.generatedAt}`, "", `## Comparison Summary`, `- Added dependencies: ${comparison.summary.addedDependencyCount}`, `- Removed dependencies: ${comparison.summary.removedDependencyCount}`, `- Changed dependencies: ${comparison.summary.changedDependencyCount}`, `- Upgrades: ${comparison.summary.upgradedDependencyCount}`, `- Downgrades: ${comparison.summary.downgradedDependencyCount}`,
            `- Newly introduced vulnerabilities: ${comparison.summary.introducedVulnerabilityCount}`
            ,
            `- Resolved vulnerabilities: ${comparison.summary.resolvedVulnerabilityCount}`
            ,
            `- New trust/integrity findings: ${comparison.summary.introducedTrustIntegrityFindingCount}`
            ,
            `- Removed trust/integrity findings: ${comparison.summary.removedTrustIntegrityFindingCount}`
            , "", `## Scan Delta Context`, `- Baseline total findings: ${baseline.summary.totalFindings}`, `- Target total findings: ${target.summary.totalFindings}`, "", `## Added Dependencies`);
        appendComponentList(lines, comparison.addedDependencies);

        lines.push(`## Removed Dependencies`);
        appendComponentList(lines, comparison.removedDependencies);

        lines.push(`## Upgraded / Downgraded Dependencies`);
        if (comparison.changedDependencies.length === 0) {
            lines.push(`No dependency version changes detected.`, "");
        } else {
            for (const change of comparison.changedDependencies) {
                lines.push(
                    `- ${change.componentName}: ${change.previousVersion} -> ${change.currentVersion} (${change.changeType}, ${change.directDependency ? "direct" : "transitive"})`
                );
            }
            lines.push("");
        }

        lines.push(`## Vulnerability Changes`);
        appendFindingList(
            lines,
            comparison.findingsDelta.introducedVulnerabilities,
            "No newly introduced vulnerabilities."
        );
        appendFindingList(
            lines,
            comparison.findingsDelta.resolvedVulnerabilities,
            "No resolved vulnerabilities."
        );

        lines.push(`## Trust and Integrity Changes`);
        appendFindingList(
            lines,
            comparison.findingsDelta.introducedTrustAndIntegrityFindings,
            "No newly introduced trust or integrity findings."
        );
        appendFindingList(
            lines,
            comparison.findingsDelta.removedTrustAndIntegrityFindings,
            "No removed trust or integrity findings."
        );

        lines.push(`## Recommended Actions`,
            `1. Prioritize new high-severity vulnerabilities and integrity findings introduced in the target scan.`
            ,
            `2. Review dependency upgrades and downgrades for intentionality, especially direct dependencies.`
            ,
            `3. Preserve any resolved vulnerabilities or trust improvements in future changes.`
            , "");

        return lines.join("\n");
    }
}

function groupFindings(findings: Finding[]): Map<string, Finding[]> {
    const grouped = new Map<string, Finding[]>();

    for (const finding of findings) {
        const group = grouped.get(finding.category) ?? [];
        group.push(finding);
        grouped.set(finding.category, group);
    }

    return new Map(
        [...grouped.entries()].sort(([left], [right]) => left.localeCompare(right))
    );
}

function formatCountMap(values: Record<string, number>): string {
    return Object.entries(values)
        .map(([key, value]) => `${key}=${value}`)
        .join(", ");
}

function toTitleCase(value: string): string {
    return value
        .split("-")
        .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
        .join(" ");
}

function appendComponentList(
    lines: string[],
    components: Array<{ name: string; version: string; direct: boolean }>
): void {
    if (components.length === 0) {
        lines.push(`None.`, "");
        return;
    }

    for (const component of components) {
        lines.push(
            `- ${component.name}@${component.version} (${component.direct ? "direct" : "transitive"})`
        );
    }
    lines.push("");
}

function appendFindingList(
    lines: string[],
    findings: Finding[],
    emptyMessage: string
): void {
    if (findings.length === 0) {
        lines.push(emptyMessage, "");
        return;
    }

    for (const finding of findings) {
        lines.push(`- [${finding.severity}] ${finding.title}`, `  - Remediation: ${finding.remediation}`);
    }
    lines.push("");
}