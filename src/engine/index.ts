/**
 * Engine module — the main scan orchestrator.
 *
 * Public API:
 *   import { scan } from './engine/index.js';
 *   const result = await scan('./src', { config });
 */

export { scan } from './scanner.js';
export type { ScannerOptions } from './scanner.js';
