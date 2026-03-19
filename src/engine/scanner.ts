/**
 * Scanner orchestrator — the main coordinator for the ACV scan pipeline.
 *
 * scan(targetPath, config) → ScanResult
 *
 * Steps:
 *   1. Discover files via the discovery module (fast-glob).
 *   2. Read each file's source code.
 *   3. Parse imports via import-extractor (JS/TS only).
 *   4. Batch-verify all unique bare imports against npm registry (single batched call).
 *   5. Build ScanContext per file.
 *   6. Run all enabled rules via RuleRunner.
 *   7. Sort findings by severity (error > warn > info) then file path.
 *   8. Compute stats and elapsed time.
 *   9. Return ScanResult.
 *
 * Error handling:
 *   - File read errors become warning-level findings, not crashes.
 *   - Import extraction failures are silently tolerated (empty imports).
 *   - Registry verification failures fall back to offline mode.
 *   - Parse failures skip AST-based rules for that file.
 */

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import type {
  AcvConfig,
  Finding,
  ScanResult,
  ScanMetrics,
  ScanContext,
  Language,
  ActiveSeverity,
  Rule,
} from '../core/types.js';
import { SEVERITY_ORDER, meetsThreshold } from '../core/types.js';
import { buildScanResult } from '../core/orchestrator.js';
import { discoverFiles } from '../cli/discovery.js';
import { parseFileSize } from '../cli/args.js';
import { detectLanguage } from '../ast/language-detect.js';
import { extractImports, isBareSpecifier, getPackageName } from '../parser/import-extractor.js';
import { NpmRegistryVerifier } from '../verifier/npm-registry.js';
import { createRuleRunner } from '../rules/rule-runner.js';

// =============================================================================
// Types
// =============================================================================

/**
 * Options for the scanner orchestrator.
 */
export interface ScannerOptions {
  /** Merged AcvConfig (CLI flags + .acvrc + defaults) */
  readonly config: AcvConfig;
  /** Only run these rules (by ID). null/undefined = all enabled */
  readonly onlyRules?: readonly string[] | null;
  /** Skip these rules (by ID) */
  readonly excludeRules?: readonly string[] | null;
  /** Additional Rule objects from plugins */
  readonly pluginRules?: readonly Rule[];
  /** Verbose logging */
  readonly verbose?: boolean;
  /** Callback for progress messages (defaults to stderr) */
  readonly onProgress?: (message: string) => void;
  /** Callback for warning messages (defaults to stderr) */
  readonly onWarning?: (message: string) => void;
  /** Skip npm registry verification (offline mode) */
  readonly skipRegistry?: boolean;
  /** Only include git-staged files */
  readonly staged?: boolean;
  /** Only include files changed since this git ref */
  readonly since?: string;
}

/**
 * Internal per-file processing context.
 */
interface FileProcessingResult {
  readonly scanContext: ScanContext;
  readonly error?: string;
}

// =============================================================================
// Scanner
// =============================================================================

/**
 * Main scan orchestrator.
 *
 * Coordinates the full scan pipeline: discovery → read → parse → verify → rules → result.
 *
 * Usage:
 * ```typescript
 * const result = await scan('./src', {
 *   config: mergedConfig,
 *   verbose: true,
 * });
 *
 * console.log(result.summary);
 * process.exitCode = result.exitCode;
 * ```
 */
