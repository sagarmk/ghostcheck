/**
 * Output formatter — two output modes for scan results.
 *
 * 1. Text mode (default):
 *    - Findings grouped by file
 *    - Colored severity labels (red=error, yellow=warning, blue=info)
 *    - File path with line:column
 *    - Rule ID in dim text
 *    - Code snippet with arrow pointing to the issue
 *    - Suggested fix in green
 *    - Summary footer with counts and timing
 *
 * 2. JSON mode:
 *    - Complete ScanResult as formatted JSON
 *    - Suitable for CI/CD pipelines and programmatic consumption
 *
 * Supports --no-color via chalk.level = 0.
 */

import chalk from 'chalk';
import type { ScanResult, Finding, ActiveSeverity } from '../core/types.js';
import type { Formatter } from './engine.js';

// =============================================================================
// Text Formatter
// =============================================================================

/**
 * Get the severity icon and colored label.
 */
function severityIcon(severity: ActiveSeverity): string {
  switch (severity) {
    case 'error':
      return chalk.red('\u2716'); // ✖
    case 'warn':
      return chalk.yellow('\u26A0'); // ⚠
    case 'info':
      return chalk.blue('\u2139'); // ℹ
  }
}

/**
 * Get the colored severity label.
 */
function coloredSeverity(severity: ActiveSeverity): string {
  switch (severity) {
    case 'error':
      return chalk.red.bold('error');
    case 'warn':
      return chalk.yellow.bold('warning');
    case 'info':
      return chalk.blue('info');
  }
}

/**
 * Format a single finding for text output.
 * Shows: line:col  severity  message  rule-id
 *        code snippet with arrow
 *        suggested fix
 */
function formatFindingText(finding: Finding): string[] {
  const lines: string[] = [];

  // Line:column  severity  message  rule-id
  const location = chalk.dim(
    `${String(finding.line)}:${String(finding.column)}`,
  );
  const sev = coloredSeverity(finding.severity);
  const ruleId = chalk.dim(`(${finding.ruleId})`);

  lines.push(
    `  ${location}  ${severityIcon(finding.severity)} ${sev}  ${finding.message}  ${ruleId}`,
  );

  // Code snippet with arrow pointing to issue
  if (finding.codeSnippet) {
    const snippet = finding.codeSnippet;
    lines.push(`  ${chalk.dim('>')} ${chalk.gray(snippet)}`);

    // Arrow underline pointing to the column
    if (finding.column > 0) {
      // Calculate where to place the arrow relative to the trimmed snippet
      // The column is 1-based relative to the original line
      const originalLine = finding.codeSnippet;
      const leadingSpaces = originalLine.length - originalLine.trimStart().length;
      const arrowStart = Math.max(0, finding.column - 1 - leadingSpaces);
      const arrowLen = Math.max(
        1,
        (finding.endColumn ?? finding.column) - finding.column,
      );

      const padding = ' '.repeat(arrowStart + 4); // +4 for "  > " prefix
      const arrow = chalk.red('^'.repeat(Math.min(arrowLen, 60)));
      lines.push(`${padding}${arrow}`);
    }
  }

  // Suggested fix
  const fixText = finding.suggestedFix ?? finding.suggestion;
  if (fixText) {
    lines.push(`  ${chalk.green('\u2192')} ${chalk.green(fixText)}`);
  } else if (finding.fix) {
    lines.push(
      `  ${chalk.green('\u2192')} Replace ${chalk.red(finding.fix.from)} \u2192 ${chalk.green(finding.fix.to)}`,
    );
  }

  return lines;
}

/**
 * Format the summary footer with counts and timing.
 */
