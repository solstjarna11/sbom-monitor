import {
  ComponentRecord,
  DependencyEdge,
  DependencyGraphRecord,
  ScanRecord
} from "../core/types";
import { ValidationError } from "../utils/errors";

interface BuildDotInput {
  scan: ScanRecord;
  dependencyGraph: DependencyGraphRecord;
  directOnly: boolean;
  maxNodes?: number | undefined;
}

interface BuildDotResult {
  dot: string;
  nodeCount: number;
  edgeCount: number;
  warnings: string[];
}

interface RenderNode {
  id: string;
  label: string;
  isRoot: boolean;
  direct: boolean;
  scope: ComponentRecord["scope"] | "runtime";
}

export class DependencyGraphDotProvider {
  public buildDot(input: BuildDotInput): BuildDotResult {
    const componentMap = new Map(
      input.dependencyGraph.components.map((component) => [component.id, component])
    );

    for (const edge of input.dependencyGraph.edges) {
      if (
        typeof edge.fromComponentId !== "string" ||
        typeof edge.toComponentId !== "string"
      ) {
        throw new ValidationError("Malformed dependency graph edge encountered.");
      }
    }

    const allEdges = dedupeEdges(input.dependencyGraph.edges);
    const filteredEdges = input.directOnly
      ? allEdges.filter((edge) => edge.relationship === "direct")
      : allEdges;

    const rootNodeId = input.scan.repository.id;
    const rootLabel = String.raw`${input.scan.repository.name}\n${input.scan.repository.slug}`;

    const includedNodeIds = new Set<string>();
    includedNodeIds.add(rootNodeId);

    for (const edge of filteredEdges) {
      includedNodeIds.add(edge.fromComponentId);
      includedNodeIds.add(edge.toComponentId);
    }

    let packageNodes = [...includedNodeIds]
      .filter((nodeId) => nodeId !== rootNodeId)
      .map((nodeId) => this.buildRenderNode(nodeId, componentMap, rootNodeId))
      .sort(compareRenderNodes);

    const warnings: string[] = [];

    if (input.maxNodes !== undefined && packageNodes.length > input.maxNodes) {
      packageNodes = packageNodes.slice(0, input.maxNodes);
      warnings.push(
        `Graph truncated to ${input.maxNodes} package nodes via --max-nodes.`
      );
    }

    const finalNodeIds = new Set<string>([
      rootNodeId,
      ...packageNodes.map((node) => node.id)
    ]);

    const finalEdges = filteredEdges.filter(
      (edge) =>
        finalNodeIds.has(edge.fromComponentId) &&
        finalNodeIds.has(edge.toComponentId)
    );

    const nodes: RenderNode[] = [
      {
        id: rootNodeId,
        label: rootLabel,
        isRoot: true,
        direct: true,
        scope: "runtime"
      },
      ...packageNodes
    ];

    const lines: string[] = [];
    lines.push("digraph DependencyGraph {", '  rankdir="LR";', '  graph [fontname="Helvetica", fontsize=10, labelloc="t"];', '  node [fontname="Helvetica", fontsize=10, shape="ellipse"];', '  edge [fontname="Helvetica", fontsize=9];', "");

    for (const node of nodes) {
      lines.push(`  ${quoteId(node.id)} [${this.buildNodeAttributes(node)}];`);
    }

    lines.push("");

    for (const edge of finalEdges.sort(compareEdges)) {
      lines.push(
        `  ${quoteId(edge.fromComponentId)} -> ${quoteId(edge.toComponentId)} [${buildEdgeAttributes(edge)}];`
      );
    }

    lines.push("}");

    return {
      dot: lines.join("\n"),
      nodeCount: nodes.length,
      edgeCount: finalEdges.length,
      warnings
    };
  }

  private buildRenderNode(
    nodeId: string,
    componentMap: Map<string, ComponentRecord>,
    rootNodeId: string
  ): RenderNode {
    if (nodeId === rootNodeId) {
      return {
        id: rootNodeId,
        label: rootNodeId,
        isRoot: true,
        direct: true,
        scope: "runtime"
      };
    }

    const component = componentMap.get(nodeId);

    if (component === undefined) {
      return {
        id: nodeId,
        label: nodeId,
        isRoot: false,
        direct: false,
        scope: "runtime"
      };
    }

    return {
      id: nodeId,
      label: `${component.name}@${component.version}`,
      isRoot: false,
      direct: component.direct,
      scope: component.scope
    };
  }

  private buildNodeAttributes(node: RenderNode): string {
    const attributes: string[] = [`label="${escapeDotLabel(node.label)}"`];

    if (node.isRoot) {
      attributes.push('shape="box"', 'style="filled,bold"', 'fillcolor="lightgoldenrod1"');
      return attributes.join(", ");
    }

    if (node.direct) {
      attributes.push('penwidth="2"');
    }

    if (node.scope === "development") {
      attributes.push('style="filled"', 'fillcolor="lightblue"');
    } else if (node.scope === "optional") {
      attributes.push('style="filled"', 'fillcolor="lightgray"');
    }

    return attributes.join(", ");
  }
}

function buildEdgeAttributes(edge: DependencyEdge): string {
  const attributes: string[] = [];

  if (edge.relationship === "direct") {
    attributes.push('color="black"', 'penwidth="2"');
  } else {
    attributes.push('color="gray60"', 'style="dashed"');
  }

  if (edge.scope === "development") {
    attributes.push('fontcolor="steelblue4"', 'label="dev"');
  } else if (edge.scope === "optional") {
    attributes.push('fontcolor="gray40"', 'label="optional"');
  }

  return attributes.join(", ");
}

function dedupeEdges(edges: DependencyEdge[]): DependencyEdge[] {
  const map = new Map<string, DependencyEdge>();

  for (const edge of edges) {
    const key = `${edge.fromComponentId}::${edge.toComponentId}::${edge.relationship}::${edge.scope}`;
    map.set(key, edge);
  }

  return [...map.values()];
}

function compareRenderNodes(left: RenderNode, right: RenderNode): number {
  if (left.direct !== right.direct) {
    return left.direct ? -1 : 1;
  }

  return left.label.localeCompare(right.label);
}

function compareEdges(left: DependencyEdge, right: DependencyEdge): number {
  const leftKey = `${left.fromComponentId}::${left.toComponentId}::${left.relationship}::${left.scope}`;
  const rightKey = `${right.fromComponentId}::${right.toComponentId}::${right.relationship}::${right.scope}`;
  return leftKey.localeCompare(rightKey);
}

function escapeDotLabel(value: string): string {
  return value.replaceAll('\\', "\\\\").replaceAll('"', String.raw`\"`);
}

function quoteId(value: string): string {
  return `"${value.replaceAll('\\', "\\\\").replaceAll('"', String.raw`\"`)}"`;
}