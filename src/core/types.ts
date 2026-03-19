/**
 * Core type definitions for AI Code Verifier (acv)
 *
 * These types form the foundation of the entire analysis pipeline —
 * from rule definitions through findings to scan results.
 *
 * This module is the single source of truth for all type contracts.
 * Plugin authors import from 'ai-code-verifier' to get these types.
 *
 * @module types
 */

// =============================================================================
// Severity & Category
// =============================================================================

/**
 * Severity levels for findings, ordered from most to least critical.
 * - error: Critical issue, blocks CI by default
 * - warn:  Warning, may block with --fail-on medium
 * - info:  Informational, never blocks
 * - off:   Rule is disabled
 */
export type Severity = 'error' | 'warn' | 'info' | 'off';

/**
 * Active severity — a severity that produces findings (excludes 'off').
 */
export type ActiveSeverity = Exclude<Severity, 'off'>;

/**
 * Rule categories — the three pillars of AI code verification.
 */
export type RuleCategory = 'ai-specific' | 'security' | 'correctness';

/**
 * Extended rule category for plugin-defined custom categories.
 */
export type ExtendedRuleCategory = RuleCategory | 'custom';

/**
 * Supported programming languages for analysis.
 */
export type Language = 'javascript' | 'typescript' | 'python' | 'go' | 'rust' | 'java' | 'ruby';

/**
 * Package ecosystem identifiers, mapped from languages.
 */
export type PackageEcosystem = 'npm' | 'pypi' | 'cargo' | 'go' | 'maven' | 'rubygems';

// =============================================================================
// AST Types
// =============================================================================

/**
 * Known normalized AST node type names (language-agnostic).
 * These are the well-known node types that rules can register visitors for.
 * Both SWC and tree-sitter nodes are mapped to these types.
 *
 * Plugin authors may use custom node type strings beyond this set.
 * The ASTNode.type field is `string` to allow extensibility.
 */
export type ASTNodeType =
  | 'Program'
  | 'Module'
  | 'ImportDeclaration'
  | 'ImportSpecifier'
  | 'ExportDeclaration'
  | 'ExportDefaultDeclaration'
  | 'ExportNamedDeclaration'
  | 'CallExpression'
  | 'NewExpression'
  | 'MemberExpression'
  | 'FunctionDeclaration'
  | 'FunctionExpression'
  | 'ArrowFunction'
  | 'VariableDeclaration'
  | 'AssignmentExpression'
  | 'StringLiteral'
  | 'TemplateLiteral'
  | 'BinaryExpression'
  | 'UnaryExpression'
  | 'ConditionalExpression'
  | 'IfStatement'
  | 'SwitchStatement'
  | 'ForStatement'
  | 'ForInStatement'
  | 'ForOfStatement'
  | 'WhileStatement'
  | 'DoWhileStatement'
  | 'TryStatement'
  | 'CatchClause'
  | 'ThrowStatement'
  | 'ReturnStatement'
  | 'BlockStatement'
  | 'ExpressionStatement'
  | 'ObjectExpression'
  | 'ArrayExpression'
  | 'SpreadElement'
  | 'AwaitExpression'
  | 'ClassDeclaration'
  | 'Identifier'
  | 'Comment';

/**
 * Minimal AST node interface for the visitor pattern.
 * Concrete parsers (SWC, tree-sitter) map to this shape.
 */
export interface ASTNode {
  /** Node type (e.g., "ImportDeclaration", "CallExpression") */
  readonly type: string;
  /** Start position */
  readonly start: Position;
  /** End position */
  readonly end: Position;
  /** Child nodes */
  readonly children?: readonly ASTNode[];
  /** Back-reference to parent node (populated during normalization) */
  readonly parent?: ASTNode;
  /** Original parser-specific node (for advanced use) */
  readonly raw?: unknown;
  /** Node-specific data (language-specific metadata) */
  readonly [key: string]: unknown;
}

/**
 * Position within a source file.
 */
export interface Position {
  /** 1-based line number */
  readonly line: number;
  /** 1-based column number */
  readonly column: number;
  /** 0-based character offset from start of file */
  readonly offset: number;
}