function formatSummaryFooter(result: ScanResult): string[] {
  const lines: string[] = [];
  const { summary, scan } = result;

  lines.push('');
  lines.push(chalk.dim('\u2500'.repeat(60)));

  // Counts
  const parts: string[] = [];

  if (summary.errors > 0) {
    parts.push(chalk.red.bold(`\u2716 ${String(summary.errors)} error${summary.errors !== 1 ? 's' : ''}`));
  }
  if (summary.warnings > 0) {
    parts.push(chalk.yellow.bold(`\u26A0 ${String(summary.warnings)} warning${summary.warnings !== 1 ? 's' : ''}`));
  }
  if (summary.info > 0) {
    parts.push(chalk.blue(`\u2139 ${String(summary.info)} info`));
  }

  if (parts.length > 0) {
    lines.push(`  ${parts.join('  ')}`);
  }

  // Timing and file count
  const timing = scan.durationMs < 1000
    ? `${String(scan.durationMs)}ms`
    : `${(scan.durationMs / 1000).toFixed(1)}s`;

  lines.push(
    chalk.dim(
      `  ${String(scan.parsed)} file${scan.parsed !== 1 ? 's' : ''} scanned in ${timing}` +
      (scan.cached > 0 ? ` (${String(scan.cached)} cached)` : '') +
      (scan.skipped > 0 ? `, ${String(scan.skipped)} skipped` : ''),
    ),
  );
  lines.push('');

  return lines;
}

/**
 * Text output formatter — grouped by file with colors, arrows, and fixes.
 *
 * Output format:
 * ```
 * /path/to/file.ts
 *   3:10  ✖ error  Package "X" not found  (acv/hallucinated-package)
 *   > import X from 'some-fake-pkg';
 *             ^^^^^^^^^^^^^^^^^^^^^^
 *   → Did you mean "some-real-pkg"?
 *
 * ────────────────────────────────────────────────────────────
 *   ✖ 2 errors  ⚠ 3 warnings  ℹ 1 info
 *   5 files scanned in 1.2s
 * ```
 */
export class TextFormatter implements Formatter {
  /**
   * Disable colors for CI/piped output.
   * Call with `true` to force --no-color behavior.
   */
  static setNoColor(noColor: boolean): void {
    if (noColor) {
      chalk.level = 0;
    }
  }

  format(result: ScanResult): string {
    const outputLines: string[] = [];

    // Handle zero findings
    if (result.findings.length === 0) {
      outputLines.push('');
      outputLines.push(chalk.green.bold('\u2714 No issues found!'));
      outputLines.push(
        chalk.dim(
          `  Scanned ${String(result.scan.parsed)} file${result.scan.parsed !== 1 ? 's' : ''} — all clear.`,
        ),
      );
      outputLines.push('');
      return outputLines.join('\n');
    }

    outputLines.push('');

    // Group findings by file
    const fileGroups = new Map<string, Finding[]>();
    for (const finding of result.findings) {
      const existing = fileGroups.get(finding.filePath);
      if (existing) {
        existing.push(finding);
      } else {
        fileGroups.set(finding.filePath, [finding]);
      }
    }

    // Output each file group
    for (const [filePath, findings] of fileGroups) {
      // Sort findings by line within file
      const sorted = [...findings].sort((a, b) => {
        if (a.line !== b.line) return a.line - b.line;
        return a.column - b.column;
      });

      // File header
      outputLines.push(chalk.underline(filePath));

      // Each finding
      for (const finding of sorted) {
        const findingLines = formatFindingText(finding);
        outputLines.push(...findingLines);
      }

      outputLines.push(''); // Blank line between files
    }

    // Summary footer
    outputLines.push(...formatSummaryFooter(result));

    return outputLines.join('\n');
  }
}

// =============================================================================
// JSON Formatter
// =============================================================================

/**
 * JSON output formatter for CI/CD consumption.
 *
 * Outputs the complete ScanResult as formatted JSON to stdout.
 * Use --no-color to ensure clean output (no ANSI codes).
 */
export class JsonOutputFormatter implements Formatter {
  format(result: ScanResult): string {
    return JSON.stringify(result, null, 2);
  }
}

// =============================================================================
// Convenience function
// =============================================================================

/**
 * Output format mode.
 */
export type OutputMode = 'text' | 'json';

/**
 * Format scan results using the specified mode.
 *
 * @param result — The scan result to format
 * @param mode — 'text' for terminal output, 'json' for CI consumption
 * @param noColor — If true, disables chalk colors (for piped output or --no-color flag)
 * @returns Formatted string ready for stdout
 */
export function formatOutput(
  result: ScanResult,
  mode: OutputMode = 'text',
  noColor = false,
): string {
  if (noColor) {
    TextFormatter.setNoColor(true);
  }

  if (mode === 'json') {
    return new JsonOutputFormatter().format(result);
  }

  return new TextFormatter().format(result);
}
