import { Analyzer, AnalyzerContext } from "./types";
import { ComponentRecord, Finding, FindingSeverity } from "../core/types";
import { runNpmJsonCommand } from "../utils/npm-json-command";

interface NpmLsNode {
  name?: string;
  version?: string;
  deprecated?: string;
  dependencies?: Record<string, NpmLsNode>;
}

interface NpmOutdatedEntry {
  current?: string;
  wanted?: string;
  latest?: string;
  dependent?: string;
  location?: string;
}

type NpmOutdatedResult = Record<string, NpmOutdatedEntry>;

export class MaintenanceAnalyzer implements Analyzer {
  public readonly name = "maintenance";

  public async analyze(context: AnalyzerContext): Promise<Finding[]> {
    const findings: Finding[] = [];

    const npmLsResult = (await runNpmJsonCommand(
      ["ls", "--all", "--json", "--long"],
      context.repositoryPath
    )) as NpmLsNode;

    findings.push(...this.buildDeprecatedFindings(npmLsResult, context));

    const outdatedResult = (await runNpmJsonCommand(
      ["outdated", "--json"],
      context.repositoryPath
    )) as NpmOutdatedResult;

    findings.push(...this.buildOutdatedFindings(outdatedResult, context));

    return findings;
  }

  private buildDeprecatedFindings(
    rootNode: NpmLsNode,
    context: AnalyzerContext
  ): Finding[] {
    const findings: Finding[] = [];
    const visited = new Set<string>();

    const visit = (node: NpmLsNode): void => {
      const nodeName = node.name;
      const nodeVersion = node.version;
      const visitKey = `${nodeName ?? "unknown"}@${nodeVersion ?? "unknown"}`;

      if (visited.has(visitKey)) {
        return;
      }

      visited.add(visitKey);

      if (
        nodeName !== undefined &&
        nodeVersion !== undefined &&
        typeof node.deprecated === "string" &&
        node.deprecated.trim().length > 0
      ) {
        const component = this.findComponent(
          context.components,
          nodeName,
          nodeVersion
        );
        const severity = this.deprecationSeverity(node.deprecated);

        const findingBase: Omit<Finding, "componentId"> = {
          id: `maintenance-deprecated-${nodeName}-${nodeVersion}`,
          severity,
          category: "maintenance",
          title: `Deprecated package detected: ${nodeName}`,
          description: node.deprecated,
          evidence: {
            packageName: nodeName,
            version: nodeVersion,
            deprecatedMessage: node.deprecated
          },
          remediation:
            "Upgrade to a maintained replacement or remove the package if it is no longer required.",
          references: [],
          detectedAt: context.timestamp
        };

        if (component === undefined) {
          findings.push(findingBase);
        } else {
          findings.push({
            ...findingBase,
            componentId: component.id
          });
        }
      }

      for (const dependency of Object.values(node.dependencies ?? {})) {
        visit(dependency);
      }
    };

    visit(rootNode);
    return findings;
  }

  private buildOutdatedFindings(
    outdated: NpmOutdatedResult,
    context: AnalyzerContext
  ): Finding[] {
    const findings: Finding[] = [];

    for (const [packageName, entry] of Object.entries(outdated)) {
      const component = context.components.find(
        (candidate) => candidate.name === packageName
      );

      const severity = this.outdatedSeverity(entry.current, entry.latest);
      const findingBase: Omit<Finding, "componentId"> = {
        id: `maintenance-stale-${packageName}`,
        severity,
        category: "maintenance",
        title: `Stale package version detected: ${packageName}`,
        description: `Package "${packageName}" is behind the latest available version.`,
        evidence: {
          packageName,
          current: entry.current ?? null,
          wanted: entry.wanted ?? null,
          latest: entry.latest ?? null,
          dependent: entry.dependent ?? null,
          location: entry.location ?? null
        },
        remediation:
          "Review compatibility and update to a newer supported version where practical.",
        references: [],
        detectedAt: context.timestamp
      };

      if (component === undefined) {
        findings.push(findingBase);
      } else {
        findings.push({
          ...findingBase,
          componentId: component.id
        });
      }
    }

    return findings;
  }

  private deprecationSeverity(message: string): FindingSeverity {
    const normalized = message.toLowerCase();

    if (
      normalized.includes("no longer maintained") ||
      normalized.includes("unmaintained") ||
      normalized.includes("unsupported") ||
      normalized.includes("archived")
    ) {
      return "high";
    }

    return "medium";
  }

  private outdatedSeverity(
    current: string | undefined,
    latest: string | undefined
  ): FindingSeverity {
    const currentMajor = parseMajor(current);
    const latestMajor = parseMajor(latest);

    if (
      currentMajor !== undefined &&
      latestMajor !== undefined &&
      latestMajor - currentMajor >= 1
    ) {
      return "medium";
    }

    return "low";
  }

  private findComponent(
    components: ComponentRecord[],
    name: string,
    version: string
  ): ComponentRecord | undefined {
    return components.find(
      (component) => component.name === name && component.version === version
    );
  }
}

function parseMajor(version: string | undefined): number | undefined {
  if (version === undefined) {
    return undefined;
  }

  const match = new RegExp(/^(\d+)/).exec(version);
  return match === null ? undefined : Number(match[1]);
}