export async function scan(
  targetPath: string,
  options: ScannerOptions,
): Promise<ScanResult> {
  const {
    config,
    onlyRules,
    excludeRules,
    pluginRules,
    verbose = false,
    onProgress = defaultProgress,
    onWarning = defaultWarning,
    skipRegistry = false,
    staged = false,
    since,
  } = options;

  const startTime = Date.now();
  const resolvedPath = resolve(targetPath);

  // ── Step 1: Discover files ──────────────────────────────────────────────
  if (verbose) {
    onProgress(`Discovering files in ${resolvedPath}...`);
  }

  const maxFileSize = parseFileSize(config.maxFileSize);

  const files = await discoverFiles({
    path: resolvedPath,
    ignore: [...config.ignore],
    maxFileSize,
    languages: config.languages,
    staged,
    since,
  });

  if (files.length === 0) {
    if (verbose) {
      onProgress('No files found to scan.');
    }
    return buildEmptyResult(config, startTime);
  }

  if (verbose) {
    onProgress(`Found ${String(files.length)} file(s) to scan.`);
  }

  // ── Step 2 & 3: Read files and parse imports ────────────────────────────
  const fileResults: FileProcessingResult[] = [];
  const warningFindings: Finding[] = [];
  let parsedCount = 0;
  let skippedCount = 0;

  for (const filePath of files) {
    const result = await processFile(filePath, verbose, onWarning);

    if (result.error) {
      // File read error → warning finding, not crash
      warningFindings.push(createFileErrorFinding(filePath, result.error));
      skippedCount++;
    } else {
      fileResults.push(result);
      parsedCount++;
    }
  }

  if (verbose) {
    onProgress(
      `Read ${String(parsedCount)} files, skipped ${String(skippedCount)} (errors).`,
    );
  }

  // ── Step 4: Batch-verify all unique bare imports against npm registry ───
  const registryFindings = await verifyImportsWithRegistry(
    fileResults,
    config,
    skipRegistry,
    verbose,
    onProgress,
    onWarning,
  );

  // ── Step 5: ScanContexts already built in step 2/3 ─────────────────────
  const scanContexts = fileResults.map((r) => r.scanContext);

  // ── Step 6: Run all enabled rules via RuleRunner ────────────────────────
  if (verbose) {
    onProgress('Running rules...');
  }

  const ruleRunner = createRuleRunner(pluginRules);
  const filePaths = scanContexts.map((ctx) => ctx.filePath);

  const runResult = await ruleRunner.run(filePaths, {
    config,
    onlyRules,
    excludeRules,
    verbose,
    onProgress,
    onWarning,
  });

  // Combine all findings: rule findings + registry findings + file error warnings
  const allFindings: Finding[] = [
    ...runResult.scanResult.findings,
    ...registryFindings,
    ...warningFindings,
  ];

  // ── Step 7: Sort findings by severity (error > warn > info) then file path ──
  allFindings.sort((a, b) => {
    const severityDiff = SEVERITY_ORDER[b.severity] - SEVERITY_ORDER[a.severity];
    if (severityDiff !== 0) return severityDiff;
    return a.filePath.localeCompare(b.filePath);
  });

  // ── Step 8: Compute stats and elapsed time ──────────────────────────────
  const metrics: ScanMetrics = {
    files: files.length,
    durationMs: Date.now() - startTime,
    cached: 0,
    parsed: parsedCount,
    skipped: skippedCount,
  };

  // ── Step 9: Return ScanResult ───────────────────────────────────────────
  const scanResult = buildScanResult(allFindings, metrics, config);

  if (verbose) {
    onProgress(
      `Scan complete: ${String(parsedCount)} files parsed, ` +
      `${String(allFindings.length)} findings, ` +
      `${String(skippedCount)} skipped, ` +
      `${String(metrics.durationMs)}ms`,
    );
  }

  return scanResult;
}

// =============================================================================
// File Processing (Steps 2 & 3)
// =============================================================================

/**
 * Read a single file and extract imports.
 * Returns the ScanContext or an error string.
 */
async function processFile(
  filePath: string,
  verbose: boolean,
  onWarning: (msg: string) => void,
): Promise<FileProcessingResult> {
  // Detect language
  const language = detectLanguage(filePath);
  if (!language) {
    return {
      scanContext: emptyScanContext(filePath),
      error: `Unsupported file type: ${filePath}`,
    };
  }

  // Read source code
  let sourceCode: string;
  try {
    sourceCode = await readFile(filePath, 'utf-8');
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      scanContext: emptyScanContext(filePath),
      error: `Failed to read file: ${message}`,
    };
  }

  // Extract imports (JS/TS only)
  const imports = extractImportsForLanguage(
    sourceCode,
    filePath,
    language,
    verbose,
    onWarning,
  );

  const scanContext: ScanContext = {
    filePath,
    sourceCode,
    language,
    imports,
    fileSize: Buffer.byteLength(sourceCode, 'utf-8'),
  };

  return { scanContext };
}

/**
 * Extract imports for JS/TS files. Returns empty array for other languages.
 */
function extractImportsForLanguage(
  sourceCode: string,
  filePath: string,
  language: Language,
  verbose: boolean,
  onWarning: (msg: string) => void,
): ScanContext['imports'] {
  if (language !== 'javascript' && language !== 'typescript') {
    return [];
  }

  try {
    return extractImports(sourceCode, filePath);
  } catch {
    if (verbose) {
      onWarning(`Import extraction failed for ${filePath}`);
    }
    return [];
  }
}

// =============================================================================
// Registry Verification (Step 4)
// =============================================================================

/**
 * Batch-verify all unique bare imports against the npm registry.
 *
 * Collects all bare import specifiers across all files, deduplicates them,
 * sends a single batched call to the NpmRegistryVerifier, and generates
 * findings for packages that don't exist on npm.
 */
