/**
 * Content-hash caching using SQLite.
 *
 * Caches analysis results keyed by file content hash (SHA-256).
 * Unchanged files return cached findings instantly, enabling
 * sub-200ms incremental re-checks.
 */

import { createHash } from 'node:crypto';
import type { Finding } from './types.js';

/**
 * Cache entry stored in SQLite.
 */
export interface CacheEntry {
  readonly contentHash: string;
  readonly findings: readonly Finding[];
  readonly analyzedAt: string;
  readonly ruleVersionHash: string;
}

/**
 * Compute SHA-256 content hash of file content.
 */
export function computeContentHash(content: string): string {
  return createHash('sha256').update(content, 'utf-8').digest('hex');
}

/**
 * Analysis cache backed by better-sqlite3.
 *
 * Schema:
 *   CREATE TABLE cache (
 *     file_path TEXT PRIMARY KEY,
 *     content_hash TEXT NOT NULL,
 *     rule_version_hash TEXT NOT NULL,
 *     findings_json TEXT NOT NULL,
 *     analyzed_at TEXT NOT NULL
 *   );
 */
export class AnalysisCache {
  private _enabled: boolean;

  constructor(enabled: boolean) {
    this._enabled = enabled;
    // TODO: Initialize better-sqlite3 database at .acv-cache/cache.db
  }

  get enabled(): boolean {
    return this._enabled;
  }

  /**
   * Look up cached findings for a file.
   * Returns null if not cached or if content/rules have changed.
   */
  lookup(filePath: string, contentHash: string, _ruleVersionHash: string): CacheEntry | null {
    if (!this._enabled) return null;
    // TODO: SQLite lookup
    void filePath;
    void contentHash;
    return null;
  }

  /**
   * Store analysis results in the cache.
   */
  store(
    filePath: string,
    contentHash: string,
    ruleVersionHash: string,
    findings: readonly Finding[],
  ): void {
    if (!this._enabled) return;
    // TODO: SQLite upsert
    void filePath;
    void contentHash;
    void ruleVersionHash;
    void findings;
  }

  /**
   * Clear all cached results.
   */
  clear(): void {
    // TODO: DELETE FROM cache
  }

  /**
   * Get cache statistics.
   */
  stats(): { entries: number; sizeBytes: number } {
    // TODO: Query cache size
    return { entries: 0, sizeBytes: 0 };
  }

  /**
   * Close the database connection.
   */
  close(): void {
    // TODO: Close better-sqlite3 connection
  }
}
