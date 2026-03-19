/**
 * Output engine — routes scan results to the appropriate formatter.
 */

import type { ScanResult, OutputFormat } from '../core/types.js';
import { PrettyFormatter } from './pretty.js';
import { JsonFormatter } from './json.js';
import { SarifFormatter } from './sarif.js';

/**
 * Formatter interface — all output formatters implement this.
 */
export interface Formatter {
  /** Format scan results to a string */
  format(result: ScanResult): string;
}

/**
 * Registry of built-in formatters.
 */
const FORMATTERS: Readonly<Record<string, () => Formatter>> = {
  pretty: () => new PrettyFormatter(),
  json: () => new JsonFormatter(),
  sarif: () => new SarifFormatter(),
  // junit and github formatters will be added later
};

/**
 * Output engine — selects and runs the appropriate formatter.
 */
export class OutputEngine {
  private readonly _customFormatters = new Map<string, Formatter>();

  /**
   * Register a custom formatter (from plugins).
   */
  registerFormatter(name: string, formatter: Formatter): void {
    this._customFormatters.set(name, formatter);
  }

  /**
   * Format scan results using the specified format.
   */
  format(result: ScanResult, format: OutputFormat): string {
    // Check custom formatters first
    const custom = this._customFormatters.get(format);
    if (custom) return custom.format(result);

    // Fall back to built-in formatters
    const factory = FORMATTERS[format];
    if (!factory) {
      throw new Error(
        `Unknown output format: "${format}". Available: ${Object.keys(FORMATTERS).join(', ')}`,
      );
    }

    return factory().format(result);
  }

  /**
   * Auto-detect the best format for the current environment.
   * Uses JSON when piped, pretty when interactive.
   */
  autoDetectFormat(): OutputFormat {
    if (!process.stdout.isTTY) return 'json';

    // Check for CI environments
    if (process.env['CI'] || process.env['GITHUB_ACTIONS']) return 'json';

    return 'pretty';
  }
}
