import { StorageAdapter } from "../storage/storage-adapter";
import { DependencyGraphDotProvider } from "../providers/dependency-graph-dot-provider";
import { renderDotToSvg } from "../utils/graphviz";
import { ValidationError } from "../utils/errors";

export type GraphOutputFormat = "dot" | "svg";

export interface GenerateGraphInput {
  scanId: string;
  directOnly: boolean;
  maxNodes?: number | undefined;
  format: GraphOutputFormat;
}

export interface GenerateGraphResult {
  scanId: string;
  repositorySlug: string;
  dotPath: string;
  svgPath?: string;
  nodeCount: number;
  edgeCount: number;
  warnings: string[];
}

export class GraphService {
  private readonly dotProvider = new DependencyGraphDotProvider();

  public constructor(private readonly storage: StorageAdapter) {}

  public async generateGraph(
    input: GenerateGraphInput
  ): Promise<GenerateGraphResult> {
    const scan = await this.storage.getScan(input.scanId);
    const dependencyGraph = await this.storage.getDependencyGraph(input.scanId);

    if (
      dependencyGraph.components.length === 0 &&
      dependencyGraph.edges.length === 0
    ) {
      throw new ValidationError(
        `Persisted dependency graph is empty for scan: ${input.scanId}`
      );
    }

    const rendered = this.dotProvider.buildDot({
      scan,
      dependencyGraph,
      directOnly: input.directOnly,
      maxNodes: input.maxNodes
    });

    const dotPath = await this.storage.saveScanTextArtifact(
      input.scanId,
      "dependency-graph.dot",
      rendered.dot
    );

    const warnings = [...rendered.warnings];
    let svgPath: string | undefined;

    if (input.format === "svg") {
      const svg = await renderDotToSvg(rendered.dot);

      if (svg === undefined) {
        warnings.push("Graphviz 'dot' not available; generated DOT only.");
      } else {
        svgPath = await this.storage.saveScanBinaryArtifact(
          input.scanId,
          "dependency-graph.svg",
          svg
        );
      }
    }

    const result: GenerateGraphResult = {
      scanId: input.scanId,
      repositorySlug: scan.repository.slug,
      dotPath,
      nodeCount: rendered.nodeCount,
      edgeCount: rendered.edgeCount,
      warnings
    };

    if (svgPath !== undefined) {
      result.svgPath = svgPath;
    }

    return result;
  }
}