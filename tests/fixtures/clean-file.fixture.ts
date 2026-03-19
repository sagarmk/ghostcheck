/**
 * Test fixture: Clean File
 *
 * A perfectly clean file that should produce ZERO findings from any rule.
 * All imports are real packages (in the popular list or Node.js builtins),
 * all APIs used are real, and no security antipatterns are present.
 *
 * Expected: No findings from any rule.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { EventEmitter } from 'node:events';

/**
 * Read a configuration file safely.
 */
export async function readConfig(configPath: string): Promise<Record<string, unknown>> {
  const absolutePath = path.resolve(configPath);
  const content = await fs.promises.readFile(absolutePath, 'utf-8');
  return JSON.parse(content) as Record<string, unknown>;
}

/**
 * Hash a string using SHA-256.
 */
export function hashString(input: string): string {
  return crypto.createHash('sha256').update(input).digest('hex');
}

/**
 * Generate a random token.
 */
export function generateToken(): string {
  return crypto.randomUUID();
}

/**
 * Get the file extension.
 */
export function getExtension(filePath: string): string {
  return path.extname(filePath);
}

/**
 * Join paths safely.
 */
export function joinPaths(...segments: string[]): string {
  return path.join(...segments);
}

/**
 * Check if a file exists.
 */
export function fileExists(filePath: string): boolean {
  return fs.existsSync(filePath);
}

/**
 * A simple event bus.
 */
export class AppEventBus extends EventEmitter {
  emitReady(): void {
    this.emit('ready');
  }
}

/**
 * Safe string utility — no hallucinated methods.
 */
export function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Clamp a number to a range — done correctly, the standard way.
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Safe JSON parse with try/catch — the proper way to handle parse errors.
 */
export function safeJsonParse(input: string): unknown {
  try {
    return JSON.parse(input);
  } catch {
    return null;
  }
}

/**
 * A simple delay using standard APIs — the correct approach.
 */
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
