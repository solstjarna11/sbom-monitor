export type Ecosystem =
  | "npm"
  | "node"
  | "maven"
  | "pypi"
  | "nuget"
  | "go"
  | "cargo"
  | "generic";

export type DependencyScope =
  | "runtime"
  | "development"
  | "build"
  | "test"
  | "optional"
  | "unknown";

export type DependencyRelationship = "direct" | "transitive";

export type FindingSeverity = "low" | "medium" | "high" | "critical";
export type FindingCategory =
  | "necessity"
  | "known-vulnerability"
  | "maintenance"
  | "source-trust"
  | "integrity"
  | "metadata";

export type RepositorySourceType = "local" | "git-url";

export interface RepositoryProjectFiles {
  packageJson: string;
  packageLockJson?: string;
  npmShrinkwrapJson?: string;
  npmrc?: string;
  githubWorkflows: string[];
}

export interface RepositoryMetadata {
  id: string;
  slug: string;
  name: string;
  path: string;
  source: string;
  sourceType: RepositorySourceType;
  branch?: string;
  commitHash?: string;
  remoteUrl?: string;
  selectedRef?: string;
  ecosystem: Ecosystem;
  manifestFiles: string[];
  projectFiles: RepositoryProjectFiles;
  createdAt: string;
}

export interface ScanMetadata {
  id: string;
  repositoryId: string;
  scanRoot: string;
  startedAt: string;
  completedAt: string;
  status: "prepared" | "completed" | "failed";
  toolVersion: string;
  scannerName: string;
  notes?: string[];
}

export interface ComponentRecord {
  id: string;
  name: string;
  version: string;
  ecosystem: Ecosystem;
  packageUrl?: string;
  checksum?: string;
  license?: string;
  supplier?: string;
  sourceUrl?: string;
  relationship: DependencyRelationship;
  scope: DependencyScope;
  direct: boolean;
  devDependency: boolean;
  metadata: Record<string, string | number | boolean | null>;
}

export interface DependencyEdge {
  fromComponentId: string;
  toComponentId: string;
  relationship: DependencyRelationship;
  scope: DependencyScope;
}

export interface Finding {
  id: string;
  componentId?: string;
  severity: FindingSeverity;
  category: FindingCategory;
  title: string;
  description: string;
  recommendation?: string;
  references: string[];
  detectedAt: string;
}

export interface ScanSummary {
  totalComponents: number;
  directDependencies: number;
  transitiveDependencies: number;
  totalFindings: number;
  findingsBySeverity: Record<FindingSeverity, number>;
  findingsByCategory: Record<FindingCategory, number>;
}

export interface ScanRecord {
  repository: RepositoryMetadata;
  metadata: ScanMetadata;
  components: ComponentRecord[];
  dependencyEdges: DependencyEdge[];
  findings: Finding[];
  summary: ScanSummary;
}

export interface ComponentVersionChange {
  componentName: string;
  previousVersion: string;
  currentVersion: string;
}

export interface ComparisonReport {
  id: string;
  baselineScanId: string;
  targetScanId: string;
  generatedAt: string;
  newComponents: ComponentRecord[];
  removedComponents: ComponentRecord[];
  changedComponents: ComponentVersionChange[];
  findingsDelta: {
    added: Finding[];
    removed: Finding[];
  };
  summary: {
    newComponentCount: number;
    removedComponentCount: number;
    changedComponentCount: number;
    addedFindingsCount: number;
    removedFindingsCount: number;
  };
}