// =============================================================================
// Findings
// =============================================================================

/**
 * A suggested auto-fix for a finding — a simple text replacement.
 */
export interface Fix {
  /** Original code to replace */
  readonly from: string;
  /** Replacement code */
  readonly to: string;
}

/**
 * A text edit for programmatic auto-fixes (byte-range based).
 * Used by the --fix --write flow and plugin fix functions.
 */
export interface TextEdit {
  /** Byte offset range [start, end) to delete */
  readonly range: readonly [number, number];
  /** Replacement text to insert */
  readonly text: string;
}

/**
 * A suggested alternative fix shown to the user in `acv explain`.
 */
export interface Suggestion {
  /** Description of what the suggestion does */
  readonly description: string;
  /** The text edit to apply */
  readonly fix: TextEdit;
}

/**
 * A single finding reported by a rule during analysis.
 * This is the core output unit of the verification pipeline.
 */
export interface Finding {
  /** Rule identifier, e.g. "hallucinated-import" */
  readonly ruleId: string;
  /** Human-readable rule name, e.g. "Hallucinated Import" */
  readonly ruleName?: string;
  /** Finding severity */
  readonly severity: ActiveSeverity;
  /** Rule category */
  readonly category: RuleCategory;
  /** Human-readable description of the issue */
  readonly message: string;
  /** Absolute path to the file */
  readonly filePath: string;
  /** 1-based line number where the issue starts */
  readonly line: number;
  /** 1-based column number where the issue starts */
  readonly column: number;
  /** 1-based line number where the issue ends */
  readonly endLine: number;
  /** 1-based column number where the issue ends */
  readonly endColumn: number;
  /** Source code snippet containing the issue */
  readonly codeSnippet: string;
  /** Suggested auto-fix, if available */
  readonly fix: Fix | null;
  /** Human-readable suggested fix description (alias for quick access) */
  readonly suggestedFix?: string;
  /** Human-readable suggestion for manual resolution */
  readonly suggestion: string | null;
  /** OWASP Top 10 reference (e.g., "A01:2021-Broken Access Control"), null if N/A */
  readonly owaspRef: string | null;
  /** Confidence score (0.0–1.0) for the finding */
  readonly confidence: number;
  /** Optional metadata specific to the rule */
  readonly meta?: FindingMeta;
}

/**
 * Optional metadata attached to a finding for additional context.
 */
export interface FindingMeta {
  /** Which registry was checked (npm, pypi, cargo, etc.) */
  readonly registryChecked?: string;
  /** Levenshtein distance to closest known package */
  readonly levenshteinDistance?: number;
  /** Closest matching package name */
  readonly closestMatch?: string;
  /** CVE identifier if applicable */
  readonly cveId?: string;
  /** CVSS score if applicable */
  readonly cvssScore?: number;
  /** CWE identifier (e.g., "CWE-829") */
  readonly cweId?: string;
  /** Whether the finding was from a deprecated API */
  readonly deprecated?: boolean;
  /** The replacement API/package/method, if known */
  readonly replacement?: string;
  /** Additional key-value data */
  readonly [key: string]: unknown;
}

// =============================================================================
// Rules
// =============================================================================

/**
 * Context passed to a rule's visitor functions during analysis.
 * This is the primary API surface for rule authors.
 */
export interface RuleContext {
  /** Absolute path to the file being analyzed */
  readonly filePath: string;
  /** Detected language of the file */
  readonly language: Language;
  /** Rule-specific configuration from .acvrc */
  readonly config: RuleConfig;
  /** Report a finding */
  report(finding: Omit<Finding, 'ruleId' | 'category'>): void;
  /** Get the source text of a node */
  getSourceText(node: ASTNode): string;
  /** Get ancestors of the current node (root → parent chain) */
  getAncestors(): readonly ASTNode[];
}

/**
 * Per-rule configuration from .acvrc.
 */
