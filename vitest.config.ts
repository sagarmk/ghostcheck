/**
 * Vitest configuration for AI Code Verifier (acv)
 *
 * Coverage thresholds target 80% across all metrics.
 * Tests are organized by type: unit, integration, performance, snapshot.
 */

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Global settings
    globals: true,
    environment: 'node',
    root: '.',

    // Include patterns
    include: [
      'tests/**/*.test.ts',
      'tests/**/*.spec.ts',
    ],

    // Exclude patterns
    exclude: [
      'node_modules',
      'dist',
      'tests/fixtures/**',
      'tests/performance/**/*.fixture.*',
    ],

    // Timeout settings
    testTimeout: 10_000,
    hookTimeout: 10_000,

    // Reporter
    reporters: ['verbose'],

    // Coverage configuration
    coverage: {
      provider: 'v8',
      enabled: false, // Enable with --coverage flag
      reporter: ['text', 'text-summary', 'lcov', 'html', 'json-summary'],
      reportsDirectory: 'coverage',

      // Coverage thresholds — 80% target
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80,
      },

      // Files to instrument
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.d.ts',
        'src/**/index.ts', // Re-export barrels
        'node_modules/**',
        'dist/**',
      ],
    },

    // Snapshot settings
    snapshotFormat: {
      printBasicPrototype: false,
    },

    // Type checking (optional, enabled separately)
    typecheck: {
      enabled: false, // Use `npm run typecheck` separately
    },

    // Sequence settings for deterministic test order
    sequence: {
      shuffle: false,
    },

    // Pool settings
    pool: 'forks',
  },
});
