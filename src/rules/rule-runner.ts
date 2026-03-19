/**
 * Rule runner framework — orchestrates rule execution across files.
 *
 * Responsibilities:
 *   1. Loads rules from category modules (ai-specific, security, correctness)
 *      and registers them into a RuleRegistry.
 *   2. For each file: reads source, extracts imports, builds ScanContext,
 *      runs applicable rules, collects findings.
 *   3. Supports severity filtering — skips findings below threshold.
 *   4. Supports rule enable/disable from AcvConfig.
 *   5. Aggregates all findings into a ScanResult with stats.
 *   6. Synchronous per-file processing, with async support for rules
 *      that need it (e.g., npm registry verification).
 *
 * This runner is the bridge between the CLI/orchestrator and the rule engine.
 * It owns the full lifecycle: file reading → parsing → rule execution → result.
 */

import { readFile } from 'node:fs/promises';

import type {
  AcvConfig,
  Finding,
  ScanResult,
  ScanMetrics,
  ScanContext,
  Language,
  Severity,
  Rule,
  ActiveSeverity,
} from '../core/types.js';
import { meetsThreshold } from '../core/types.js';
import { buildScanResult } from '../core/orchestrator.js';
import { RuleRegistry } from './registry.js';
import { RuleEngine } from './engine.js';
import { getAiSpecificRules } from './ai-specific/index.js';
import { getSecurityRules } from './security/index.js';
import { getCorrectnessRules } from './correctness/index.js';
import { extractImports, isBareSpecifier } from '../parser/import-extractor.js';
import { detectLanguage } from '../ast/language-detect.js';

// =============================================================================
// Default skip paths — files matching these patterns are skipped by default
// =============================================================================

/**
 * Default file path patterns to skip during scanning.
 * These are typically test, fixture, mock, locale, and seed data files
 * that produce a high rate of false positives for security rules.
 *
 * Can be overridden by setting "scanTestFiles": true in .acvrc / .ghostcheckrc.
 */
const DEFAULT_SKIP_PATHS: readonly RegExp[] = [
  // Test directories and files
  /\/test\//i,
  /\/tests\//i,
  /\/__tests__\//i,
  /\.test\.[tj]sx?$/i,
  /\.spec\.[tj]sx?$/i,

  // Locale / i18n
  /\/locales?\//i,
  /\/i18n\//i,
  /\/translations?\//i,

  // Fixtures and mocks
  /\/fixtures?\//i,
  /\/mocks?\//i,
  /\/__mocks__\//i,
  /\.fixture\./i,
  /\.mock\./i,

  // Seed and static data
  /\/seeds?\//i,
  /\/data\/static\//i,

  // E2E test frameworks
  /\/e2e\//i,
  /\/cypress\//i,
  /\/playwright\//i,
];

// =============================================================================
// Types
// =============================================================================

/**
 * Configuration options for a rule runner execution.
 */
export interface RuleRunnerOptions {
  /** Merged AcvConfig (CLI flags + .acvrc + defaults) */
  readonly config: AcvConfig;
  /** Minimum severity to include in results (default: from config) */
  readonly severityThreshold?: Severity;
  /** Only run these rules (by ID), ignoring config enables. null = all enabled */
  readonly onlyRules?: readonly string[] | null;
  /** Skip these rules (by ID), in addition to config disables */
  readonly excludeRules?: readonly string[] | null;
  /** Additional Rule objects to register (e.g., from plugins) */
  readonly pluginRules?: readonly Rule[];
  /** Whether to include verbose progress info */
  readonly verbose?: boolean;
  /** Callback for progress messages */
  readonly onProgress?: (message: string) => void;
  /** Callback for warnings */
  readonly onWarning?: (message: string) => void;
}

/**
 * Per-file processing result (internal).
 */
interface FileResult {
  readonly filePath: string;
  readonly findings: readonly Finding[];
  readonly scanContext: ScanContext;
  readonly skipped: boolean;
  readonly error?: string;
}

/**
 * Summary of a complete rule runner execution.
 */
export interface RunResult {
  /** Complete ScanResult (findings, metrics, summary) */
  readonly scanResult: ScanResult;
  /** Per-file ScanContexts built during execution */
  readonly scanContexts: readonly ScanContext[];
  /** Files that were skipped (unsupported language, read error, etc.) */
  readonly skippedFiles: readonly string[];
}

