/**
 * Core module — re-exports all public types and utilities.
 *
 * This is the main entry point for programmatic usage:
 *   import { ScanResult, Finding, defineConfig } from 'ai-code-verifier';
 */

export type {
  // Severity & Category
  Severity,
  ActiveSeverity,
  RuleCategory,
  ExtendedRuleCategory,
  Language,
  PackageEcosystem,

  // AST
  ASTNodeType,
  ASTNode,
  Position,

  // Findings
  Fix,
  TextEdit,
  Suggestion,
  Finding,
  FindingMeta,

  // Rules
  RuleContext,
  RuleConfig,
  RuleMeta,
  RuleExample,
  Rule,
  RuleVisitor,

  // Scan Context & Import Info
  ImportInfo,
  ScanContext,

  // Scan Results
  ScanSummary,
  ScanMetrics,
  ScanConfig,
  ScanResult,

  // Configuration
  AcvConfig,
  HookConfig,
  OutputFormat,
  CLIFlags,

  // Plugins
  LanguagePlugin,
  Reporter,
  FileInfo,
  LifecycleHooks,
  PluginInterface,

  // Package Registry
  PackageInfo,
  CVE,
  DeprecationInfo,
} from './types.js';

// Severity ordering utilities
export {
  SEVERITY_ORDER,
  compareSeverity,
  isMoreSevere,
  maxSeverity,
  sortSeverities,
  meetsThreshold,
} from './types.js';

// Type guards
export {
  isSeverity,
  isActiveSeverity,
  isRuleCategory,
  isFinding,
  isRule,
  isScanResult,
  isImportInfo,
  isScanContext,
} from './types.js';

// Define helpers for plugin authors
export { defineConfig, definePlugin, defineRule } from './types.js';