export interface RuleConfig {
  /** Whether the rule is enabled */
  readonly enabled: boolean;
  /** Configured severity */
  readonly severity: Severity;
  /** Rule-specific options (passed from .acvrc rules section) */
  readonly options?: Readonly<Record<string, unknown>>;
}

/**
 * Metadata for a rule — documentation, examples, deprecation status.
 */
export interface RuleMeta {
  /** Description shown in `acv explain <rule-id>` */
  readonly description: string;
  /** URL to detailed online documentation */
  readonly docs?: string;
  /** Whether auto-fix is available */
  readonly fixable: boolean;
  /** Whether this rule is deprecated */
  readonly deprecated?: boolean;
  /** If deprecated, the replacement rule ID */
  readonly replacedBy?: string;
  /** Base confidence score (0.0–1.0) before context adjustments */
  readonly confidence?: number;
  /** Estimated false positive rate (0.0–1.0) */
  readonly falsePositiveRate?: number;
  /** Input/output examples for documentation */
  readonly examples?: readonly RuleExample[];
}

/**
 * An example of rule behavior — shown in `acv explain <rule-id>`.
 */
export interface RuleExample {
  /** Description of the example */
  readonly description: string;
  /** Code that triggers the rule (bad code) */
  readonly bad?: string;
  /** Code that does not trigger the rule (good code) */
  readonly good?: string;
}

/**
 * A rule definition — the core building block of analysis.
 * Rules use the visitor pattern to traverse AST nodes and report findings.
 */
export interface Rule {
  /** Unique identifier, e.g. "hallucinated-import" */
  readonly id: string;
  /** Human-readable name */
  readonly name: string;
  /** Which category this rule belongs to */
  readonly category: RuleCategory;
  /** Default severity (overridable in .acvrc) */
  readonly defaultSeverity: ActiveSeverity;
  /** Which languages this rule applies to */
  readonly languages: readonly Language[];
  /** Rule metadata: docs, examples, fixability, deprecation */
  readonly meta: RuleMeta;
  /**
   * Create a visitor for this rule. The visitor maps AST node types
   * to handler functions that analyze nodes and report findings.
   */
  create(context: RuleContext): RuleVisitor;
}

/**
 * A visitor maps AST node types to handler functions.
 * When the walker encounters a matching node type, the handler is called.
 *
 * Supports enter/exit lifecycle:
 *   - `ImportDeclaration` — called when entering the node
 *   - `ImportDeclaration:exit` — called when leaving the node
 *   - `Program:enter` — called before traversal begins
 *   - `Program:exit` — called after traversal completes
 */
export type RuleVisitor = {
  readonly [nodeType: string]: (node: ASTNode) => void;
};

// =============================================================================
// Scan Context & Import Info
// =============================================================================

/**
 * Information about a single import statement in a source file.
 * Used by the import extractor and fed into ScanContext for rule analysis.
 */
export interface ImportInfo {
  /** Module specifier (e.g., "lodash", "./utils", "@scope/pkg") */
  readonly source: string;
  /** Named/default specifiers imported (e.g., ["default", "map", "filter"]) */
  readonly specifiers: readonly string[];
  /** Whether this is a dynamic import (import() expression) */
  readonly isDynamic: boolean;
  /** 1-based line number of the import statement */
  readonly line: number;
  /** 1-based column number of the import statement */
  readonly column?: number;
  /** Whether this is a type-only import (TypeScript `import type`) */
  readonly isTypeOnly?: boolean;
  /** The full import statement text */
  readonly raw?: string;
}

/**
 * Context provided to rules during file analysis.
 * This is the per-file data bundle that the scan pipeline builds
 * and passes to the rule engine.
 *
 * ScanContext is distinct from RuleContext:
 * - ScanContext = data about the file (what is being scanned)
 * - RuleContext = API for rules to interact with the engine (how to report)
 */
export interface ScanContext {
  /** Absolute path to the file being analyzed */
  readonly filePath: string;
  /** Full source code text of the file */
  readonly sourceCode: string;
  /** Detected programming language */
  readonly language: Language;
  /** Extracted import statements from the file */
  readonly imports: readonly ImportInfo[];
  /** Parsed AST root node (available after parse phase) */
  readonly ast?: ASTNode;
  /** File size in bytes */
  readonly fileSize?: number;
  /** Content hash for caching (e.g., SHA-256) */
  readonly contentHash?: string;
}