// =============================================================================
// RuleRunner
// =============================================================================

/**
 * Rule runner — coordinates rule execution across a set of files.
 *
 * Usage:
 * ```typescript
 * const runner = new RuleRunner();
 * const result = await runner.run(filePaths, {
 *   config: mergedConfig,
 *   severityThreshold: 'warn',
 * });
 *
 * console.log(result.scanResult.summary);
 * ```
 */
export class RuleRunner {
  private _registry: RuleRegistry | null = null;
  private _engine: RuleEngine | null = null;

  /**
   * Initialize the rule registry with built-in rules and optional plugin rules.
   * Called automatically on first run(), but can be called explicitly for setup.
   */
  initialize(pluginRules?: readonly Rule[]): void {
    this._registry = new RuleRegistry();

    // Load built-in rules from category modules
    const builtinRules = [
      ...getAiSpecificRules(),
      ...getSecurityRules(),
      ...getCorrectnessRules(),
    ];

    for (const rule of builtinRules) {
      this._registry.register(rule);
    }

    // Register plugin rules
    if (pluginRules) {
      for (const rule of pluginRules) {
        // Silently skip duplicates from plugins (plugin may re-register a built-in)
        if (!this._registry.get(rule.id)) {
          this._registry.register(rule);
        }
      }
    }

    this._engine = new RuleEngine(this._registry);
  }

  /**
   * Run rules against a list of files.
   *
   * For each file:
   *   1. Read source code
   *   2. Detect language
   *   3. Extract imports (for JS/TS)
   *   4. Build ScanContext
   *   5. Run applicable rules via RuleEngine
   *   6. Filter findings by severity threshold
   *
   * Returns aggregated RunResult with ScanResult, contexts, and skipped files.
   */
  async run(
    filePaths: readonly string[],
    options: RuleRunnerOptions,
  ): Promise<RunResult> {
    const {
      config,
      severityThreshold,
      onlyRules,
      excludeRules,
      pluginRules,
      verbose,
      onProgress,
      onWarning,
    } = options;

    // Initialize registry if not yet done
    if (!this._registry || !this._engine) {
      this.initialize(pluginRules);
    }

    const registry = this._registry!;
    const engine = this._engine!;
    const startTime = Date.now();

    // Determine effective severity threshold
    // failOn controls exit code, not finding display — default to 'info' to show all findings
    const threshold = severityThreshold ?? 'info';

    // Build effective config with rule overrides
    const effectiveConfig = this._buildEffectiveConfig(
      config,
      onlyRules ?? null,
      excludeRules ?? null,
    );

    // Log rule count if verbose
    if (verbose && onProgress) {
      const enabledCount = registry.getEnabled(effectiveConfig).length;
      onProgress(`${String(enabledCount)} rules enabled out of ${String(registry.size)} total`);
    }

    // Process files
    const allFindings: Finding[] = [];
    const scanContexts: ScanContext[] = [];
    const skippedFiles: string[] = [];
    let parsed = 0;

    for (const filePath of filePaths) {
      const fileResult = await this._processFile(
        filePath,
        effectiveConfig,
        engine,
        threshold,
        verbose,
        onProgress,
        onWarning,
      );

      if (fileResult.skipped) {
        skippedFiles.push(filePath);
      } else {
        scanContexts.push(fileResult.scanContext);
        allFindings.push(...fileResult.findings);
        parsed++;
      }
    }

    // Build metrics
    const metrics: ScanMetrics = {
      files: filePaths.length,
      durationMs: Date.now() - startTime,
      cached: 0,
      parsed,
      skipped: skippedFiles.length,
    };

    // Build final scan result
    const scanResult = buildScanResult(allFindings, metrics, effectiveConfig);

    if (verbose && onProgress) {
      onProgress(
        `Scan complete: ${String(parsed)} files parsed, ${String(allFindings.length)} findings, ` +
        `${String(skippedFiles.length)} skipped, ${String(metrics.durationMs)}ms`,
      );
    }

    return {
      scanResult,
      scanContexts,
      skippedFiles,
    };
  }

