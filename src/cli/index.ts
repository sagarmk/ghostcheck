#!/usr/bin/env node

/**
 * AI Code Verifier (acv) — CLI Entry Point
 *
 * Command structure mirrors docs/dx-design.md:
 *   acv check [path]       Scan files for issues
 *   acv watch [path]       Watch mode — re-scan on changes
 *   acv init               Generate .acvrc configuration
 *   acv hook <action>      Manage git hooks (install | uninstall)
 *   acv ci                 CI-optimized scan
 *   acv update             Update offline databases
 *   acv rules <action>     List, enable, disable rules
 *   acv explain <rule-id>  Show rule documentation
 *   acv cache <action>     Manage analysis cache
 */

import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { resolve } from 'node:path';

import { loadConfig } from './config.js';
import { mapSeverity, parseRuleList } from './args.js';
import { OutputEngine } from '../output/engine.js';
import { scan } from '../engine/scanner.js';
import type {
  AcvConfig,
  OutputFormat,
} from '../core/types.js';

const EXIT_CODES = {
  SUCCESS: 0,
  FINDINGS: 1,
  CONFIG_ERROR: 2,
  RUNTIME_ERROR: 3,
  NO_FILES: 4,
} as const;

// Shared check options used by both `check` and `watch`
const checkOptions = {
  fix: {
    type: 'boolean' as const,
    describe: 'Show suggested fixes inline',
    default: false,
  },
  write: {
    type: 'boolean' as const,
    describe: 'Apply auto-fixes to files (requires --fix)',
    default: false,
  },
  staged: {
    type: 'boolean' as const,
    describe: 'Only check git-staged files',
    default: false,
  },
  since: {
    type: 'string' as const,
    describe: 'Only check files changed since git ref',
  },
  format: {
    type: 'string' as const,
    describe: 'Output format',
    choices: ['pretty', 'json', 'sarif', 'junit', 'github', 'text'] as const,
    default: 'pretty',
  },
  output: {
    type: 'string' as const,
    describe: 'Write results to file instead of stdout',
    alias: 'o',
  },
  severity: {
    type: 'string' as const,
    describe: 'Filter findings by minimum severity',
    choices: ['error', 'warning', 'warn', 'info'] as const,
  },
  'fail-on': {
    type: 'string' as const,
    describe: 'Exit 1 if findings >= severity',
    choices: ['critical', 'high', 'medium', 'low', 'info'] as const,
    default: 'critical',
  },
  'fail-fast': {
    type: 'boolean' as const,
    describe: 'Stop on first critical finding',
    default: false,
  },
  rules: {
    type: 'string' as const,
    describe: 'Only run specific rules (comma-separated)',
  },
  'exclude-rules': {
    type: 'string' as const,
    describe: 'Skip specific rules (comma-separated)',
  },
  ignore: {
    type: 'string' as const,
    describe: 'Additional glob patterns to ignore',
    array: true,
  },
  'no-cache': {
    type: 'boolean' as const,
    describe: 'Skip the content-hash cache',
    default: false,
  },
  'max-warnings': {
    type: 'number' as const,
    describe: 'Exit 1 if warnings exceed count',
    default: -1,
  },
  'max-file-size': {
    type: 'string' as const,
    describe: 'Skip files larger than this (e.g., 1mb)',
    default: '1mb',
  },
  concurrency: {
    type: 'number' as const,
    describe: 'Worker thread count (default: auto)',
  },
};

// =============================================================================
// Check command handler
// =============================================================================

/**
 * Merge CLI arguments with loaded config.
 * CLI flags take precedence over .acvrc config.
 */
function mergeCliWithConfig(
  argv: Record<string, unknown>,
  config: AcvConfig,
): AcvConfig {
  return {
    ...config,
    failOn: argv['fail-on']
      ? mapSeverity(argv['fail-on'] as string)
      : config.failOn,
    maxWarnings:
      typeof argv['max-warnings'] === 'number' && argv['max-warnings'] !== -1
        ? argv['max-warnings']
        : config.maxWarnings,
    maxFileSize:
      argv['max-file-size'] && argv['max-file-size'] !== '1mb'
        ? (argv['max-file-size'] as string)
        : config.maxFileSize,
    ignore:
      argv['ignore'] && (argv['ignore'] as string[]).length > 0
        ? [...config.ignore, ...(argv['ignore'] as string[])]
        : config.ignore,
    format:
      argv['format'] && argv['format'] !== 'pretty'
        ? normalizeFormat(argv['format'] as string)
        : config.format,
    cache: argv['no-cache'] ? false : config.cache,
  };
}

/**
 * Normalize format aliases (e.g., 'text' → 'pretty').
 */
function normalizeFormat(format: string): OutputFormat {
  if (format === 'text') return 'pretty';
  return format as OutputFormat;
}

/**
 * Handle the `acv check` command.
 */
