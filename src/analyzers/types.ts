import { ComponentRecord, DependencyGraphRecord, Finding } from "../core/types";

export interface AnalyzerContext {
  repositoryPath: string;
  dependencyGraph: DependencyGraphRecord;
  components: ComponentRecord[];
  scanId: string;
  timestamp: string;
}

export interface Analyzer {
  name: string;
  analyze(context: AnalyzerContext): Promise<Finding[]>;
}