// =============================================================================
// Scan Results
// =============================================================================

/**
 * Summary statistics for a completed scan.
 */
export interface ScanSummary {
  /** Total error-level findings */
  readonly errors: number;
  /** Total warning-level findings */
  readonly warnings: number;
  /** Total info-level findings */
  readonly info: number;
  /** Number of findings with auto-fix available */
  readonly fixable: number;
  /** Finding counts by category */
  readonly categories: Readonly<Record<RuleCategory, number>>;
}

/**
 * Scan execution metrics.
 */
export interface ScanMetrics {
  /** Total files discovered */
  readonly files: number;
  /** Total scan duration in milliseconds */
  readonly durationMs: number;
  /** Files served from cache */
  readonly cached: number;
  /** Files actually parsed */
  readonly parsed: number;
  /** Files skipped (too large, binary, etc.) */
  readonly skipped: number;
}

/**
 * Configuration snapshot used for the scan (for reproducibility).
 * Embedded in the ScanResult output.
 */
export interface ScanConfig {
  /** Severity threshold for exit code 1 */
  readonly failOn: Severity;
  /** Number of rules loaded */
  readonly rules: number;
  /** Languages analyzed */
  readonly languages: readonly Language[];
}

/**
 * Complete result of a scan operation.
 * This is the top-level output structure returned by the orchestrator
 * and consumed by output formatters.
 */
export interface ScanResult {
  /** ACV version that produced this result */
  readonly version: string;
  /** ISO 8601 timestamp of the scan */
  readonly timestamp: string;
  /** Configuration used for the scan */
  readonly config: ScanConfig;
  /** Scan execution metrics */
  readonly scan: ScanMetrics;
  /** All findings from the scan */
  readonly findings: readonly Finding[];
  /** Summary statistics */
  readonly summary: ScanSummary;
  /**
   * Exit code:
   * - 0: Success (no findings at or above --fail-on level)
   * - 1: Findings found at or above --fail-on level
   * - 2: Configuration error or invalid arguments
   * - 3: Runtime error (parse failure, worker crash)
   * - 4: No files found to scan
   */
  readonly exitCode: 0 | 1 | 2 | 3 | 4;
}

// =============================================================================
// Configuration (.acvrc)
// =============================================================================

/**
 * Parsed .acvrc configuration — the full typed representation of all
 * options available in .acvrc, .acvrc.yaml, .acvrc.toml, or acv.config.ts.
 *
 * Config precedence (highest first):
 *   1. CLI flags (--fail-on, --rules, etc.)
 *   2. .acvrc (project-local config)
 *   3. ~/.config/acv/config.json (user-level global config)
 *   4. Smart defaults (auto-detected from project context)
 */
export interface AcvConfig {
  /** Shared configurations to extend (e.g., "acv-config-recommended") */
  readonly extends?: readonly string[];
  /** Per-rule severity overrides */
  readonly rules: Readonly<Record<string, Severity>>;
  /** Category enable/disable toggles */
  readonly categories: Readonly<Record<RuleCategory, boolean>>;
  /** Languages to analyze (empty = auto-detect) */
  readonly languages: readonly Language[];
  /** Glob patterns to ignore (in addition to .gitignore) */
  readonly ignore: readonly string[];
  /** Severity threshold for exit code 1 */
  readonly failOn: Severity;
  /** Max warnings before exit 1 (-1 = unlimited) */
  readonly maxWarnings: number;
  /** Enable content-hash caching */
  readonly cache: boolean;
  /** Worker thread pool size (default: cpus - 1, min 2, max 8) */
  readonly maxWorkers: number;
  /** Skip files larger than this (e.g., "1mb") */
  readonly maxFileSize: string;
  /** Per-file parse timeout in milliseconds */
  readonly parseTimeout: number;
  /** Output format */
  readonly format: OutputFormat;
  /** Git hook configurations */
  readonly hooks: Readonly<Record<string, HookConfig>>;
  /** Plugin packages to load (e.g., ["acv-plugin-react"]) */
  readonly plugins?: readonly string[];
  /** Whether to scan test/fixture/mock/locale files (default: false) */
  readonly scanTestFiles?: boolean;
}

