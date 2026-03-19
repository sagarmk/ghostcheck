/**
 * npm registry verifier — checks if bare import specifiers exist on npm.
 *
 * For each package name extracted from source code, performs a HEAD request
 * to https://registry.npmjs.org/<package-name> to verify existence.
 *
 * Features:
 *   1. In-memory LRU cache (max 1000 entries) — avoids re-checking known packages
 *   2. Batch checking with concurrency limit (max 10 parallel requests)
 *   3. 5s timeout per request
 *   4. Graceful offline handling — skips verification with warning if registry unreachable
 *   5. Distinguishes 404 (hallucinated) vs 200 (exists)
 *   6. Cross-checks against package.json dependencies if available
 *
 * Uses native fetch() (Node 18+).
 */

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

// =============================================================================
// Types
// =============================================================================

/**
 * Result of checking a single package against the npm registry.
 */
export interface NpmRegistryResult {
  /** Whether the package exists on npm */
  readonly exists: boolean;
  /** Timestamp of when the check was performed */
  readonly checkedAt: Date;
  /** HTTP status code (200, 404, or -1 for network error) */
  readonly statusCode?: number;
  /** Whether the result came from cache */
  readonly cached?: boolean;
  /** Whether the package is listed in package.json dependencies */
  readonly inPackageJson?: boolean;
}

/**
 * Options for the npm registry verifier.
 */
export interface NpmRegistryOptions {
  /** Maximum LRU cache entries (default: 1000) */
  readonly maxCacheSize?: number;
  /** Maximum concurrent requests (default: 10) */
  readonly concurrency?: number;
  /** Per-request timeout in milliseconds (default: 5000) */
  readonly timeout?: number;
  /** npm registry base URL (default: https://registry.npmjs.org) */
  readonly registryUrl?: string;
  /** Path to project root for package.json lookup (default: cwd) */
  readonly projectRoot?: string;
  /** Callback for warnings (e.g., offline mode) */
  readonly onWarning?: (message: string) => void;
}

/**
 * Parsed package.json dependencies (all dependency types merged).
 */
interface PackageJsonDeps {
  readonly deps: ReadonlySet<string>;
}

// =============================================================================
// LRU Cache
// =============================================================================

/**
 * Simple LRU cache backed by a Map.
 * Map preserves insertion order; on access, we delete and re-insert
 * to move the entry to the end (most recently used position).
 * Eviction removes from the front (least recently used).
 */
class LRUCache<K, V> {
  private readonly _map = new Map<K, V>();
  private readonly _maxSize: number;

  constructor(maxSize: number) {
    this._maxSize = maxSize;
  }

  get(key: K): V | undefined {
    const value = this._map.get(key);
    if (value === undefined) return undefined;

    // Move to end (most recently used)
    this._map.delete(key);
    this._map.set(key, value);
    return value;
  }

  set(key: K, value: V): void {
    // If key exists, delete first so it moves to end
    if (this._map.has(key)) {
      this._map.delete(key);
    }

    this._map.set(key, value);

    // Evict oldest if over capacity
    if (this._map.size > this._maxSize) {
      const oldest = this._map.keys().next().value;
      if (oldest !== undefined) {
        this._map.delete(oldest);
      }
    }
  }

  has(key: K): boolean {
    return this._map.has(key);
  }

  get size(): number {
    return this._map.size;
  }

  clear(): void {
    this._map.clear();
  }
}

// =============================================================================
// Concurrency limiter
// =============================================================================

/**
 * Simple semaphore-based concurrency limiter.
 * Ensures no more than `limit` async tasks run simultaneously.
 */
class ConcurrencyLimiter {
  private _running = 0;
  private readonly _limit: number;
  private readonly _queue: Array<() => void> = [];

  constructor(limit: number) {
    this._limit = limit;
  }

  async run<T>(fn: () => Promise<T>): Promise<T> {
    await this._acquire();
    try {
      return await fn();
    } finally {
      this._release();
    }
  }

  private _acquire(): Promise<void> {
    if (this._running < this._limit) {
      this._running++;
      return Promise.resolve();
    }

    return new Promise<void>((resolve) => {
      this._queue.push(resolve);
    });
  }

  private _release(): void {
    this._running--;
    const next = this._queue.shift();
    if (next) {
      this._running++;
      next();
    }
  }
}

// =============================================================================
// NpmRegistryVerifier
// =============================================================================

/**
 * Node.js built-in modules — these should never be checked against npm.
 */
