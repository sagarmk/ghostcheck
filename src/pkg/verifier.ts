/**
 * Package existence verification.
 *
 * Uses an offline SQLite database of known packages to verify
 * that imported packages actually exist. This is the core of
 * hallucinated-import detection.
 *
 * Verification pipeline (8 stages):
 *   1. Bloom filter (fast negative, 1% FP rate)
 *   2. Exact match (SQLite lookup)
 *   3. Scope/org check (e.g., @types/foo)
 *   4. Built-in module check (node:fs, etc.)
 *   5. Relative path check (./foo, ../bar)
 *   6. Alias check (tsconfig paths, webpack aliases)
 *   7. Typosquat detection (Levenshtein)
 *   8. Confidence scoring
 */

/**
 * Package registry type.
 */
export type Registry = 'npm' | 'pypi' | 'cargo' | 'go';

/**
 * Result of a package verification check.
 */
export interface VerificationResult {
  /** The package name that was checked */
  readonly packageName: string;
  /** Whether the package exists in the registry */
  readonly exists: boolean;
  /** Which registry was checked */
  readonly registry: Registry;
  /** Confidence score (0.0–1.0) */
  readonly confidence: number;
  /** Closest known package (for typosquat detection) */
  readonly closestMatch?: string;
  /** Levenshtein distance to closest match */
  readonly levenshteinDistance?: number;
  /** Whether this is a built-in module */
  readonly isBuiltin: boolean;
  /** Whether this is a relative import */
  readonly isRelative: boolean;
}

/**
 * Node.js built-in modules (no external package needed).
 */
const NODE_BUILTINS = new Set([
  'assert',
  'buffer',
  'child_process',
  'cluster',
  'console',
  'constants',
  'crypto',
  'dgram',
  'dns',
  'domain',
  'events',
  'fs',
  'http',
  'http2',
  'https',
  'inspector',
  'module',
  'net',
  'os',
  'path',
  'perf_hooks',
  'process',
  'punycode',
  'querystring',
  'readline',
  'repl',
  'stream',
  'string_decoder',
  'sys',
  'timers',
  'tls',
  'trace_events',
  'tty',
  'url',
  'util',
  'v8',
  'vm',
  'wasi',
  'worker_threads',
  'zlib',
  'node:assert',
  'node:buffer',
  'node:child_process',
  'node:cluster',
  'node:console',
  'node:constants',
  'node:crypto',
  'node:dgram',
  'node:dns',
  'node:events',
  'node:fs',
  'node:http',
  'node:http2',
  'node:https',
  'node:inspector',
  'node:module',
  'node:net',
  'node:os',
  'node:path',
  'node:perf_hooks',
  'node:process',
  'node:querystring',
  'node:readline',
  'node:repl',
  'node:stream',
  'node:string_decoder',
  'node:test',
  'node:timers',
  'node:tls',
  'node:trace_events',
  'node:tty',
  'node:url',
  'node:util',
  'node:v8',
  'node:vm',
  'node:wasi',
  'node:worker_threads',
  'node:zlib',
]);

/**
 * Package existence verifier.
 */
export class PackageVerifier {
  /**
   * Verify whether a package exists.
   */
  verify(packageName: string, registry: Registry = 'npm'): VerificationResult {
    // Check relative imports
    if (packageName.startsWith('.') || packageName.startsWith('/')) {
      return {
        packageName,
        exists: true,
        registry,
        confidence: 1.0,
        isBuiltin: false,
        isRelative: true,
      };
    }

    // Check built-in modules
    if (NODE_BUILTINS.has(packageName)) {
      return {
        packageName,
        exists: true,
        registry,
        confidence: 1.0,
        isBuiltin: true,
        isRelative: false,
      };
    }

    // TODO: Bloom filter → exact SQLite lookup → typosquat detection
    return {
      packageName,
      exists: false,
      registry,
      confidence: 0.0,
      isBuiltin: false,
      isRelative: false,
    };
  }
}