/**
 * Git hook configuration within .acvrc.
 */
export interface HookConfig {
  /** Severity threshold for this hook */
  readonly failOn: Severity;
  /** Only scan staged files (for pre-commit hooks) */
  readonly staged?: boolean;
  /** Rules to exclude for this hook */
  readonly excludeRules?: readonly string[];
}

/**
 * Supported output formats.
 */
export type OutputFormat = 'pretty' | 'json' | 'sarif' | 'junit' | 'github';

// =============================================================================
// Plugin Interface
// =============================================================================

/**
 * A language parser plugin — adds support for new languages.
 */
export interface LanguagePlugin {
  /** Language identifier (e.g., "kotlin", "swift") */
  readonly language: string;
  /** File extensions this plugin handles (e.g., [".kt", ".kts"]) */
  readonly extensions: readonly string[];
  /** Map language-specific node types to normalized ASTNodeType names */
  readonly nodeTypes?: Readonly<Record<string, ASTNodeType>>;
  /** Package ecosystem for this language (e.g., "npm", "pypi", "cargo", "cocoapods") */
  readonly ecosystem?: string;
  /** Parse source code into a normalized AST */
  parse(content: string, filePath: string): ASTNode;
}

/**
 * A custom output reporter plugin.
 */
export interface Reporter {
  /** Unique reporter name (used with --format flag) */
  readonly name: string;
  /** File extension for --output (e.g., ".html", ".csv") */
  readonly fileExtension?: string;
  /** Format scan results for output */
  format(result: ScanResult): string;
}

/**
 * File information passed to lifecycle hooks.
 */
export interface FileInfo {
  /** Absolute path to the file */
  readonly filePath: string;
  /** Detected language */
  readonly language: Language;
  /** File size in bytes */
  readonly sizeBytes: number;
}

/**
 * Lifecycle hooks for plugins to tap into the scan pipeline.
 */
export interface LifecycleHooks {
  /** Called before scanning begins. Can modify config. */
  beforeScan?(config: AcvConfig): void | AcvConfig | Promise<void | AcvConfig>;
  /** Called after scanning completes. Can modify results. */
  afterScan?(result: ScanResult): void | ScanResult | Promise<void | ScanResult>;
  /** Called before each file is analyzed */
  beforeFile?(file: FileInfo): void | Promise<void>;
  /** Called after each file is analyzed. Can filter findings. */
  afterFile?(
    file: FileInfo,
    findings: readonly Finding[],
  ): void | readonly Finding[] | Promise<void | readonly Finding[]>;
}

/**
 * The plugin interface — the extension point for acv.
 * Plugins can add rules, language support, reporters, and lifecycle hooks.
 *
 * Plugins are npm packages that export this interface as their default export:
 *   - `acv-plugin-*` packages are auto-discovered in node_modules
 *   - Plugins can also be specified in .acvrc "plugins" array
 *   - Local plugins can be placed in `.acv/plugins/`
 */
export interface PluginInterface {
  /** Unique plugin name (should match npm package name) */
  readonly name: string;
  /** Plugin version (semver) */
  readonly version: string;
  /** Custom detection rules */
  readonly rules?: readonly Rule[];
  /** New language parsers */
  readonly languages?: readonly LanguagePlugin[];
  /** Custom output formatters */
  readonly reporters?: readonly Reporter[];
  /** Lifecycle hooks */
  readonly hooks?: LifecycleHooks;
}

// =============================================================================
// Package Registry (Offline Data Layer)
// =============================================================================

/**
 * Package information from the offline registry database.
 * Returned by the registry lookup API available to rule authors.
 */
