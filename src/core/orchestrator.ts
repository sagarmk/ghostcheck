/**
 * Pipeline orchestrator — coordinates the scan workflow.
 *
 * Phases:
 *   1. File discovery (fast-glob)
 *   2. Language detection (extension mapping)
 *   3. AST parsing (SWC for JS/TS, tree-sitter for others)
 *   4. Rule execution (visitor pattern over AST)
 *   5. Finding aggregation and deduplication
 *   6. Output formatting
 */

import type {
  AcvConfig,
  ScanResult,
  Finding,
  ScanSummary,
  ScanMetrics,
  RuleCategory,
} from './types.js';

/**
 * Orchestrator options passed from the CLI.
 */
export interface OrchestratorOptions {
  readonly config: AcvConfig;
  readonly path: string;
  readonly fix: boolean;
  readonly write: boolean;
  readonly staged: boolean;
  readonly since?: string;
  readonly failFast: boolean;
  readonly verbose: boolean;
}

/**
 * Create an empty scan summary.
 */
function emptySummary(): ScanSummary {
  return {
    errors: 0,
    warnings: 0,
    info: 0,
    fixable: 0,
    categories: {
      'ai-specific': 0,
      security: 0,
      correctness: 0,
    },
  };
}

/**
 * Compute summary statistics from findings.
 */
export function computeSummary(findings: readonly Finding[]): ScanSummary {
  void emptySummary;
  let errors = 0;
  let warnings = 0;
  let info = 0;
  let fixable = 0;
  const categories: Record<RuleCategory, number> = {
    'ai-specific': 0,
    security: 0,
    correctness: 0,
  };

  for (const finding of findings) {
    switch (finding.severity) {
      case 'error':
        errors++;
        break;
      case 'warn':
        warnings++;
        break;
      case 'info':
        info++;
        break;
    }
    if (finding.fix) fixable++;
    categories[finding.category]++;
  }

  return { errors, warnings, info, fixable, categories };
}

/**
 * Determine exit code from scan results.
 */
export function computeExitCode(summary: ScanSummary, config: AcvConfig): 0 | 1 | 2 | 3 | 4 {
  const { failOn, maxWarnings } = config;

  if (failOn === 'error' && summary.errors > 0) return 1;
  if (failOn === 'warn' && (summary.errors > 0 || summary.warnings > 0)) return 1;
  if (failOn === 'info' && (summary.errors > 0 || summary.warnings > 0 || summary.info > 0))
    return 1;
  if (maxWarnings >= 0 && summary.warnings > maxWarnings) return 1;

  return 0;
}

/**
 * Build a complete ScanResult from findings and metrics.
 */
export function buildScanResult(
  findings: readonly Finding[],
  metrics: ScanMetrics,
  config: AcvConfig,
): ScanResult {
  const summary = computeSummary(findings);
  const exitCode = computeExitCode(summary, config);

  return {
    version: '0.1.0',
    timestamp: new Date().toISOString(),
    config: {
      failOn: config.failOn,
      rules: Object.keys(config.rules).length,
      languages: config.languages,
    },
    scan: metrics,
    findings,
    summary,
    exitCode,
  };
}