async function handleCheck(argv: Record<string, unknown>): Promise<void> {
  const targetPath = resolve((argv['path'] as string) ?? '.');
  const verbose = argv['verbose'] as boolean;

  try {
    // ── 1. Load config ──────────────────────────────────────────────────
    if (verbose) {
      process.stderr.write('Loading configuration...\n');
    }

    const config = await loadConfig(targetPath);
    const mergedConfig = mergeCliWithConfig(argv, config);

    // Parse rule filters
    const onlyRules = parseRuleList(argv['rules'] as string | undefined);
    const excludeRules = parseRuleList(argv['exclude-rules'] as string | undefined);

    // ── 2. Run scan pipeline (discovery → parse → rules → results) ────
    const result = await scan(targetPath, {
      config: mergedConfig,
      onlyRules,
      excludeRules,
      verbose,
      skipRegistry: true, // Skip npm registry for offline/fast scans
      staged: (argv['staged'] as boolean) ?? false,
      since: argv['since'] as string | undefined,
    });

    // ── 3. Format and output ────────────────────────────────────────────
    const engine = new OutputEngine();
    const outputFormat = normalizeFormat(
      (argv['format'] as string) ?? mergedConfig.format,
    );
    const output = engine.format(result, outputFormat);

    const outputFile = argv['output'] as string | undefined;
    if (outputFile) {
      const { writeFile } = await import('node:fs/promises');
      await writeFile(resolve(outputFile), output, 'utf-8');
      if (verbose) {
        process.stderr.write(`Results written to ${outputFile}\n`);
      }
    } else {
      process.stdout.write(output + '\n');
    }

    // ── 4. Set exit code ────────────────────────────────────────────────
    process.exitCode = result.exitCode;

    if (verbose) {
      process.stderr.write(
        `\nScan complete: ${String(result.scan.files)} files, ${String(result.findings.length)} findings, ${String(result.scan.durationMs)}ms\n`,
      );
    }
  } catch (error: unknown) {
    if (
      error instanceof Error &&
      'code' in error &&
      (error as { code: string }).code === 'PATH_NOT_FOUND'
    ) {
      process.stderr.write(`Error: ${error.message}\n`);
      process.exitCode = EXIT_CODES.CONFIG_ERROR;
      return;
    }

    process.stderr.write(
      `Error: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = EXIT_CODES.RUNTIME_ERROR;
  }
}

// =============================================================================
// CLI definition
// =============================================================================

async function main(): Promise<void> {
  await yargs(hideBin(process.argv))
    .scriptName('acv')
    .usage('$0 <command> [options]')
    .version()
    .help()
    .alias('h', 'help')
    .alias('v', 'version')
    .strict()
    .demandCommand(1, 'You must specify a command. Run acv --help for usage.')

    // ── Global options ──────────────────────────────────────────────────
    .option('no-color', {
      type: 'boolean',
      describe: 'Disable colored output',
      default: false,
    })
    .option('verbose', {
      type: 'boolean',
      describe: 'Show debug information',
      default: false,
    })
    .option('quiet', {
      type: 'boolean',
      describe: 'Only show errors',
      alias: 'q',
      default: false,
    })

    // ── acv check [path] ────────────────────────────────────────────────
    .command(
      'check [path]',
      'Scan files for issues',
      (y) =>
        y
          .positional('path', {
            type: 'string',
            describe: 'Directory or file to scan',
            default: '.',
          })
          .options(checkOptions),
      (argv) => {
        void handleCheck(argv as unknown as Record<string, unknown>);
      },
    )

    // ── acv watch [path] ────────────────────────────────────────────────
    .command(
      'watch [path]',
      'Watch mode — re-scan on changes',
      (y) =>
        y
          .positional('path', {
            type: 'string',
            describe: 'Directory or file to watch',
            default: '.',
          })
          .options(checkOptions)
          .option('debounce', {
            type: 'number',
            describe: 'Debounce interval in ms',
            default: 300,
          })
          .option('clear', {
            type: 'boolean',
            describe: 'Clear screen between runs',
            default: false,
          }),
      (_argv) => {
        // TODO: Wire up chokidar watcher + orchestrator
        process.stderr.write('acv watch: not yet implemented\n');
        process.exitCode = EXIT_CODES.RUNTIME_ERROR;
      },
    )

    // ── acv init ────────────────────────────────────────────────────────
    .command(
      'init',
      'Generate .acvrc configuration file',
      (y) =>
        y
          .option('format', {
            type: 'string',
            describe: 'Config format',
            choices: ['json', 'yaml', 'toml'] as const,
            default: 'json',
          })
          .option('preset', {
            type: 'string',
            describe: 'Use a preset configuration',
            choices: ['recommended', 'strict', 'minimal'] as const,
          })
          .option('yes', {
            type: 'boolean',
            describe: 'Skip prompts, use defaults',
            alias: 'y',
            default: false,
          }),
      (_argv) => {
        // TODO: Generate .acvrc from template
        process.stderr.write('acv init: not yet implemented\n');
        process.exitCode = EXIT_CODES.RUNTIME_ERROR;
      },
    )

    // ── acv hook <action> ───────────────────────────────────────────────
    .command(
      'hook <action>',
      'Manage git hooks',
      (y) =>
        y.positional('action', {
          type: 'string',
          describe: 'Hook action',
          choices: ['install', 'uninstall'] as const,
          demandOption: true,
        }),
      (_argv) => {
        // TODO: Install/uninstall git hooks
        process.stderr.write('acv hook: not yet implemented\n');
        process.exitCode = EXIT_CODES.RUNTIME_ERROR;
      },
    )

    // ── acv ci ──────────────────────────────────────────────────────────
    .command(
      'ci',
      'CI-optimized scan (auto-detect format and settings)',
      (y) =>
        y.options({
          format: {
            type: 'string',
            describe: 'Override output format',
            choices: ['json', 'sarif', 'junit', 'github'] as const,
          },
          'fail-on': {
            type: 'string',
            describe: 'Exit 1 if findings >= severity',
            choices: ['critical', 'high', 'medium', 'low', 'info'] as const,
            default: 'critical',
          },
        }),
      (_argv) => {
        // TODO: CI scan (auto-detect GitHub/GitLab/etc.)
        process.stderr.write('acv ci: not yet implemented\n');
        process.exitCode = EXIT_CODES.RUNTIME_ERROR;
      },
    )

    // ── acv update ──────────────────────────────────────────────────────
    .command(
      'update',
      'Update offline package registry and CVE databases',
      (y) =>
        y
          .option('force', {
            type: 'boolean',
            describe: 'Force full download (skip delta sync)',
            default: false,
          })
          .option('check', {
            type: 'boolean',
            describe: 'Check for updates without downloading',
            default: false,
          })
          .option('proxy', {
            type: 'string',
            describe: 'HTTP proxy URL',
          }),
      (_argv) => {
        // TODO: Delta/full database update
        process.stderr.write('acv update: not yet implemented\n');
        process.exitCode = EXIT_CODES.RUNTIME_ERROR;
      },
    )

    // ── acv rules <action> ──────────────────────────────────────────────
    .command(
      'rules <action>',
      'Manage rules',
      (y) =>
        y
          .positional('action', {
            type: 'string',
            describe: 'Rules action',
            choices: ['list', 'enable', 'disable'] as const,
            demandOption: true,
          })
          .option('category', {
            type: 'string',
            describe: 'Filter by category',
            choices: ['ai-specific', 'security', 'correctness'] as const,
          })
          .positional('rule-id', {
            type: 'string',
            describe: 'Rule ID (for enable/disable)',
          }),
      (_argv) => {
        // TODO: List/enable/disable rules
        process.stderr.write('acv rules: not yet implemented\n');
        process.exitCode = EXIT_CODES.RUNTIME_ERROR;
      },
    )

    // ── acv explain <rule-id> ───────────────────────────────────────────
    .command(
      'explain <rule-id>',
      'Show detailed documentation for a rule',
      (y) =>
        y.positional('rule-id', {
          type: 'string',
          describe: 'Rule ID to explain',
          demandOption: true,
        }),
      (_argv) => {
        // TODO: Display rule docs
        process.stderr.write('acv explain: not yet implemented\n');
        process.exitCode = EXIT_CODES.RUNTIME_ERROR;
      },
    )

    // ── acv cache <action> ──────────────────────────────────────────────
    .command(
      'cache <action>',
      'Manage analysis cache',
      (y) =>
        y.positional('action', {
          type: 'string',
          describe: 'Cache action',
          choices: ['clean', 'stats'] as const,
          demandOption: true,
        }),
      (_argv) => {
        // TODO: Cache management
        process.stderr.write('acv cache: not yet implemented\n');
        process.exitCode = EXIT_CODES.RUNTIME_ERROR;
      },
    )

    .example('acv check', 'Scan current directory')
    .example('acv check src/ --format json', 'Scan src/ with JSON output')
    .example('acv check --staged', 'Scan only git-staged files')
    .example('acv check --fix --write', 'Auto-fix issues in place')
    .example('acv watch src/', 'Watch src/ and re-scan on changes')
    .example('acv ci --fail-on high', 'CI scan, fail on high+ severity')
    .example('acv rules list --category security', 'List security rules')
    .example('acv explain hallucinated-import', 'Show rule documentation')
    .wrap(Math.min(120, process.stdout.columns || 80))
    .epilogue('Documentation: https://github.com/ai-code-verifier/acv')
    .parse();
}

main().catch((error: unknown) => {
  process.stderr.write(`Fatal error: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = EXIT_CODES.RUNTIME_ERROR;
});