export interface PackageInfo {
  /** Package name (e.g., "express", "lodash") */
  readonly name: string;
  /** Which ecosystem/registry this package is from */
  readonly ecosystem: PackageEcosystem;
  /** Latest known version */
  readonly latestVersion: string;
  /** Whether the package is deprecated */
  readonly deprecated: boolean;
  /** Deprecation message, if deprecated */
  readonly deprecationMessage?: string;
  /** Number of known dependents (popularity signal) */
  readonly dependents?: number;
  /** Weekly download count (popularity signal) */
  readonly weeklyDownloads?: number;
  /** Package description */
  readonly description?: string;
  /** Package homepage URL */
  readonly homepage?: string;
  /** Package license (e.g., "MIT", "Apache-2.0") */
  readonly license?: string;
  /** ISO 8601 timestamp of when registry data was last updated */
  readonly lastUpdated: string;
  /** Known CVE/advisory IDs associated with this package */
  readonly advisoryIds?: readonly string[];
}

/**
 * CVE/security advisory for a package.
 */
export interface CVE {
  /** Advisory identifier (e.g., "GHSA-xxxx-yyyy-zzzz" or "CVE-2024-12345") */
  readonly id: string;
  /** Aliases (e.g., CVE ID if primary is GHSA, or vice versa) */
  readonly aliases?: readonly string[];
  /** Advisory severity */
  readonly severity: 'critical' | 'high' | 'medium' | 'low';
  /** CVSS score (0.0–10.0) */
  readonly cvssScore?: number;
  /** Human-readable summary */
  readonly summary: string;
  /** Affected version ranges (semver) */
  readonly affectedVersions: string;
  /** First patched version, if available */
  readonly patchedVersion?: string;
  /** CWE identifier (e.g., "CWE-79") */
  readonly cweId?: string;
  /** Reference URLs */
  readonly references?: readonly string[];
  /** ISO 8601 timestamp of when the advisory was published */
  readonly publishedAt: string;
}

/**
 * Deprecation information for a library API method.
 */
export interface DeprecationInfo {
  /** The deprecated method/function name */
  readonly method: string;
  /** Package the method belongs to */
  readonly packageName: string;
  /** Version in which the method was deprecated */
  readonly deprecatedIn: string;
  /** Version in which the method was removed (if applicable) */
  readonly removedIn?: string;
  /** Replacement method/function name */
  readonly replacement?: string;
  /** Migration guidance */
  readonly migrationGuide?: string;
}

// =============================================================================
// Scan Configuration Utility Types
// =============================================================================

/**
 * CLI flags that override .acvrc configuration.
 * These are parsed by the arg parser and merged with the config.
 */
export interface CLIFlags {
  /** Path to scan (default: ".") */
  readonly path?: string;
  /** Show suggested fixes inline */
  readonly fix?: boolean;
  /** Apply auto-fixes to files */
  readonly write?: boolean;
  /** Only check git-staged files */
  readonly staged?: boolean;
  /** Only check files changed since git ref */
  readonly since?: string;
  /** Output format override */
  readonly format?: OutputFormat;
  /** Write results to file */
  readonly output?: string;
  /** Severity threshold override */
  readonly failOn?: Severity;
  /** Stop on first critical finding */
  readonly failFast?: boolean;
  /** Only run specific rules */
  readonly rules?: readonly string[];
  /** Skip specific rules */
  readonly excludeRules?: readonly string[];
  /** Additional ignore patterns */
  readonly ignore?: readonly string[];
  /** Disable cache */
  readonly noCache?: boolean;
  /** Max warnings override */
  readonly maxWarnings?: number;
  /** Max file size override */
  readonly maxFileSize?: string;
  /** Worker count override */
  readonly concurrency?: number;
  /** Verbose output */
  readonly verbose?: boolean;
  /** Quiet mode (errors only) */
  readonly quiet?: boolean;
  /** No color output */
  readonly noColor?: boolean;
}

// =============================================================================
// Severity Ordering Utilities
// =============================================================================

/**
 * Numeric ordering of severity levels (higher = more severe).
 * Used for comparing, sorting, and filtering findings by severity.
 *
 * 'off' = 0 (disabled), 'info' = 1, 'warn' = 2, 'error' = 3
 */
