/**
 * JSON formatter — structured output for programmatic consumption.
 */

import type { ScanResult } from '../core/types.js';
import type { Formatter } from './engine.js';

/**
 * JSON output formatter.
 * Produces a clean JSON representation of the scan result.
 */
export class JsonFormatter implements Formatter {
  format(result: ScanResult): string {
    return JSON.stringify(result, null, 2);
  }
}
