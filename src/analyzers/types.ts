// src/analyzers/types.ts

import {
  ComponentRecord,
  DependencyGraphRecord,
  Finding,
  RepositoryProjectFiles
} from "../core/types";

export interface AnalyzerContext {
  repositoryPath: string;
  projectFiles: RepositoryProjectFiles;
  dependencyGraph: DependencyGraphRecord;
  components: ComponentRecord[];
  scanId: string;
  timestamp: string;
}

export interface Analyzer {
  name: string;
  analyze(context: AnalyzerContext): Promise<Finding[]>;
}