export const SEVERITY_ORDER: Readonly<Record<Severity, number>> = {
  off: 0,
  info: 1,
  warn: 2,
  error: 3,
} as const;

/**
 * Compare two severity levels numerically.
 * Returns negative if a < b, zero if equal, positive if a > b.
 *
 * @example
 * ```typescript
 * compareSeverity('error', 'warn');  // > 0 (error is more severe)
 * compareSeverity('info', 'warn');   // < 0 (info is less severe)
 * compareSeverity('warn', 'warn');   // 0
 * ```
 */
export function compareSeverity(a: Severity, b: Severity): number {
  return SEVERITY_ORDER[a] - SEVERITY_ORDER[b];
}

/**
 * Check if severity `a` is strictly more severe than `b`.
 *
 * @example
 * ```typescript
 * isMoreSevere('error', 'warn');  // true
 * isMoreSevere('warn', 'error'); // false
 * isMoreSevere('warn', 'warn');  // false
 * ```
 */
export function isMoreSevere(a: Severity, b: Severity): boolean {
  return SEVERITY_ORDER[a] > SEVERITY_ORDER[b];
}

/**
 * Return the more severe of two severity levels.
 * If equal, returns the first argument.
 *
 * @example
 * ```typescript
 * maxSeverity('warn', 'error'); // 'error'
 * maxSeverity('info', 'warn');  // 'warn'
 * ```
 */
export function maxSeverity(a: Severity, b: Severity): Severity {
  return SEVERITY_ORDER[a] >= SEVERITY_ORDER[b] ? a : b;
}

/**
 * Sort an array of severities from most to least severe.
 *
 * @example
 * ```typescript
 * sortSeverities(['info', 'error', 'warn']); // ['error', 'warn', 'info']
 * ```
 */
export function sortSeverities(severities: readonly Severity[]): Severity[] {
  return [...severities].sort((a, b) => SEVERITY_ORDER[b] - SEVERITY_ORDER[a]);
}

/**
 * Check if a severity level meets or exceeds a threshold.
 * Useful for --fail-on logic.
 *
 * @example
 * ```typescript
 * meetsThreshold('error', 'warn');  // true  (error >= warn)
 * meetsThreshold('info', 'warn');   // false (info < warn)
 * meetsThreshold('warn', 'warn');   // true  (warn >= warn)
 * ```
 */
export function meetsThreshold(severity: Severity, threshold: Severity): boolean {
  return SEVERITY_ORDER[severity] >= SEVERITY_ORDER[threshold];
}

// =============================================================================
// Type Guards
// =============================================================================

/** All valid severity strings */
const VALID_SEVERITIES = new Set<string>(['error', 'warn', 'info', 'off']);

/** All valid active severity strings (excludes 'off') */
const VALID_ACTIVE_SEVERITIES = new Set<string>(['error', 'warn', 'info']);

/** All valid rule category strings */
const VALID_CATEGORIES = new Set<string>(['ai-specific', 'security', 'correctness']);

/**
 * Type guard: check if a value is a valid Severity.
 */
export function isSeverity(value: unknown): value is Severity {
  return typeof value === 'string' && VALID_SEVERITIES.has(value);
}

/**
 * Type guard: check if a value is a valid ActiveSeverity (excludes 'off').
 */
export function isActiveSeverity(value: unknown): value is ActiveSeverity {
  return typeof value === 'string' && VALID_ACTIVE_SEVERITIES.has(value);
}

/**
 * Type guard: check if a value is a valid RuleCategory.
 */
export function isRuleCategory(value: unknown): value is RuleCategory {
  return typeof value === 'string' && VALID_CATEGORIES.has(value);
}

/**
 * Type guard: check if an object is a Finding.
 * Validates structural shape — does NOT validate content correctness.
 */
export function isFinding(value: unknown): value is Finding {
  if (typeof value !== 'object' || value === null) return false;
  const obj = value as Record<string, unknown>;
  return (
    typeof obj.ruleId === 'string' &&
    isActiveSeverity(obj.severity) &&
    isRuleCategory(obj.category) &&
    typeof obj.message === 'string' &&
    typeof obj.filePath === 'string' &&
    typeof obj.line === 'number' &&
    typeof obj.column === 'number'
  );
}