  /**
   * Check whether a file path should be skipped based on DEFAULT_SKIP_PATHS.
   * Returns true if the file should be skipped.
   */
  private _shouldSkipPath(filePath: string, config: AcvConfig): boolean {
    // If scanTestFiles is explicitly true in config, don't skip anything
    if (config.scanTestFiles === true) return false;

    return DEFAULT_SKIP_PATHS.some((pattern) => pattern.test(filePath));
  }

  /**
   * Filter out findings that are suppressed by inline comments.
   *
   * Supports:
   *   - `// ghostcheck-ignore` on the same line
   *   - `// ghostcheck-disable-next-line` on the line before
   *   - `// ghostcheck-disable` on the same line
   */
  private _filterInlineSuppressed(
    findings: Finding[],
    sourceCode: string,
  ): Finding[] {
    if (findings.length === 0) return findings;

    const lines = sourceCode.split('\n');

    return findings.filter((f) => {
      const lineIdx = f.line - 1;
      if (lineIdx < 0 || lineIdx >= lines.length) return true;

      const lineText = (lines[lineIdx] ?? '').toLowerCase();

      // Same-line suppression
      if (
        lineText.includes('// ghostcheck-ignore') ||
        lineText.includes('// ghostcheck-disable')
      ) {
        return false;
      }

      // Previous-line suppression
      if (lineIdx > 0) {
        const prevLine = (lines[lineIdx - 1] ?? '').toLowerCase();
        if (prevLine.includes('// ghostcheck-disable-next-line')) {
          return false;
        }
      }

      return true;
    });
  }

