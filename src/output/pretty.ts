/**
 * Pretty formatter — rich ANSI terminal output.
 *
 * Formats findings with colors, code snippets, and context
 * for human-readable terminal display.
 */

import chalk from 'chalk';
import type { ScanResult, Finding, ActiveSeverity } from '../core/types.js';
import type { Formatter } from './engine.js';

/**
 * Severity to colored label mapping.
 */
function severityLabel(severity: ActiveSeverity): string {
  switch (severity) {
    case 'error':
      return chalk.red.bold('ERROR');
    case 'warn':
      return chalk.yellow.bold('WARN');
    case 'info':
      return chalk.blue('INFO');
  }
}

/**
 * Format a single finding for terminal display.
 */
function formatFinding(finding: Finding, index: number): string {
  const lines: string[] = [];

  // Header: severity + rule ID + message
  lines.push(
    `  ${chalk.dim(`${index + 1}.`)} ${severityLabel(finding.severity)} ${chalk.dim(`[${finding.ruleId}]`)} ${finding.message}`,
  );

  // Location
  lines.push(`     ${chalk.cyan(`${finding.filePath}:${finding.line}:${finding.column}`)}`);

  // Source snippet
  if (finding.codeSnippet) {
    lines.push(`     ${chalk.dim('│')} ${chalk.gray(finding.codeSnippet.trim())}`);
  }

  // Fix suggestion
  if (finding.fix) {
    lines.push(
      `     ${chalk.green('fix:')} Replace ${chalk.red(finding.fix.from)} → ${chalk.green(finding.fix.to)}`,
    );
  } else if (finding.suggestion) {
    lines.push(`     ${chalk.green('suggestion:')} ${finding.suggestion}`);
  }

  // Confidence
  if (finding.confidence < 1.0) {
    const pct = Math.round(finding.confidence * 100);
    lines.push(`     ${chalk.dim(`confidence: ${pct}%`)}`);
  }

  return lines.join('\n');
}

/**
 * Pretty terminal formatter.
 */
export class PrettyFormatter implements Formatter {
  format(result: ScanResult): string {
    const lines: string[] = [];

    // Header
    lines.push('');
    lines.push(chalk.bold('AI Code Verifier') + chalk.dim(` v${result.version}`));
    lines.push(chalk.dim('─'.repeat(60)));

    // Scan metrics
    lines.push(
      chalk.dim(
        `Scanned ${result.scan.files} files in ${result.scan.durationMs}ms` +
          (result.scan.cached > 0 ? ` (${result.scan.cached} cached)` : ''),
      ),
    );
    lines.push('');

    // Findings
    if (result.findings.length === 0) {
      lines.push(chalk.green.bold('  ✓ No issues found'));
    } else {
      // Group by severity
      const errors = result.findings.filter((f) => f.severity === 'error');
      const warnings = result.findings.filter((f) => f.severity === 'warn');
      const infos = result.findings.filter((f) => f.severity === 'info');

      let index = 0;

      if (errors.length > 0) {
        lines.push(chalk.red.bold(`  Errors (${errors.length}):`));
        for (const finding of errors) {
          lines.push(formatFinding(finding, index++));
        }
        lines.push('');
      }

      if (warnings.length > 0) {
        lines.push(chalk.yellow.bold(`  Warnings (${warnings.length}):`));
        for (const finding of warnings) {
          lines.push(formatFinding(finding, index++));
        }
        lines.push('');
      }

      if (infos.length > 0) {
        lines.push(chalk.blue.bold(`  Info (${infos.length}):`));
        for (const finding of infos) {
          lines.push(formatFinding(finding, index++));
        }
        lines.push('');
      }
    }

    // Summary
    lines.push(chalk.dim('─'.repeat(60)));
    const { summary } = result;
    const parts: string[] = [];
    if (summary.errors > 0) parts.push(chalk.red(`${summary.errors} errors`));
    if (summary.warnings > 0) parts.push(chalk.yellow(`${summary.warnings} warnings`));
    if (summary.info > 0) parts.push(chalk.blue(`${summary.info} info`));
    if (summary.fixable > 0) parts.push(chalk.green(`${summary.fixable} fixable`));

    if (parts.length === 0) {
      lines.push(chalk.green.bold('  ✓ All clear'));
    } else {
      lines.push(`  ${parts.join(chalk.dim(' │ '))}`);
    }
    lines.push('');

    return lines.join('\n');
  }
}
