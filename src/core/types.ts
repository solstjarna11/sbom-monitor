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
  selectedRef?: string | undefined;
  repositoryId: string;
  scanRoot: string;
  startedAt: string;
  completedAt: string;
  status: "prepared" | "completed" | "failed";
  toolVersion: string;
  scannerName: string;
  notes?: string[] | undefined;
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
  transitive: boolean;
  devDependency: boolean;
  metadata: Record<string, string | number | boolean | null>;
}

export interface DependencyEdge {
  fromComponentId: string;
  toComponentId: string;
  relationship: DependencyRelationship;
  scope: DependencyScope;
}

export interface DependencyGraphRecord {
  schemaVersion: "1.0";
  packageManager: "npm";
  repositoryId: string;
  scanId: string;
  generatedAt: string;
  components: ComponentRecord[];
  edges: DependencyEdge[];
}

export interface Finding {
  id: string;
  componentId?: string;
  severity: FindingSeverity;
  category: FindingCategory;
  title: string;
  description: string;
  evidence: Record<string, unknown>;
  remediation: string;
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
  changeType: "upgraded" | "downgraded" | "changed";
  directDependency: boolean;
}

export interface ComparisonFindingDelta {
  added: Finding[];
  removed: Finding[];
  introducedVulnerabilities: Finding[];
  resolvedVulnerabilities: Finding[];
  introducedTrustAndIntegrityFindings: Finding[];
  removedTrustAndIntegrityFindings: Finding[];
}

export interface ComparisonReport {
  id: string;
  repositoryId: string;
  repositorySlug: string;
  baselineScanId: string;
  targetScanId: string;
  generatedAt: string;
  addedDependencies: ComponentRecord[];
  removedDependencies: ComponentRecord[];
  changedDependencies: ComponentVersionChange[];
  findingsDelta: ComparisonFindingDelta;
  summary: {
    addedDependencyCount: number;
    removedDependencyCount: number;
    changedDependencyCount: number;
    upgradedDependencyCount: number;
    downgradedDependencyCount: number;
    addedFindingsCount: number;
    removedFindingsCount: number;
    introducedVulnerabilityCount: number;
    resolvedVulnerabilityCount: number;
    introducedTrustIntegrityFindingCount: number;
    removedTrustIntegrityFindingCount: number;
  };
}