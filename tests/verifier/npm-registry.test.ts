/**
 * Unit tests for src/verifier/npm-registry.ts
 *
 * Comprehensive test suite covering all NpmRegistryVerifier scenarios:
 *   1.  Package exists (200 response) -> exists: true
 *   2.  Package missing (404 response) -> exists: false
 *   3.  Network error -> graceful degradation (offline mode, package.json fallback)
 *   4.  Cache hit — second call for same package doesn't trigger fetch
 *   5.  Concurrent batch limits (concurrency semaphore enforcement)
 *   6.  Timeout handling (AbortController timeout)
 *   7.  Scoped packages URL encoding (@scope/pkg -> @scope%2Fpkg)
 *   8.  Built-in modules are skipped before fetch
 *
 * All tests mock global fetch() to avoid real network calls.
 * package.json reading is mocked via vi.mock('node:fs/promises').
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NpmRegistryVerifier } from '../../src/verifier/npm-registry.js';
import type { NpmRegistryOptions } from '../../src/verifier/npm-registry.js';

// =============================================================================
// Mock setup
// =============================================================================

// Mock node:fs/promises to control package.json loading
vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(),
}));

// Import the mocked readFile so we can control its behavior per-test
import { readFile } from 'node:fs/promises';
const mockReadFile = vi.mocked(readFile);

// Store original fetch and replace with mock
const originalFetch = globalThis.fetch;
let mockFetch: ReturnType<typeof vi.fn>;

beforeEach(() => {
  mockFetch = vi.fn();
  globalThis.fetch = mockFetch;

  // Default: package.json doesn't exist (no cross-check)
  mockReadFile.mockRejectedValue(new Error('ENOENT'));
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

// =============================================================================
// Helpers
// =============================================================================

/** Create a mock Response object */
function mockResponse(status: number, ok?: boolean): Response {
  return {
    status,
    ok: ok ?? (status >= 200 && status < 300),
    headers: new Headers(),
    redirected: false,
    statusText: status === 200 ? 'OK' : status === 404 ? 'Not Found' : 'Error',
    type: 'basic' as ResponseType,
    url: '',
    clone: () => mockResponse(status, ok),
    body: null,
    bodyUsed: false,
    arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
    blob: () => Promise.resolve(new Blob()),
    formData: () => Promise.resolve(new FormData()),
    json: () => Promise.resolve({}),
    text: () => Promise.resolve(''),
    bytes: () => Promise.resolve(new Uint8Array()),
  } as Response;
}

/** Create a verifier with default test options */
function createVerifier(overrides: NpmRegistryOptions = {}): NpmRegistryVerifier {
  return new NpmRegistryVerifier({
    registryUrl: 'https://registry.npmjs.org',
    projectRoot: '/fake/project',
    timeout: 5000,
    ...overrides,
  });
}

/** Set up mockReadFile to return a package.json with given deps */
function mockPackageJson(deps: Record<string, Record<string, string>>): void {
  const pkg: Record<string, unknown> = { name: 'test-project', version: '1.0.0', ...deps };
  mockReadFile.mockResolvedValue(JSON.stringify(pkg) as never);
}

// =============================================================================
// 1. Package exists (200 response) -> exists: true
// =============================================================================

describe('Package exists (200 response)', () => {
  it('returns exists: true for a 200 response', async () => {
    mockFetch.mockResolvedValue(mockResponse(200));
    const verifier = createVerifier();

    const results = await verifier.checkPackages(['lodash']);
    const result = results.get('lodash')!;

    expect(result).toBeDefined();
    expect(result.exists).toBe(true);
    expect(result.statusCode).toBe(200);
    expect(result.cached).toBe(false);
  });

  it('returns exists: true for multiple existing packages', async () => {
    mockFetch.mockResolvedValue(mockResponse(200));
    const verifier = createVerifier();

    const results = await verifier.checkPackages(['lodash', 'express', 'react']);

    expect(results.size).toBe(3);
    for (const [, result] of results) {
      expect(result.exists).toBe(true);
      expect(result.statusCode).toBe(200);
    }
  });

  it('includes checkedAt timestamp', async () => {
    mockFetch.mockResolvedValue(mockResponse(200));
    const verifier = createVerifier();
    const before = new Date();

    const results = await verifier.checkPackages(['lodash']);
    const result = results.get('lodash')!;

    const after = new Date();
    expect(result.checkedAt).toBeInstanceOf(Date);
    expect(result.checkedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(result.checkedAt.getTime()).toBeLessThanOrEqual(after.getTime());
  });

  it('uses HEAD method for requests', async () => {
    mockFetch.mockResolvedValue(mockResponse(200));
    const verifier = createVerifier();

    await verifier.checkPackages(['lodash']);

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('lodash'),
      expect.objectContaining({ method: 'HEAD' }),
    );
  });

  it('reports inPackageJson: true when package is in package.json', async () => {
    mockPackageJson({ dependencies: { lodash: '^4.17.21' } });
    mockFetch.mockResolvedValue(mockResponse(200));
    const verifier = createVerifier();

    const results = await verifier.checkPackages(['lodash']);
    const result = results.get('lodash')!;

    expect(result.exists).toBe(true);
    expect(result.inPackageJson).toBe(true);
  });

  it('reports inPackageJson: false when package is NOT in package.json', async () => {
    mockPackageJson({ dependencies: { express: '^4.0.0' } });
    mockFetch.mockResolvedValue(mockResponse(200));
    const verifier = createVerifier();

    const results = await verifier.checkPackages(['lodash']);
    const result = results.get('lodash')!;

    expect(result.exists).toBe(true);
    expect(result.inPackageJson).toBe(false);
  });
});

