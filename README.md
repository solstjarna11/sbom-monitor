# SBOM Monitor

SBOM Monitor is a CLI-based software supply chain analysis tool for npm projects.

The tool generates CycloneDX SBOMs, extracts dependency graphs, performs OWASP-oriented supply chain analysis, compares historical scans, generates human-readable reports, and produces visual dependency graphs.

The project was developed as a coursework-focused software supply chain security analysis platform with emphasis on:

- OWASP A03: Vulnerable and Outdated Components
- OWASP A08: Software and Data Integrity Failures
- SBOM generation and analysis
- Dependency change tracking
- Evidence-driven reporting

---

# Features

## Repository Intake

Supports scanning:

- Local Git repositories
- Remote Git repository URLs

Repository metadata collected:

- Repository name
- Repository slug
- Repository path or URL
- Branch / selected ref
- Commit SHA
- Scan timestamp

---

## SBOM Generation

Generates CycloneDX JSON SBOMs for npm projects using npm tooling.

Output:

- `sbom.cdx.json`

Stored under the scan artifact directory.

---

## Dependency Graph Extraction

Builds a normalized dependency graph from:

- `package-lock.json`
- `npm-shrinkwrap.json`

Fallback:

- `npm ls --all --json`

Features:

- Direct dependency detection
- Transitive dependency detection
- Runtime / development / optional scope classification
- Package URL (purl) generation

Output:

- `dependency-graph.json`

---

## A03 Analysis Engine

### Necessity Analysis

Checks for:

- Potentially unused direct dependencies
- Development dependency usage concerns
- Obvious dependency redundancy indicators

### Vulnerability Analysis

Integrates:

- `npm audit`

Produces normalized findings for:

- Known vulnerabilities
- Direct vs transitive exposure when available

### Maintenance Analysis

Checks for:

- Deprecated packages
- Stale package versions
- Maintenance concerns where practical

### Source Trust Analysis

Checks for:

- Missing lockfiles
- Loose semver ranges
- Git dependencies
- Tarball dependencies
- Lifecycle scripts
- Other non-standard package sources

Outputs normalized findings.

---

## A08 Integrity Analysis

Checks for:

### Manifest / Lockfile Integrity

- Missing lockfiles
- Dependency source trust concerns

### npm Configuration

Checks `.npmrc` for:

- Disabled SSL verification
- Insecure HTTP registries

### Build and Installation Scripts

Detects risky patterns such as:

- Inline execution
- Download-and-execute patterns
- Other supply-chain-sensitive script behavior

### GitHub Actions Workflows

Inspects:

`.github/workflows`

Checks for:

- Unpinned actions
- Download-and-execute workflow steps
- Trust-boundary concerns

---

## Scan Comparison

Compare two previously generated scans without rescanning repositories.

Detects:

### Dependency Changes

- Added dependencies
- Removed dependencies
- Upgraded dependencies
- Downgraded dependencies

### Finding Changes

- Newly introduced vulnerabilities
- Resolved vulnerabilities
- Introduced trust findings
- Resolved trust findings
- Introduced integrity findings
- Resolved integrity findings

Output:

- JSON comparison artifact
- Markdown comparison report

---

## Markdown Reporting

Generates human-readable reports from stored scan artifacts.

Supports:

- Single scan reports
- Comparison reports

Designed for:

- Coursework submissions
- Security reviews
- Supply-chain assessments
- Audit evidence

---

## Visual Dependency Graphs

Generate visual dependency graphs from persisted scan artifacts.

No rescanning required.

Outputs:

- Graphviz DOT
- SVG (when Graphviz is installed)

Features:

- Root project node
- Direct vs transitive dependency visualization
- Runtime / development / optional dependency styling
- Direct-only filtering
- Maximum node limiting

Outputs:

- `dependency-graph.dot`
- `dependency-graph.svg`

---

# Installation

## Requirements

- Node.js 20+
- npm
- Git

Optional:

- Graphviz (for SVG graph rendering)

### Install Graphviz

#### macOS

```bash
brew install graphviz
```

#### Ubuntu

```bash
sudo apt install graphviz
```

#### Windows

Download and install Graphviz:

<https://graphviz.org/download/>

### Install Dependencies

```bash
npm install
```

### Build

```bash
npm run build
```

### Global CLI Usage

```bash
npm link
```

---

# Commands

## Scan

Create a scan snapshot.

### Local Repository

```bash
sbom-monitor scan \
  --repo /Users/kik/git/video_lesson_platform
```

### Remote Repository

```bash
sbom-monitor scan \
  --repo https://github.com/solstjarna11/hbv506m_video_lesson_platform
```

### Specific Git Ref

```bash
sbom-monitor scan \
  --repo https://github.com/solstjarna11/hbv506m_video_lesson_platform \
  --selected-ref daba6141c4cad410211ec3da94bafd639ba448f5
```

---

## Compare

Compare two existing scans.

```bash
sbom-monitor compare \
  --repo video_lesson_platform \
  --baseline scan-1717000000000 \
  --target scan-1718000000000
```

---

## Report

Generate a Markdown report.

### Single Scan

```bash
sbom-monitor report \
  --repo video_lesson_platform \
  --scan scan-1718000000000
```

### Comparison Report

```bash
sbom-monitor report \
  --repo video_lesson_platform \
  --baseline scan-1717000000000 \
  --target scan-1718000000000
```

---

## Graph

Generate dependency graph visualizations.

```bash
sbom-monitor graph \
  --repo video_lesson_platform \
  --scan scan-1718000000000
```

### Direct Dependencies Only

```bash
sbom-monitor graph \
  --repo video_lesson_platform \
  --scan scan-1718000000000 \
  --direct-only
```

### Limit Graph Size

```bash
sbom-monitor graph \
  --repo video_lesson_platform \
  --scan scan-1718000000000 \
  --max-nodes 100
```

---

# Artifact Structure

```text
artifacts/
├── scans/
│   └── <repository-slug>/
│       └── <scan-id>/
│           ├── metadata.json
│           ├── sbom.cdx.json
│           ├── dependency-graph.json
│           ├── dependency-graph.dot
│           ├── dependency-graph.svg
│           ├── findings.json
│           └── summary.json
│
├── comparisons/
│   └── <repository-slug>/
│       ├── baseline__target.json
│       └── baseline__target.md
│
└── reports/
    └── <repository-slug>/
        └── *.md
```

---

# Architecture

```text
CLI
 ├── scan
 ├── compare
 ├── report
 └── graph

Services
 ├── ScanService
 ├── ComparisonService
 ├── ReportService
 └── GraphService

Providers
 ├── npm-sbom-provider
 ├── npm-dependency-graph-provider
 └── dependency-graph-dot-provider

Analyzers
 ├── NecessityAnalyzer
 ├── VulnerabilityAnalyzer
 ├── MaintenanceAnalyzer
 ├── SourceTrustAnalyzer
 └── IntegrityAnalyzer

Storage
 └── JSON File Storage Adapter
```

---

# Current Scope

## Implemented

- Repository intake
- SBOM generation
- Dependency graph extraction
- A03 analysis
- A08 integrity analysis
- Scan comparison
- Markdown reporting
- Visual dependency graph generation

## Not Implemented

- Cryptographic package verification
- Sigstore verification
- Provenance validation
- SLSA verification
- Package signature validation
- Continuous monitoring
- Web UI

---

# License

Developed as part of a software supply chain security coursework project.
