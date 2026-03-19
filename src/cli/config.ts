/**
 * Configuration loader using cosmiconfig.
 * Loads .acvrc, .acvrc.json, .acvrc.yaml, .acvrc.toml, acv.config.ts, etc.
 */

import { cosmiconfig } from 'cosmiconfig';
import { cpus } from 'node:os';
import type { AcvConfig, RuleCategory } from '../core/types.js';

/**
 * Compute default worker count from available CPUs.
 */
function defaultMaxWorkers(): number {
  return Math.max(2, Math.min(8, cpus().length - 1));
}

/**
 * Default configuration values.
 * Applied when no .acvrc is found or for missing fields.
 */
export const DEFAULT_CONFIG: AcvConfig = {
  rules: {
    'hallucinated-import': 'error',
    'phantom-api-call': 'warn',
    'outdated-api-usage': 'warn',
    'cargo-cult-pattern': 'warn',
    'over-commented-obvious-code': 'info',
    'inconsistent-naming-convention': 'info',
    'hardcoded-secret-pattern': 'error',
    'eval-usage': 'error',
    'sql-injection-concat': 'error',
    'insecure-random': 'warn',
    'ssrf-pattern': 'warn',
    'path-traversal': 'warn',
    'prototype-pollution': 'warn',
    'xxe-parsing': 'warn',
    'open-redirect': 'warn',
    'dead-code-after-return': 'warn',
    'unreachable-branch': 'warn',
    'empty-catch-block': 'warn',
    'placeholder-todo-stub': 'warn',
    'unused-import': 'info',
    'type-coercion-risk': 'warn',
    'missing-null-check': 'warn',
    'incomplete-error-handling': 'warn',
  },
  categories: {
    'ai-specific': true,
    security: true,
    correctness: true,
  },
  languages: [],
  ignore: ['**/*.test.ts', '**/*.spec.ts', 'dist/**', 'generated/**', '**/*.min.js'],
  failOn: 'error',
  maxWarnings: -1,
  cache: true,
  maxWorkers: defaultMaxWorkers(),
  maxFileSize: '1mb',
  parseTimeout: 5000,
  format: 'pretty',
  hooks: {
    'pre-commit': { failOn: 'error', staged: true },
    'pre-push': { failOn: 'error' },
  },
};

/**
 * Load and merge configuration from .acvrc files.
 * Returns the merged config with defaults applied for missing fields.
 */
export async function loadConfig(searchFrom?: string): Promise<AcvConfig> {
  const explorer = cosmiconfig('acv', {
    searchPlaces: [
      '.acvrc',
      '.acvrc.json',
      '.acvrc.yaml',
      '.acvrc.yml',
      '.acvrc.js',
      '.acvrc.mjs',
      'acv.config.js',
      'acv.config.mjs',
    ],
  });

  const result = await explorer.search(searchFrom);

  if (!result || result.isEmpty) {
    return DEFAULT_CONFIG;
  }

  return mergeConfig(result.config as Partial<AcvConfig>);
}

/**
 * Merge user config with defaults.
 * User values take precedence; defaults fill in gaps.
 */
function mergeConfig(userConfig: Partial<AcvConfig>): AcvConfig {
  return {
    extends: userConfig.extends,
    rules: { ...DEFAULT_CONFIG.rules, ...userConfig.rules },
    categories: { ...DEFAULT_CONFIG.categories, ...userConfig.categories } as Record<
      RuleCategory,
      boolean
    >,
    languages: userConfig.languages ?? DEFAULT_CONFIG.languages,
    ignore: userConfig.ignore ?? DEFAULT_CONFIG.ignore,
    failOn: userConfig.failOn ?? DEFAULT_CONFIG.failOn,
    maxWarnings: userConfig.maxWarnings ?? DEFAULT_CONFIG.maxWarnings,
    cache: userConfig.cache ?? DEFAULT_CONFIG.cache,
    maxWorkers: userConfig.maxWorkers ?? DEFAULT_CONFIG.maxWorkers,
    maxFileSize: userConfig.maxFileSize ?? DEFAULT_CONFIG.maxFileSize,
    parseTimeout: userConfig.parseTimeout ?? DEFAULT_CONFIG.parseTimeout,
    format: userConfig.format ?? DEFAULT_CONFIG.format,
    hooks: { ...DEFAULT_CONFIG.hooks, ...userConfig.hooks },
    plugins: userConfig.plugins,
    scanTestFiles: userConfig.scanTestFiles ?? DEFAULT_CONFIG.scanTestFiles,
  };
}