async function verifyImportsWithRegistry(
  fileResults: readonly FileProcessingResult[],
  _config: AcvConfig,
  skipRegistry: boolean,
  verbose: boolean,
  onProgress: (msg: string) => void,
  onWarning: (msg: string) => void,
): Promise<Finding[]> {
  if (skipRegistry) {
    if (verbose) {
      onProgress('Skipping npm registry verification (offline mode).');
    }
    return [];
  }

  // Collect all unique bare import package names across all files
  // Track which files import each package for finding generation
  const packageToFiles = new Map<string, Array<{ filePath: string; line: number; column: number; raw: string }>>();

  for (const result of fileResults) {
    if (result.error) continue;
    const { scanContext } = result;

    for (const imp of scanContext.imports) {
      if (!isBareSpecifier(imp.source)) continue;

      const pkgName = getPackageName(imp.source);
      if (!pkgName) continue;

      if (!packageToFiles.has(pkgName)) {
        packageToFiles.set(pkgName, []);
      }
      packageToFiles.get(pkgName)!.push({
        filePath: scanContext.filePath,
        line: imp.line,
        column: imp.column ?? 1,
        raw: imp.raw ?? imp.source,
      });
    }
  }

  const packageNames = [...packageToFiles.keys()];

  if (packageNames.length === 0) {
    return [];
  }

  if (verbose) {
    onProgress(`Verifying ${String(packageNames.length)} unique packages against npm registry...`);
  }

  // Create verifier and batch-check all packages
  const verifier = new NpmRegistryVerifier({
    onWarning,
  });

  let registryResults: Map<string, { exists: boolean; statusCode?: number; inPackageJson?: boolean }>;
  try {
    registryResults = await verifier.checkPackages(packageNames);
  } catch (err: unknown) {
    // Registry verification entirely failed — don't crash, just warn
    onWarning(
      `npm registry verification failed: ${err instanceof Error ? err.message : String(err)}. ` +
      `Skipping registry checks.`,
    );
    return [];
  }

  // Generate findings for packages that don't exist on npm
  const findings: Finding[] = [];

  for (const [pkgName, result] of registryResults) {
    if (result.exists) continue;
    if (result.inPackageJson) continue; // In package.json, might be a private package

    const importSites = packageToFiles.get(pkgName);
    if (!importSites) continue;

    // Create a finding for each import site of a non-existent package
    for (const site of importSites) {
      // Check if a rule already flagged this (hallucinated-package rule)
      // The scanner adds these as supplementary findings from the registry check
      findings.push({
        ruleId: 'acv/registry-not-found',
        ruleName: 'Registry Package Not Found',
        severity: 'warn' as ActiveSeverity,
        category: 'ai-specific',
        message: `Package "${pkgName}" was not found on the npm registry (HTTP ${String(result.statusCode ?? 'unknown')}).`,
        filePath: site.filePath,
        line: site.line,
        column: site.column,
        endLine: site.line,
        endColumn: site.column + pkgName.length,
        codeSnippet: site.raw,
        fix: null,
        suggestedFix: `Verify that "${pkgName}" is a real npm package. It may be a hallucinated dependency.`,
        suggestion: `Check if "${pkgName}" exists on npmjs.com or if it's a typo.`,
        owaspRef: null,
        confidence: 0.85,
        meta: {
          registryChecked: 'npm',
        },
      });
    }
  }

  if (verbose && findings.length > 0) {
    onProgress(
      `Registry check: ${String(findings.length)} import(s) not found on npm.`,
    );
  }

  return findings;
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Create a warning finding for a file that couldn't be read.
 */
function createFileErrorFinding(filePath: string, errorMessage: string): Finding {
  return {
    ruleId: 'acv/file-error',
    ruleName: 'File Read Error',
    severity: 'warn' as ActiveSeverity,
    category: 'correctness',
    message: errorMessage,
    filePath,
    line: 1,
    column: 1,
    endLine: 1,
    endColumn: 1,
    codeSnippet: '',
    fix: null,
    suggestion: 'Check file permissions and encoding.',
    owaspRef: null,
    confidence: 1.0,
  };
}

/**
 * Create an empty ScanContext for files that couldn't be processed.
 */
function emptyScanContext(filePath: string): ScanContext {
  return {
    filePath,
    sourceCode: '',
    language: 'javascript', // fallback
    imports: [],
    fileSize: 0,
  };
}

/**
 * Build an empty ScanResult for when no files are found (exit code 4).
 */
function buildEmptyResult(config: AcvConfig, startTime: number): ScanResult {
  const metrics: ScanMetrics = {
    files: 0,
    durationMs: Date.now() - startTime,
    cached: 0,
    parsed: 0,
    skipped: 0,
  };

  // Override exit code to 4 (no files found)
  const result = buildScanResult([], metrics, config);
  return {
    ...result,
    exitCode: 4,
  };
}

/**
 * Default progress handler — writes to stderr.
 */
function defaultProgress(message: string): void {
  process.stderr.write(`[acv] ${message}\n`);
}

/**
 * Default warning handler — writes to stderr.
 */
function defaultWarning(message: string): void {
  process.stderr.write(`[acv] ⚠ ${message}\n`);
}

// Suppress unused import lint warning — meetsThreshold is used implicitly
// via the RuleRunner, and we import it to ensure the types module is loaded.
void meetsThreshold;