// =============================================================================
// 2. Package missing (404 response) -> exists: false
// =============================================================================

describe('Package missing (404 response)', () => {
  it('returns exists: false for a 404 response', async () => {
    mockFetch.mockResolvedValue(mockResponse(404));
    const verifier = createVerifier();

    const results = await verifier.checkPackages(['totally-fake-package-xyz']);
    const result = results.get('totally-fake-package-xyz')!;

    expect(result).toBeDefined();
    expect(result.exists).toBe(false);
    expect(result.statusCode).toBe(404);
    expect(result.cached).toBe(false);
  });

  it('returns exists: false for non-200/non-404 status codes', async () => {
    mockFetch.mockResolvedValue(mockResponse(500));
    const verifier = createVerifier();

    const results = await verifier.checkPackages(['some-package']);
    const result = results.get('some-package')!;

    expect(result.exists).toBe(false);
    expect(result.statusCode).toBe(500);
  });

  it('returns exists: false for 403 forbidden', async () => {
    mockFetch.mockResolvedValue(mockResponse(403));
    const verifier = createVerifier();

    const results = await verifier.checkPackages(['private-pkg']);
    const result = results.get('private-pkg')!;

    expect(result.exists).toBe(false);
    expect(result.statusCode).toBe(403);
  });

  it('handles mixed results (some exist, some do not)', async () => {
    mockFetch.mockImplementation((url: string | URL | Request) => {
      const urlStr = typeof url === 'string' ? url : url.toString();
      if (urlStr.includes('lodash')) return Promise.resolve(mockResponse(200));
      return Promise.resolve(mockResponse(404));
    });

    const verifier = createVerifier();
    const results = await verifier.checkPackages(['lodash', 'fake-package']);

    expect(results.get('lodash')!.exists).toBe(true);
    expect(results.get('fake-package')!.exists).toBe(false);
  });
});

// =============================================================================
// 3. Network error -> graceful degradation
// =============================================================================