const NODE_BUILTINS = new Set([
  'assert', 'assert/strict', 'async_hooks', 'buffer', 'child_process',
  'cluster', 'console', 'constants', 'crypto', 'dgram', 'diagnostics_channel',
  'dns', 'dns/promises', 'domain', 'events', 'fs', 'fs/promises',
  'http', 'http2', 'https', 'inspector', 'inspector/promises', 'module',
  'net', 'os', 'path', 'path/posix', 'path/win32', 'perf_hooks',
  'process', 'punycode', 'querystring', 'readline', 'readline/promises',
  'repl', 'stream', 'stream/consumers', 'stream/promises', 'stream/web',
  'string_decoder', 'sys', 'test', 'timers', 'timers/promises',
  'tls', 'trace_events', 'tty', 'url', 'util', 'util/types',
  'v8', 'vm', 'wasi', 'worker_threads', 'zlib',
]);

/**
 * Check if a module specifier is a Node.js built-in.
 */
function isNodeBuiltin(specifier: string): boolean {
  if (specifier.startsWith('node:')) return true;
  return NODE_BUILTINS.has(specifier);
}

const DEFAULT_REGISTRY_URL = 'https://registry.npmjs.org';
const DEFAULT_MAX_CACHE_SIZE = 1000;
const DEFAULT_CONCURRENCY = 10;
const DEFAULT_TIMEOUT = 5000;

/**
 * npm registry verifier.
 *
 * Checks whether bare import specifiers (npm package names) exist
 * on the npm registry. Uses HEAD requests for minimal bandwidth.
 *
 * Usage:
 * ```typescript
 * const verifier = new NpmRegistryVerifier({ projectRoot: '/path/to/project' });
 * const results = await verifier.checkPackages(['lodash', 'express', 'fake-pkg-xyz']);
 * for (const [pkg, result] of results) {
 *   if (!result.exists) console.log(`Hallucinated: ${pkg}`);
 * }
 * ```
 */
export class NpmRegistryVerifier {
  private readonly _cache: LRUCache<string, NpmRegistryResult>;
  private readonly _limiter: ConcurrencyLimiter;
  private readonly _timeout: number;
  private readonly _registryUrl: string;
  private readonly _projectRoot: string;
  private readonly _onWarning: (message: string) => void;
  private _offline = false;
  private _packageJsonDeps: PackageJsonDeps | null = null;
  private _packageJsonLoaded = false;

  constructor(options: NpmRegistryOptions = {}) {
    this._cache = new LRUCache(options.maxCacheSize ?? DEFAULT_MAX_CACHE_SIZE);
    this._limiter = new ConcurrencyLimiter(options.concurrency ?? DEFAULT_CONCURRENCY);
    this._timeout = options.timeout ?? DEFAULT_TIMEOUT;
    this._registryUrl = (options.registryUrl ?? DEFAULT_REGISTRY_URL).replace(/\/+$/, '');
    this._projectRoot = options.projectRoot ?? process.cwd();
    this._onWarning = options.onWarning ?? ((): void => { /* noop */ });
  }

  /**
   * Check multiple packages against the npm registry.
   *
   * Returns a Map of package names to verification results.
   * Packages are deduplicated, cached results are returned immediately,
   * and uncached packages are checked in parallel with concurrency limiting.
   */
  async checkPackages(
    packageNames: readonly string[],
  ): Promise<Map<string, NpmRegistryResult>> {
    const results = new Map<string, NpmRegistryResult>();

    // Deduplicate and filter
    const unique = [...new Set(packageNames)];

    // Load package.json deps on first call
    if (!this._packageJsonLoaded) {
      await this._loadPackageJson();
    }

    // Separate cached from uncached
    const uncached: string[] = [];
    for (const name of unique) {
      // Skip Node.js builtins — they always "exist"
      if (isNodeBuiltin(name)) {
        results.set(name, {
          exists: true,
          checkedAt: new Date(),
          cached: true,
          inPackageJson: false,
        });
        continue;
      }

      const cached = this._cache.get(name);
      if (cached) {
        results.set(name, { ...cached, cached: true });
      } else {
        uncached.push(name);
      }
    }

    // If offline, skip registry checks
    if (this._offline) {
      for (const name of uncached) {
        const inPkg = this._isInPackageJson(name);
        results.set(name, {
          exists: inPkg, // assume exists if in package.json
          checkedAt: new Date(),
          statusCode: -1,
          cached: false,
          inPackageJson: inPkg,
        });
      }
      return results;
    }

    // Check uncached packages in parallel with concurrency limit
    const checkPromises = uncached.map((name) =>
      this._limiter.run(async () => {
        const result = await this._checkSingle(name);
        this._cache.set(name, result);
        results.set(name, result);
      }),
    );

    await Promise.all(checkPromises);
    return results;
  }