/**
 * Type guard: check if an object is a Rule.
 * Validates structural shape — does NOT validate content correctness.
 */
export function isRule(value: unknown): value is Rule {
  if (typeof value !== 'object' || value === null) return false;
  const obj = value as Record<string, unknown>;
  return (
    typeof obj.id === 'string' &&
    typeof obj.name === 'string' &&
    isRuleCategory(obj.category) &&
    isActiveSeverity(obj.defaultSeverity) &&
    Array.isArray(obj.languages) &&
    typeof obj.meta === 'object' &&
    obj.meta !== null &&
    typeof obj.create === 'function'
  );
}

/**
 * Type guard: check if an object is a ScanResult.
 * Validates structural shape — does NOT validate content correctness.
 */
export function isScanResult(value: unknown): value is ScanResult {
  if (typeof value !== 'object' || value === null) return false;
  const obj = value as Record<string, unknown>;
  return (
    typeof obj.version === 'string' &&
    typeof obj.timestamp === 'string' &&
    Array.isArray(obj.findings) &&
    typeof obj.summary === 'object' &&
    obj.summary !== null &&
    typeof obj.exitCode === 'number'
  );
}

/**
 * Type guard: check if an object is an ImportInfo.
 */
export function isImportInfo(value: unknown): value is ImportInfo {
  if (typeof value !== 'object' || value === null) return false;
  const obj = value as Record<string, unknown>;
  return (
    typeof obj.source === 'string' &&
    Array.isArray(obj.specifiers) &&
    typeof obj.isDynamic === 'boolean' &&
    typeof obj.line === 'number'
  );
}

/**
 * Type guard: check if an object is a ScanContext.
 */
export function isScanContext(value: unknown): value is ScanContext {
  if (typeof value !== 'object' || value === null) return false;
  const obj = value as Record<string, unknown>;
  return (
    typeof obj.filePath === 'string' &&
    typeof obj.sourceCode === 'string' &&
    typeof obj.language === 'string' &&
    Array.isArray(obj.imports)
  );
}

// =============================================================================
// Utility Types & Helpers
// =============================================================================

/**
 * Helper to define acv configuration with type safety.
 * Used in acv.config.ts files for autocomplete support.
 *
 * @example
 * ```typescript
 * // acv.config.ts
 * import { defineConfig } from 'ai-code-verifier';
 *
 * export default defineConfig({
 *   rules: {
 *     'hallucinated-import': 'error',
 *     'phantom-api-call': 'warn',
 *   },
 *   failOn: 'error',
 * });
 * ```
 */
export function defineConfig(config: Partial<AcvConfig>): Partial<AcvConfig> {
  return config;
}

/**
 * Helper to define a plugin with type safety.
 *
 * @example
 * ```typescript
 * // acv-plugin-react/src/index.ts
 * import { definePlugin } from 'ai-code-verifier';
 *
 * export default definePlugin({
 *   name: 'acv-plugin-react',
 *   version: '1.0.0',
 *   rules: [myCustomRule],
 * });
 * ```
 */
export function definePlugin(plugin: PluginInterface): PluginInterface {
  return plugin;
}

/**
 * Helper to define a rule with type safety.
 *
 * @example
 * ```typescript
 * import { defineRule } from 'ai-code-verifier';
 *
 * export const myRule = defineRule({
 *   id: 'my-plugin/no-foo',
 *   name: 'No Foo Usage',
 *   category: 'correctness',
 *   defaultSeverity: 'warn',
 *   languages: ['javascript', 'typescript'],
 *   meta: {
 *     description: 'Disallows usage of foo()',
 *     fixable: false,
 *   },
 *   create(context) {
 *     return {
 *       CallExpression(node) {
 *         // ...
 *       },
 *     };
 *   },
 * });
 * ```
 */
export function defineRule(rule: Rule): Rule {
  return rule;
}