describe('Network error -> graceful degradation', () => {
  it('falls back to package.json on network error (package in deps)', async () => {
    mockPackageJson({ dependencies: { lodash: '^4.17.21' } });
    // First fetch fails (package check), second fetch fails (connectivity check)
    mockFetch.mockRejectedValue(new TypeError('fetch failed'));
    const verifier = createVerifier();

    const results = await verifier.checkPackages(['lodash']);
    const result = results.get('lodash')!;

    expect(result.exists).toBe(true); // in package.json = assumed to exist
    expect(result.statusCode).toBe(-1);
    expect(result.inPackageJson).toBe(true);
  });

  it('falls back to exists: false on network error (package NOT in deps)', async () => {
    mockPackageJson({ dependencies: { express: '^4.0.0' } });
    mockFetch.mockRejectedValue(new TypeError('fetch failed'));
    const verifier = createVerifier();

    const results = await verifier.checkPackages(['fake-package-xyz']);
    const result = results.get('fake-package-xyz')!;

    expect(result.exists).toBe(false);
    expect(result.statusCode).toBe(-1);
    expect(result.inPackageJson).toBe(false);
  });

  it('switches to offline mode when registry is unreachable', async () => {
    mockFetch.mockRejectedValue(new TypeError('fetch failed'));
    const onWarning = vi.fn();
    const verifier = createVerifier({ onWarning });

    expect(verifier.isOffline).toBe(false);
    await verifier.checkPackages(['some-pkg']);
    expect(verifier.isOffline).toBe(true);
  });

  it('emits warning when going offline', async () => {
    mockFetch.mockRejectedValue(new TypeError('fetch failed'));
    const onWarning = vi.fn();
    const verifier = createVerifier({ onWarning });

    await verifier.checkPackages(['some-pkg']);

    expect(onWarning).toHaveBeenCalledTimes(1);
    expect(onWarning).toHaveBeenCalledWith(expect.stringContaining('unreachable'));
  });

  it('skips fetch entirely in offline mode (second batch)', async () => {
    mockFetch.mockRejectedValue(new TypeError('fetch failed'));
    const verifier = createVerifier();

    // First batch triggers offline detection
    await verifier.checkPackages(['pkg-a']);
    expect(verifier.isOffline).toBe(true);

    // Reset mock to track second batch
    mockFetch.mockClear();

    // Second batch should NOT call fetch at all
    await verifier.checkPackages(['pkg-b']);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('uses package.json cross-check in offline mode', async () => {
    mockPackageJson({
      dependencies: { 'real-dep': '^1.0.0' },
      devDependencies: { 'dev-dep': '^2.0.0' },
    });
    mockFetch.mockRejectedValue(new TypeError('fetch failed'));
    const verifier = createVerifier();

    // Force offline
    await verifier.checkPackages(['trigger-offline']);
    expect(verifier.isOffline).toBe(true);

    mockFetch.mockClear();
    const results = await verifier.checkPackages(['real-dep', 'dev-dep', 'unknown-dep']);

    expect(results.get('real-dep')!.exists).toBe(true);
    expect(results.get('real-dep')!.inPackageJson).toBe(true);
    expect(results.get('dev-dep')!.exists).toBe(true);
    expect(results.get('dev-dep')!.inPackageJson).toBe(true);
    expect(results.get('unknown-dep')!.exists).toBe(false);
    expect(results.get('unknown-dep')!.inPackageJson).toBe(false);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('handles no package.json gracefully (readFile error)', async () => {
    // mockReadFile already rejects by default (ENOENT)
    mockFetch.mockRejectedValue(new TypeError('fetch failed'));
    const verifier = createVerifier();

    const results = await verifier.checkPackages(['some-pkg']);
    const result = results.get('some-pkg')!;

    expect(result.exists).toBe(false);
    expect(result.statusCode).toBe(-1);
    expect(result.inPackageJson).toBe(false);
  });

  it('handles AbortError (timeout-like) and checks connectivity', async () => {
    const abortError = new Error('The operation was aborted');
    abortError.name = 'AbortError';
    mockFetch.mockRejectedValue(abortError);
    const onWarning = vi.fn();
    const verifier = createVerifier({ onWarning });

    await verifier.checkPackages(['some-pkg']);

    // Should detect offline since connectivity check also fails
    expect(verifier.isOffline).toBe(true);
    expect(onWarning).toHaveBeenCalledTimes(1);
  });

  it('does not go offline if connectivity check succeeds', async () => {
    let callCount = 0;
    mockFetch.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        // First call (package check) fails
        return Promise.reject(new TypeError('fetch failed'));
      }
      // Connectivity check succeeds
      return Promise.resolve(mockResponse(200));
    });

    const onWarning = vi.fn();
    const verifier = createVerifier({ onWarning });

    await verifier.checkPackages(['some-pkg']);

    // Registry is reachable, so shouldn't go offline
    expect(verifier.isOffline).toBe(false);
    expect(onWarning).not.toHaveBeenCalled();
  });

  it('reset() clears offline state', async () => {
    mockFetch.mockRejectedValue(new TypeError('fetch failed'));
    const verifier = createVerifier();

    await verifier.checkPackages(['some-pkg']);
    expect(verifier.isOffline).toBe(true);

    verifier.reset();
    expect(verifier.isOffline).toBe(false);
    expect(verifier.cacheSize).toBe(0);
  });
});

// =============================================================================
// 4. Cache hit — second call doesn't trigger fetch
// =============================================================================

describe('Cache hit — second call avoids fetch', () => {
  it('serves cached result on second call (same package)', async () => {
    mockFetch.mockResolvedValue(mockResponse(200));
    const verifier = createVerifier();

    // First call — should fetch
    await verifier.checkPackages(['lodash']);
    expect(mockFetch).toHaveBeenCalledTimes(1);

    // Second call — should use cache
    mockFetch.mockClear();
    const results = await verifier.checkPackages(['lodash']);
    const result = results.get('lodash')!;

    expect(mockFetch).not.toHaveBeenCalled();
    expect(result.exists).toBe(true);
    expect(result.cached).toBe(true);
  });

  it('caches 404 (non-existent) results too', async () => {
    mockFetch.mockResolvedValue(mockResponse(404));
    const verifier = createVerifier();

    await verifier.checkPackages(['fake-pkg']);
    expect(mockFetch).toHaveBeenCalledTimes(1);

    mockFetch.mockClear();
    const results = await verifier.checkPackages(['fake-pkg']);
    const result = results.get('fake-pkg')!;

    expect(mockFetch).not.toHaveBeenCalled();
    expect(result.exists).toBe(false);
    expect(result.cached).toBe(true);
  });

  it('increments cache size after checking a package', async () => {
    mockFetch.mockResolvedValue(mockResponse(200));
    const verifier = createVerifier();

    expect(verifier.cacheSize).toBe(0);
    await verifier.checkPackages(['lodash']);
    expect(verifier.cacheSize).toBe(1);
    await verifier.checkPackages(['express']);
    expect(verifier.cacheSize).toBe(2);
  });

  it('mixed cached and uncached: only fetches uncached packages', async () => {
    mockFetch.mockResolvedValue(mockResponse(200));
    const verifier = createVerifier();

    // Cache lodash
    await verifier.checkPackages(['lodash']);
    expect(mockFetch).toHaveBeenCalledTimes(1);

    // Now check lodash + express — only express should be fetched
    mockFetch.mockClear();
    const results = await verifier.checkPackages(['lodash', 'express']);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    // Verify express URL was called, not lodash
    const fetchedUrl = mockFetch.mock.calls[0]![0] as string;
    expect(fetchedUrl).toContain('express');
    expect(fetchedUrl).not.toContain('lodash');

    expect(results.get('lodash')!.cached).toBe(true);
    expect(results.get('express')!.cached).toBe(false);
  });

  it('deduplicates package names within a single batch', async () => {
    mockFetch.mockResolvedValue(mockResponse(200));
    const verifier = createVerifier();

    await verifier.checkPackages(['lodash', 'lodash', 'lodash']);

    // Only one fetch for deduplicated name
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('LRU eviction works when cache exceeds maxCacheSize', async () => {
    mockFetch.mockResolvedValue(mockResponse(200));
    const verifier = createVerifier({ maxCacheSize: 3 });

    // Fill cache with 3 packages
    await verifier.checkPackages(['pkg-a', 'pkg-b', 'pkg-c']);
    expect(verifier.cacheSize).toBe(3);

    // Add a 4th — should evict the oldest (pkg-a)
    await verifier.checkPackages(['pkg-d']);
    expect(verifier.cacheSize).toBe(3);

    // pkg-a should be evicted, so checking it again should trigger fetch
    mockFetch.mockClear();
    await verifier.checkPackages(['pkg-a']);
    expect(mockFetch).toHaveBeenCalledTimes(1);

    // pkg-b should still be cached
    mockFetch.mockClear();
    await verifier.checkPackages(['pkg-b']);
    // Note: pkg-b might or might not be evicted depending on LRU behavior.
    // After inserting pkg-d, cache was [pkg-b, pkg-c, pkg-d].
    // After inserting pkg-a (re-fetch), evicts pkg-b → cache is [pkg-c, pkg-d, pkg-a]
    expect(mockFetch).toHaveBeenCalledTimes(1); // pkg-b was evicted
  });

  it('reset() clears cache entirely', async () => {
    mockFetch.mockResolvedValue(mockResponse(200));
    const verifier = createVerifier();

    await verifier.checkPackages(['lodash']);
    expect(verifier.cacheSize).toBe(1);

    verifier.reset();
    expect(verifier.cacheSize).toBe(0);

    // After reset, should re-fetch
    await verifier.checkPackages(['lodash']);
    expect(mockFetch).toHaveBeenCalledTimes(2); // 1 before reset + 1 after
  });
});

// =============================================================================
// 5. Concurrent batch limits
// =============================================================================

describe('Concurrent batch limits', () => {
  it('processes many packages in parallel within concurrency limit', async () => {
    let concurrentCount = 0;
    let maxConcurrent = 0;

    mockFetch.mockImplementation(() => {
      concurrentCount++;
      maxConcurrent = Math.max(maxConcurrent, concurrentCount);
      return new Promise<Response>((resolve) => {
        setTimeout(() => {
          concurrentCount--;
          resolve(mockResponse(200));
        }, 10);
      });
    });

    const verifier = createVerifier({ concurrency: 3 });
    const packages = Array.from({ length: 10 }, (_, i) => `pkg-${i}`);

    await verifier.checkPackages(packages);

    // All packages should be checked
    expect(mockFetch).toHaveBeenCalledTimes(10);
    // Max concurrent should not exceed the limit
    expect(maxConcurrent).toBeLessThanOrEqual(3);
    // At least some concurrency should occur
    expect(maxConcurrent).toBeGreaterThan(0);
  });

  it('respects concurrency=1 (sequential execution)', async () => {
    let concurrentCount = 0;
    let maxConcurrent = 0;

    mockFetch.mockImplementation(() => {
      concurrentCount++;
      maxConcurrent = Math.max(maxConcurrent, concurrentCount);
      return new Promise<Response>((resolve) => {
        setTimeout(() => {
          concurrentCount--;
          resolve(mockResponse(200));
        }, 5);
      });
    });

    const verifier = createVerifier({ concurrency: 1 });
    const packages = ['pkg-a', 'pkg-b', 'pkg-c', 'pkg-d', 'pkg-e'];

    await verifier.checkPackages(packages);

    expect(mockFetch).toHaveBeenCalledTimes(5);
    expect(maxConcurrent).toBe(1);
  });

  it('default concurrency is 10', async () => {
    let concurrentCount = 0;
    let maxConcurrent = 0;

    mockFetch.mockImplementation(() => {
      concurrentCount++;
      maxConcurrent = Math.max(maxConcurrent, concurrentCount);
      return new Promise<Response>((resolve) => {
        setTimeout(() => {
          concurrentCount--;
          resolve(mockResponse(200));
        }, 10);
      });
    });

    const verifier = createVerifier();
    const packages = Array.from({ length: 20 }, (_, i) => `pkg-${i}`);

    await verifier.checkPackages(packages);

    expect(mockFetch).toHaveBeenCalledTimes(20);
    expect(maxConcurrent).toBeLessThanOrEqual(10);
  });

  it('handles errors within concurrent batch without blocking others', async () => {
    let callIndex = 0;
    mockFetch.mockImplementation(() => {
      callIndex++;
      if (callIndex === 3) {
        // Third package triggers network error
        return Promise.reject(new TypeError('fetch failed'));
      }
      return Promise.resolve(mockResponse(200));
    });

    // Also make connectivity check succeed so we don't go fully offline
    // Actually, the failing fetch will trigger connectivity check, which also calls fetch
    // Let's be more precise:
    const verifier = createVerifier({ concurrency: 2 });

    // This test verifies that one failure doesn't block the batch
    const results = await verifier.checkPackages(['pkg-a', 'pkg-b', 'pkg-c', 'pkg-d']);
    expect(results.size).toBe(4);

    // pkg-c failed but all results are present
    for (const [, result] of results) {
      expect(result).toBeDefined();
      expect(result.checkedAt).toBeInstanceOf(Date);
    }
  });
});

// =============================================================================
// 6. Timeout handling
// =============================================================================

describe('Timeout handling', () => {
  it('aborts request after timeout period', async () => {
    // Simulate a request that never resolves
    mockFetch.mockImplementation(
      (_url: string | URL | Request, options?: RequestInit) => {
        return new Promise<Response>((_, reject) => {
          // Listen for abort signal
          if (options?.signal) {
            options.signal.addEventListener('abort', () => {
              const error = new Error('The operation was aborted');
              error.name = 'AbortError';
              reject(error);
            });
          }
        });
      },
    );

    const verifier = createVerifier({ timeout: 100 }); // Very short timeout for test speed

    const results = await verifier.checkPackages(['slow-pkg']);
    const result = results.get('slow-pkg')!;

    expect(result.exists).toBe(false);
    expect(result.statusCode).toBe(-1);
  }, 10000);

  it('passes AbortSignal to fetch', async () => {
    mockFetch.mockResolvedValue(mockResponse(200));
    const verifier = createVerifier({ timeout: 5000 });

    await verifier.checkPackages(['lodash']);

    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it('uses custom timeout value', async () => {
    let receivedSignal: AbortSignal | undefined;
    mockFetch.mockImplementation(
      (_url: string | URL | Request, options?: RequestInit) => {
        receivedSignal = options?.signal ?? undefined;
        return Promise.resolve(mockResponse(200));
      },
    );

    const verifier = createVerifier({ timeout: 12345 });
    await verifier.checkPackages(['lodash']);

    // Signal should have been provided
    expect(receivedSignal).toBeDefined();
    expect(receivedSignal).toBeInstanceOf(AbortSignal);
  });

  it('clears timeout on successful response', async () => {
    const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout');
    mockFetch.mockResolvedValue(mockResponse(200));
    const verifier = createVerifier();

    await verifier.checkPackages(['lodash']);

    // clearTimeout should have been called (cleanup after successful fetch)
    expect(clearTimeoutSpy).toHaveBeenCalled();
    clearTimeoutSpy.mockRestore();
  });

  it('clears timeout on fetch error', async () => {
    const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout');
    mockFetch.mockRejectedValue(new TypeError('fetch failed'));
    const verifier = createVerifier();

    await verifier.checkPackages(['lodash']);

    // clearTimeout should still be called (cleanup in catch/finally)
    expect(clearTimeoutSpy).toHaveBeenCalled();
    clearTimeoutSpy.mockRestore();
  });
});

// =============================================================================
// 7. Scoped packages URL encoding
// =============================================================================

describe('Scoped packages URL encoding', () => {
  it('encodes @scope/pkg as @scope%2Fpkg in the URL', async () => {
    mockFetch.mockResolvedValue(mockResponse(200));
    const verifier = createVerifier();

    await verifier.checkPackages(['@angular/core']);

    expect(mockFetch).toHaveBeenCalledWith(
      'https://registry.npmjs.org/@angular%2Fcore',
      expect.any(Object),
    );
  });

  it('encodes @scope/pkg-with-dashes correctly', async () => {
    mockFetch.mockResolvedValue(mockResponse(200));
    const verifier = createVerifier();

    await verifier.checkPackages(['@babel/preset-env']);

    expect(mockFetch).toHaveBeenCalledWith(
      'https://registry.npmjs.org/@babel%2Fpreset-env',
      expect.any(Object),
    );
  });

  it('encodes multiple scoped packages correctly', async () => {
    mockFetch.mockResolvedValue(mockResponse(200));
    const verifier = createVerifier();

    await verifier.checkPackages(['@types/node', '@types/react', '@vitest/coverage-v8']);

    const urls = mockFetch.mock.calls.map((call: unknown[]) => call[0] as string);
    expect(urls).toContain('https://registry.npmjs.org/@types%2Fnode');
    expect(urls).toContain('https://registry.npmjs.org/@types%2Freact');
    expect(urls).toContain('https://registry.npmjs.org/@vitest%2Fcoverage-v8');
  });

  it('handles scoped package that exists (200)', async () => {
    mockFetch.mockResolvedValue(mockResponse(200));
    const verifier = createVerifier();

    const results = await verifier.checkPackages(['@angular/core']);
    const result = results.get('@angular/core')!;

    expect(result.exists).toBe(true);
    expect(result.statusCode).toBe(200);
  });

  it('handles scoped package that does not exist (404)', async () => {
    mockFetch.mockResolvedValue(mockResponse(404));
    const verifier = createVerifier();

    const results = await verifier.checkPackages(['@fake-scope/fake-pkg']);
    const result = results.get('@fake-scope/fake-pkg')!;

    expect(result.exists).toBe(false);
    expect(result.statusCode).toBe(404);
  });

  it('does not double-encode non-scoped packages', async () => {
    mockFetch.mockResolvedValue(mockResponse(200));
    const verifier = createVerifier();

    await verifier.checkPackages(['lodash']);

    expect(mockFetch).toHaveBeenCalledWith(
      'https://registry.npmjs.org/lodash',
      expect.any(Object),
    );
  });

  it('handles scoped packages in package.json cross-check', async () => {
    mockPackageJson({ dependencies: { '@angular/core': '^17.0.0' } });
    mockFetch.mockResolvedValue(mockResponse(200));
    const verifier = createVerifier();

    const results = await verifier.checkPackages(['@angular/core']);
    const result = results.get('@angular/core')!;

    expect(result.exists).toBe(true);
    expect(result.inPackageJson).toBe(true);
  });
});

// =============================================================================
// 8. Built-in modules are skipped before fetch
// =============================================================================

describe('Built-in modules are skipped before fetch', () => {
  it('skips "fs" (Node.js built-in) — no fetch call', async () => {
    mockFetch.mockResolvedValue(mockResponse(200));
    const verifier = createVerifier();

    const results = await verifier.checkPackages(['fs']);
    const result = results.get('fs')!;

    expect(result.exists).toBe(true);
    expect(result.cached).toBe(true);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('skips "path" built-in', async () => {
    mockFetch.mockResolvedValue(mockResponse(200));
    const verifier = createVerifier();

    const results = await verifier.checkPackages(['path']);
    expect(results.get('path')!.exists).toBe(true);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('skips "node:" prefixed modules', async () => {
    mockFetch.mockResolvedValue(mockResponse(200));
    const verifier = createVerifier();

    const results = await verifier.checkPackages(['node:fs', 'node:path', 'node:crypto']);

    for (const [, result] of results) {
      expect(result.exists).toBe(true);
      expect(result.cached).toBe(true);
    }
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('skips subpath built-ins like "fs/promises"', async () => {
    mockFetch.mockResolvedValue(mockResponse(200));
    const verifier = createVerifier();

    const results = await verifier.checkPackages(['fs/promises', 'stream/web', 'dns/promises']);

    for (const [, result] of results) {
      expect(result.exists).toBe(true);
    }
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('skips all standard Node.js built-in modules', async () => {
    const builtins = [
      'assert', 'buffer', 'child_process', 'cluster', 'console', 'crypto',
      'dgram', 'dns', 'domain', 'events', 'fs', 'http', 'http2', 'https',
      'inspector', 'module', 'net', 'os', 'path', 'perf_hooks', 'process',
      'punycode', 'querystring', 'readline', 'repl', 'stream',
      'string_decoder', 'timers', 'tls', 'tty', 'url', 'util', 'v8',
      'vm', 'worker_threads', 'zlib',
    ];

    mockFetch.mockResolvedValue(mockResponse(200));
    const verifier = createVerifier();

    const results = await verifier.checkPackages(builtins);

    for (const [name, result] of results) {
      expect(result.exists).toBe(true);
      // Should not have called fetch for any built-in
    }
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('does NOT skip non-built-in packages (fetches them)', async () => {
    mockFetch.mockResolvedValue(mockResponse(200));
    const verifier = createVerifier();

    await verifier.checkPackages(['lodash']);

    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('handles mix of built-ins and npm packages (only fetches npm packages)', async () => {
    mockFetch.mockResolvedValue(mockResponse(200));
    const verifier = createVerifier();

    const results = await verifier.checkPackages(['fs', 'lodash', 'path', 'express', 'crypto']);

    // Only lodash and express should trigger fetch
    expect(mockFetch).toHaveBeenCalledTimes(2);
    const urls = mockFetch.mock.calls.map((call: unknown[]) => call[0] as string);
    expect(urls.some((u: string) => u.includes('lodash'))).toBe(true);
    expect(urls.some((u: string) => u.includes('express'))).toBe(true);
    expect(urls.some((u: string) => u.includes('/fs'))).toBe(false);
    expect(urls.some((u: string) => u.includes('/path'))).toBe(false);
    expect(urls.some((u: string) => u.includes('/crypto'))).toBe(false);

    // All should show as existing
    for (const [, result] of results) {
      expect(result.exists).toBe(true);
    }
  });

  it('built-in results report inPackageJson: false', async () => {
    mockPackageJson({ dependencies: { fs: '^1.0.0' } });
    const verifier = createVerifier();

    const results = await verifier.checkPackages(['fs']);
    const result = results.get('fs')!;

    // Even if 'fs' is in package.json (weird but possible), the built-in path
    // reports inPackageJson: false because it short-circuits
    expect(result.inPackageJson).toBe(false);
    expect(result.exists).toBe(true);
  });
});

// =============================================================================
// Package.json cross-check
// =============================================================================

describe('Package.json cross-check', () => {
  it('loads package.json from projectRoot', async () => {
    mockPackageJson({ dependencies: { lodash: '^4.17.21' } });
    mockFetch.mockResolvedValue(mockResponse(200));
    const verifier = createVerifier({ projectRoot: '/my/project' });

    await verifier.checkPackages(['lodash']);

    expect(mockReadFile).toHaveBeenCalledWith(
      expect.stringContaining('package.json'),
      'utf-8',
    );
  });

  it('merges all dependency types (deps, devDeps, peerDeps, optionalDeps)', async () => {
    mockPackageJson({
      dependencies: { lodash: '^4.0.0' },
      devDependencies: { vitest: '^2.0.0' },
      peerDependencies: { react: '^18.0.0' },
      optionalDependencies: { fsevents: '^2.0.0' },
    });

    mockFetch.mockRejectedValue(new TypeError('fetch failed'));
    const verifier = createVerifier();

    // Force offline so we rely purely on package.json
    await verifier.checkPackages(['trigger']);
    expect(verifier.isOffline).toBe(true);

    mockFetch.mockClear();
    const results = await verifier.checkPackages([
      'lodash', 'vitest', 'react', 'fsevents', 'not-a-dep',
    ]);

    expect(results.get('lodash')!.exists).toBe(true);
    expect(results.get('vitest')!.exists).toBe(true);
    expect(results.get('react')!.exists).toBe(true);
    expect(results.get('fsevents')!.exists).toBe(true);
    expect(results.get('not-a-dep')!.exists).toBe(false);
  });

  it('only loads package.json once (caches on first call)', async () => {
    mockPackageJson({ dependencies: { lodash: '^4.0.0' } });
    mockFetch.mockResolvedValue(mockResponse(200));
    const verifier = createVerifier();

    await verifier.checkPackages(['lodash']);
    await verifier.checkPackages(['express']);

    // readFile should only be called once
    expect(mockReadFile).toHaveBeenCalledTimes(1);
  });

  it('reset() forces package.json reload on next call', async () => {
    mockPackageJson({ dependencies: { lodash: '^4.0.0' } });
    mockFetch.mockResolvedValue(mockResponse(200));
    const verifier = createVerifier();

    await verifier.checkPackages(['lodash']);
    expect(mockReadFile).toHaveBeenCalledTimes(1);

    verifier.reset();

    await verifier.checkPackages(['express']);
    expect(mockReadFile).toHaveBeenCalledTimes(2);
  });
});

// =============================================================================
// Registry URL configuration
// =============================================================================

describe('Registry URL configuration', () => {
  it('uses custom registry URL', async () => {
    mockFetch.mockResolvedValue(mockResponse(200));
    const verifier = createVerifier({
      registryUrl: 'https://custom.registry.com/npm',
    });

    await verifier.checkPackages(['lodash']);

    expect(mockFetch).toHaveBeenCalledWith(
      'https://custom.registry.com/npm/lodash',
      expect.any(Object),
    );
  });

  it('strips trailing slashes from registry URL', async () => {
    mockFetch.mockResolvedValue(mockResponse(200));
    const verifier = createVerifier({
      registryUrl: 'https://custom.registry.com///',
    });

    await verifier.checkPackages(['lodash']);

    expect(mockFetch).toHaveBeenCalledWith(
      'https://custom.registry.com/lodash',
      expect.any(Object),
    );
  });

  it('defaults to https://registry.npmjs.org', async () => {
    mockFetch.mockResolvedValue(mockResponse(200));
    const verifier = new NpmRegistryVerifier();

    await verifier.checkPackages(['lodash']);

    expect(mockFetch).toHaveBeenCalledWith(
      'https://registry.npmjs.org/lodash',
      expect.any(Object),
    );
  });
});

// =============================================================================
// Edge cases
// =============================================================================

describe('Edge cases', () => {
  it('handles empty package list', async () => {
    const verifier = createVerifier();

    const results = await verifier.checkPackages([]);

    expect(results.size).toBe(0);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('handles single package', async () => {
    mockFetch.mockResolvedValue(mockResponse(200));
    const verifier = createVerifier();

    const results = await verifier.checkPackages(['lodash']);

    expect(results.size).toBe(1);
    expect(results.get('lodash')!.exists).toBe(true);
  });

  it('handles large batch (100 packages)', async () => {
    mockFetch.mockResolvedValue(mockResponse(200));
    const verifier = createVerifier();
    const packages = Array.from({ length: 100 }, (_, i) => `pkg-${i}`);

    const results = await verifier.checkPackages(packages);

    expect(results.size).toBe(100);
    expect(mockFetch).toHaveBeenCalledTimes(100);
  });

  it('handles duplicate packages in the same batch', async () => {
    mockFetch.mockResolvedValue(mockResponse(200));
    const verifier = createVerifier();

    const results = await verifier.checkPackages(['lodash', 'lodash', 'express', 'express']);

    // Deduplication: only 2 unique packages
    expect(results.size).toBe(2);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('Accept header is set to application/json', async () => {
    mockFetch.mockResolvedValue(mockResponse(200));
    const verifier = createVerifier();

    await verifier.checkPackages(['lodash']);

    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({
          Accept: 'application/json',
        }),
      }),
    );
  });

  it('packages with special characters are encoded', async () => {
    mockFetch.mockResolvedValue(mockResponse(200));
    const verifier = createVerifier();

    await verifier.checkPackages(['my-package']);

    // '-' is not a special character and should be passed through
    expect(mockFetch).toHaveBeenCalledWith(
      'https://registry.npmjs.org/my-package',
      expect.any(Object),
    );
  });
});