  /**
   * Process a single file through the rule pipeline.
   */
  private async _processFile(
    filePath: string,
    config: AcvConfig,
    engine: RuleEngine,
    threshold: Severity,
    verbose?: boolean,
    onProgress?: (msg: string) => void,
    onWarning?: (msg: string) => void,
  ): Promise<FileResult> {
    // 0. Check if file path should be skipped (test files, fixtures, etc.)
    if (this._shouldSkipPath(filePath, config)) {
      if (verbose && onProgress) {
        onProgress(`  Skipped ${filePath} (test/fixture/locale/mock file)`);
      }
      return {
        filePath,
        findings: [],
        scanContext: this._emptyScanContext(filePath),
        skipped: true,
        error: 'skipped by path pattern',
      };
    }

    // 1. Detect language
    const language = detectLanguage(filePath);
    if (!language) {
      return {
        filePath,
        findings: [],
        scanContext: this._emptyScanContext(filePath),
        skipped: true,
        error: 'unsupported language',
      };
    }

    // 2. Read source
    let sourceCode: string;
    try {
      sourceCode = await readFile(filePath, 'utf-8');
    } catch (error: unknown) {
      if (onWarning) {
        onWarning(`Failed to read ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
      }
      return {
        filePath,
        findings: [],
        scanContext: this._emptyScanContext(filePath),
        skipped: true,
        error: 'read error',
      };
    }

    // 3. Extract imports (JS/TS only)
    const imports = this._extractImportsForLanguage(
      sourceCode,
      filePath,
      language,
      verbose,
      onWarning,
    );

    // 4. Build ScanContext
    const scanContext: ScanContext = {
      filePath,
      sourceCode,
      language,
      imports,
      fileSize: Buffer.byteLength(sourceCode, 'utf-8'),
    };

    // 5. Parse and run rules
    // The RuleEngine needs an AST to run visitor-pattern rules.
    // If we can parse the file, run the engine; otherwise, return empty findings.
    let findings: Finding[] = [];

    try {
      // Dynamically import the parser to parse the file
      const { parse } = await import('../parser/index.js');
      const ast = await parse(sourceCode, filePath);

      const rawFindings = engine.run({
        filePath,
        language,
        ast,
        sourceText: sourceCode,
        config,
      });

      findings = [...rawFindings];
    } catch {
      // Parse failure — rules can't run against this file.
      // This is expected for non-JS/TS files that don't have a SWC parser.
      // Not an error — just means no AST-based rules for this file.
      if (verbose && onProgress) {
        onProgress(`  Skipped AST rules for ${filePath} (parse not available)`);
      }
    }

    // 5b. Filter out inline-suppressed findings
    findings = this._filterInlineSuppressed(findings, sourceCode);

    // 6. Filter by severity threshold
    if (threshold !== 'off') {
      findings = findings.filter(
        (f) => meetsThreshold(f.severity, threshold as ActiveSeverity),
      );
    }

    if (verbose && onProgress) {
      const pkgImports = imports.filter((i) => isBareSpecifier(i.source));
      onProgress(
        `  ${filePath}: ${String(findings.length)} findings, ` +
        `${String(imports.length)} imports (${String(pkgImports.length)} packages)`,
      );
    }

    return {
      filePath,
      findings,
      scanContext,
      skipped: false,
    };
  }

  /**
   * Extract imports for a file based on its language.
   * Only JS/TS files are currently supported for import extraction.
   */
  private _extractImportsForLanguage(
    sourceCode: string,
    filePath: string,
    language: Language,
    verbose?: boolean,
    onWarning?: (msg: string) => void,
  ): ScanContext['imports'] {
    if (language !== 'javascript' && language !== 'typescript') {
      return [];
    }

    try {
      return extractImports(sourceCode, filePath);
    } catch {
      if (verbose && onWarning) {
        onWarning(`Import extraction failed for ${filePath}`);
      }
      return [];
    }
  }

  /**
   * Build an effective config that respects onlyRules/excludeRules overrides.
   *
   * - onlyRules: if provided, disable all rules not in the list
   * - excludeRules: if provided, disable all rules in the list
   */
  private _buildEffectiveConfig(
    config: AcvConfig,
    onlyRules: readonly string[] | null,
    excludeRules: readonly string[] | null,
  ): AcvConfig {
    if (!onlyRules && !excludeRules) return config;

    const updatedRules = { ...config.rules };

    if (onlyRules && onlyRules.length > 0) {
      const onlySet = new Set(onlyRules);
      // Disable everything not in onlyRules
      for (const ruleId of Object.keys(updatedRules)) {
        if (!onlySet.has(ruleId)) {
          updatedRules[ruleId] = 'off';
        }
      }
    }

    if (excludeRules && excludeRules.length > 0) {
      for (const ruleId of excludeRules) {
        updatedRules[ruleId] = 'off';
      }
    }

    return {
      ...config,
      rules: updatedRules,
    };
  }

  /**
   * Create an empty ScanContext for skipped files.
   */
  private _emptyScanContext(filePath: string): ScanContext {
    return {
      filePath,
      sourceCode: '',
      language: 'javascript', // fallback
      imports: [],
      fileSize: 0,
    };
  }

  /**
   * Get the current RuleRegistry (for introspection/testing).
   */
  get registry(): RuleRegistry | null {
    return this._registry;
  }

  /**
   * Get the current RuleEngine (for introspection/testing).
   */
  get engine(): RuleEngine | null {
    return this._engine;
  }
}

// =============================================================================
// Convenience functions
// =============================================================================

/**
 * Create a pre-configured RuleRunner with all built-in rules loaded.
 *
 * Convenience factory for consumers who don't need plugin customization.
 */
export function createRuleRunner(pluginRules?: readonly Rule[]): RuleRunner {
  const runner = new RuleRunner();
  runner.initialize(pluginRules);
  return runner;
}

/**
 * Quick-run: scan files with default config and return findings.
 *
 * Convenience function for programmatic usage and testing.
 */
export async function runRules(
  filePaths: readonly string[],
  config: AcvConfig,
  options?: Partial<RuleRunnerOptions>,
): Promise<RunResult> {
  const runner = createRuleRunner(options?.pluginRules);
  return runner.run(filePaths, {
    config,
    ...options,
  });
}

/**
 * Get count of all available built-in rules.
 */
export function getBuiltinRuleCount(): number {
  return [
    ...getAiSpecificRules(),
    ...getSecurityRules(),
    ...getCorrectnessRules(),
  ].length;
}

/**
 * Get all available built-in rules.
 */
export function getBuiltinRules(): readonly Rule[] {
  return [
    ...getAiSpecificRules(),
    ...getSecurityRules(),
    ...getCorrectnessRules(),
  ];
}