  /**
   * Check a single package against the npm registry.
   *
   * Performs a HEAD request to https://registry.npmjs.org/<package-name>.
   * Falls back to package.json cross-check if registry is unreachable.
   */
  private async _checkSingle(packageName: string): Promise<NpmRegistryResult> {
    const inPkg = this._isInPackageJson(packageName);

    try {
      const url = `${this._registryUrl}/${encodePackageName(packageName)}`;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this._timeout);

      try {
        const response = await fetch(url, {
          method: 'HEAD',
          signal: controller.signal,
          headers: {
            // Identify ourselves; npm registry best practice
            'Accept': 'application/json',
          },
        });

        clearTimeout(timeoutId);

        const exists = response.status === 200;
        return {
          exists,
          checkedAt: new Date(),
          statusCode: response.status,
          cached: false,
          inPackageJson: inPkg,
        };
      } catch (error: unknown) {
        clearTimeout(timeoutId);
        throw error;
      }
    } catch (error: unknown) {
      // Network error or timeout — check if registry is completely down
      const isAbort =
        error instanceof Error && error.name === 'AbortError';
      const isNetwork =
        error instanceof TypeError ||
        (error instanceof Error && 'code' in error);

      if (isAbort || isNetwork) {
        // Try a connectivity check before going fully offline
        if (!this._offline) {
          const reachable = await this._checkConnectivity();
          if (!reachable) {
            this._offline = true;
            this._onWarning(
              `npm registry unreachable — skipping online verification. ` +
              `Using package.json cross-check only.`,
            );
          }
        }
      }

      // Fallback: trust package.json if available
      return {
        exists: inPkg,
        checkedAt: new Date(),
        statusCode: -1,
        cached: false,
        inPackageJson: inPkg,
      };
    }
  }

  /**
   * Check if the npm registry is reachable.
   */
  private async _checkConnectivity(): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000);

      try {
        const response = await fetch(this._registryUrl, {
          method: 'HEAD',
          signal: controller.signal,
        });
        clearTimeout(timeoutId);
        return response.ok;
      } catch {
        clearTimeout(timeoutId);
        return false;
      }
    } catch {
      return false;
    }
  }

  /**
   * Load and parse package.json dependencies from the project root.
   */
  private async _loadPackageJson(): Promise<void> {
    this._packageJsonLoaded = true;

    try {
      const pkgPath = join(this._projectRoot, 'package.json');
      const raw = await readFile(pkgPath, 'utf-8');
      const pkg = JSON.parse(raw) as Record<string, unknown>;

      const deps = new Set<string>();

      // Merge all dependency types
      const depSections = [
        'dependencies',
        'devDependencies',
        'peerDependencies',
        'optionalDependencies',
      ] as const;

      for (const section of depSections) {
        const sectionDeps = pkg[section];
        if (sectionDeps && typeof sectionDeps === 'object') {
          for (const name of Object.keys(sectionDeps as Record<string, unknown>)) {
            deps.add(name);
          }
        }
      }

      this._packageJsonDeps = { deps };
    } catch {
      // No package.json or read error — not an error condition
      this._packageJsonDeps = null;
    }
  }

  /**
   * Check if a package name is listed in the project's package.json.
   */
  private _isInPackageJson(packageName: string): boolean {
    if (!this._packageJsonDeps) return false;
    return this._packageJsonDeps.deps.has(packageName);
  }

  /**
   * Get current cache size.
   */
  get cacheSize(): number {
    return this._cache.size;
  }

  /**
   * Whether the verifier has detected offline mode.
   */
  get isOffline(): boolean {
    return this._offline;
  }

  /**
   * Clear the cache and reset offline state.
   */
  reset(): void {
    this._cache.clear();
    this._offline = false;
    this._packageJsonLoaded = false;
    this._packageJsonDeps = null;
  }
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Encode a package name for use in a URL.
 * Scoped packages need the '@' and '/' encoded properly.
 * npm registry expects: /@scope%2Fpkg for scoped packages.
 */
function encodePackageName(name: string): string {
  if (name.startsWith('@')) {
    // Scoped package: @scope/pkg → @scope%2Fpkg
    return `@${encodeURIComponent(name.slice(1))}`;
  }
  return encodeURIComponent(name);
}
