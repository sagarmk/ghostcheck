/**
 * Argument parsing utilities and validation.
 * Complements the yargs CLI setup with custom validation logic.
 */

import type { Severity, OutputFormat, Language } from '../core/types.js';

/**
 * Parsed CLI arguments after validation.
 */
export interface ParsedCheckArgs {
  readonly path: string;
  readonly fix: boolean;
  readonly write: boolean;
  readonly staged: boolean;
  readonly since?: string;
  readonly format: OutputFormat;
  readonly output?: string;
  readonly failOn: Severity;
  readonly failFast: boolean;
  readonly rules?: readonly string[];
  readonly excludeRules?: readonly string[];
  readonly ignore: readonly string[];
  readonly noCache: boolean;
  readonly maxWarnings: number;
  readonly maxFileSize: string;
  readonly concurrency?: number;
  readonly verbose: boolean;
  readonly quiet: boolean;
  readonly noColor: boolean;
}

/**
 * Parse a comma-separated rule list into an array.
 */
export function parseRuleList(input: string | undefined): string[] | undefined {
  if (!input) return undefined;
  return input
    .split(',')
    .map((r) => r.trim())
    .filter(Boolean);
}

/**
 * Parse file size string (e.g., "1mb", "500kb") to bytes.
 */
export function parseFileSize(input: string): number {
  const match = /^(\d+(?:\.\d+)?)\s*(b|kb|mb|gb)$/i.exec(input.trim());
  if (!match) {
    throw new Error(`Invalid file size: "${input}". Use format like "1mb", "500kb".`);
  }

  const value = parseFloat(match[1]!);
  const unit = match[2]!.toLowerCase();

  const multipliers: Record<string, number> = {
    b: 1,
    kb: 1024,
    mb: 1024 * 1024,
    gb: 1024 * 1024 * 1024,
  };

  return Math.floor(value * multipliers[unit]!);
}

/**
 * Validate that --write is only used with --fix.
 */
export function validateFixWriteArgs(fix: boolean, write: boolean): void {
  if (write && !fix) {
    throw new Error('--write requires --fix. Use "acv check --fix --write" to apply fixes.');
  }
}

/**
 * Map severity string from CLI to internal Severity type.
 */
export function mapSeverity(input: string): Severity {
  const mapping: Record<string, Severity> = {
    critical: 'error',
    high: 'error',
    medium: 'warn',
    low: 'warn',
    info: 'info',
  };

  const result = mapping[input.toLowerCase()];
  if (!result) {
    throw new Error(`Unknown severity: "${input}"`);
  }
  return result;
}

/**
 * Validate language strings against supported languages.
 */
export function validateLanguages(languages: readonly string[]): Language[] {
  const supported = new Set<string>([
    'javascript',
    'typescript',
    'python',
    'go',
    'rust',
    'java',
    'ruby',
  ]);

  const validated: Language[] = [];
  for (const lang of languages) {
    if (!supported.has(lang.toLowerCase())) {
      throw new Error(`Unsupported language: "${lang}". Supported: ${[...supported].join(', ')}`);
    }
    validated.push(lang.toLowerCase() as Language);
  }
  return validated;
}
