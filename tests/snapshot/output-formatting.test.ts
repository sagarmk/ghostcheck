/**
 * Snapshot tests for terminal output formatting
 *
 * Uses Vitest's snapshot feature to detect unintended changes
 * in the output formatting of all formatters (pretty, JSON, SARIF).
 */

import { describe, it, expect } from 'vitest';
import { PrettyFormatter } from '../../src/output/pretty.js';
import { JsonFormatter } from '../../src/output/json.js';
import { SarifFormatter } from '../../src/output/sarif.js';
import { createScanResult, createFinding, createFindingWithFix, createScanSummary, createScanMetrics, createScanConfig } from '../helpers/factories.js';
import type { ScanResult, Finding } from '../../src/core/types.js';

/**
 * Create a deterministic scan result for snapshot testing.
 * Fixed timestamp and values to ensure reproducible snapshots.
 */
function createDeterministicResult(findings: Finding[] = []): ScanResult {
  return {
    version: '0.1.0',
    timestamp: '2026-03-18T00:00:00.000Z',
    config: createScanConfig({
      failOn: 'error',
      rules: 35,
      languages: ['typescript', 'javascript'],
    }),
    scan: createScanMetrics({
      files: 15,
      durationMs: 234,
      cached: 5,
      parsed: 10,
      skipped: 0,
    }),
    findings,
    summary: createScanSummary({
      errors: findings.filter((f) => f.severity === 'error').length,
      warnings: findings.filter((f) => f.severity === 'warn').length,
      info: findings.filter((f) => f.severity === 'info').length,
      fixable: findings.filter((f) => f.fix !== null).length,
      categories: {
        'ai-specific': findings.filter((f) => f.category === 'ai-specific').length,
        security: findings.filter((f) => f.category === 'security').length,
        correctness: findings.filter((f) => f.category === 'correctness').length,
      },
    }),
    exitCode: findings.some((f) => f.severity === 'error') ? 1 : 0,
  };
}

describe('Output Formatting Snapshots', () => {
  describe('JSON Formatter', () => {
    const formatter = new JsonFormatter();

    it('should match snapshot for empty results', () => {
      const result = createDeterministicResult();
      const output = formatter.format(result);
      expect(output).toMatchSnapshot();
    });

    it('should match snapshot for single error finding', () => {
      const result = createDeterministicResult([
        createFinding({
          ruleId: 'eval-usage',
          severity: 'error',
          category: 'security',
          message: 'Direct eval() usage is dangerous — use safer alternatives',
          filePath: '/src/utils.ts',
          line: 42,
          column: 5,
          endLine: 42,
          endColumn: 25,
          codeSnippet: 'eval(userInput)',
          fix: null,
          suggestion: 'Use JSON.parse() for JSON data or Function() for expressions',
          owaspRef: 'A03:2021-Injection',
          confidence: 0.99,
        }),
      ]);
      const output = formatter.format(result);
      expect(output).toMatchSnapshot();
    });

    it('should match snapshot for mixed findings with fixes', () => {
      const result = createDeterministicResult([
        createFinding({
          ruleId: 'hardcoded-secret-pattern',
          severity: 'error',
          category: 'security',
          message: 'Hardcoded API key detected',
          filePath: '/src/config.ts',
          line: 10,
          column: 1,
          endLine: 10,
          endColumn: 55,
          codeSnippet: "const API_KEY = 'sk-1234567890abcdef';",
          confidence: 0.95,
        }),
        createFindingWithFix({
          ruleId: 'outdated-api-usage',
          severity: 'warn',
          category: 'ai-specific',
          message: 'url.parse() is deprecated — use new URL() instead',
          filePath: '/src/http.ts',
          line: 7,
          column: 10,
          endLine: 7,
          endColumn: 30,
          codeSnippet: 'url.parse(urlStr)',
          fix: { from: 'url.parse(urlStr)', to: 'new URL(urlStr)' },
          confidence: 0.88,
        }),
        createFinding({
          ruleId: 'unused-import',
          severity: 'info',
          category: 'correctness',
          message: "Import 'join' is never used",
          filePath: '/src/utils.ts',
          line: 1,
          column: 10,
          endLine: 1,
          endColumn: 14,
          codeSnippet: "import { join } from 'path';",
          confidence: 1.0,
        }),
      ]);
      const output = formatter.format(result);
      expect(output).toMatchSnapshot();
    });
  });

  describe('SARIF Formatter', () => {
    const formatter = new SarifFormatter();

    it('should match snapshot for empty results', () => {
      const result = createDeterministicResult();
      const output = formatter.format(result);
      expect(output).toMatchSnapshot();
    });

    it('should match snapshot for security findings', () => {
      const result = createDeterministicResult([
        createFinding({
          ruleId: 'sql-injection-concat',
          severity: 'error',
          category: 'security',
          message: 'SQL query built via string concatenation — use parameterized queries',
          filePath: '/src/db.ts',
          line: 25,
          column: 3,
          endLine: 25,
          endColumn: 65,
          codeSnippet: "const q = 'SELECT * FROM users WHERE name = \\'' + name + '\\'';",
          owaspRef: 'A03:2021-Injection',
          confidence: 0.97,
        }),
        createFindingWithFix({
          ruleId: 'insecure-random',
          severity: 'warn',
          category: 'security',
          message: 'Math.random() is not cryptographically secure',
          filePath: '/src/auth.ts',
          line: 15,
          column: 10,
          endLine: 15,
          endColumn: 25,
          codeSnippet: 'Math.random()',
          fix: { from: 'Math.random()', to: 'crypto.randomUUID()' },
          confidence: 0.90,
        }),
      ]);
      const output = formatter.format(result);
      expect(output).toMatchSnapshot();
    });
  });

  describe('Pretty Formatter', () => {
    const formatter = new PrettyFormatter();

    // Note: Pretty formatter uses ANSI color codes which change with chalk versions.
    // We test structure rather than exact ANSI sequences.

    it('should produce consistent output for empty results', () => {
      const result = createDeterministicResult();
      const output = formatter.format(result);

      // Verify structural elements are present
      expect(output).toContain('AI Code Verifier');
      expect(output).toContain('v0.1.0');
      expect(output).toContain('15'); // files count
      expect(output).toContain('234ms');
      expect(output).toContain('5 cached');
    });

    it('should produce consistent output for error findings', () => {
      const result = createDeterministicResult([
        createFinding({
          ruleId: 'eval-usage',
          severity: 'error',
          category: 'security',
          message: 'eval() usage detected',
          filePath: '/src/danger.ts',
          line: 10,
          column: 1,
          endLine: 10,
          endColumn: 15,
          codeSnippet: 'eval(code)',
          confidence: 0.99,
        }),
      ]);
      const output = formatter.format(result);

      expect(output).toContain('eval-usage');
      expect(output).toContain('eval() usage detected');
      expect(output).toContain('/src/danger.ts:10:1');
      expect(output).toContain('eval(code)');
      expect(output).toContain('99%');
    });

    it('should produce consistent output with fix suggestions', () => {
      const result = createDeterministicResult([
        createFindingWithFix({
          ruleId: 'outdated-api-usage',
          severity: 'warn',
          category: 'ai-specific',
          message: 'Deprecated API',
          filePath: '/src/utils.ts',
          line: 5,
          column: 1,
          endLine: 5,
          endColumn: 20,
          codeSnippet: 'url.parse(x)',
          fix: { from: 'url.parse(x)', to: 'new URL(x)' },
          confidence: 1.0,
        }),
      ]);
      const output = formatter.format(result);

      expect(output).toContain('fix:');
      expect(output).toContain('url.parse(x)');
      expect(output).toContain('new URL(x)');
    });

    it('should produce consistent output with text suggestions', () => {
      const result = createDeterministicResult([
        createFinding({
          severity: 'warn',
          ruleId: 'sql-injection',
          category: 'security',
          message: 'SQL injection risk',
          filePath: '/src/db.ts',
          line: 3,
          column: 1,
          endLine: 3,
          endColumn: 50,
          codeSnippet: 'query = "SELECT * FROM " + table',
          fix: null,
          suggestion: 'Use parameterized queries with ? placeholders',
          confidence: 0.85,
        }),
      ]);
      const output = formatter.format(result);

      expect(output).toContain('suggestion:');
      expect(output).toContain('Use parameterized queries with ? placeholders');
      expect(output).toContain('85%');
    });

    it('should show severity grouping headers', () => {
      const result = createDeterministicResult([
        createFinding({ severity: 'error', ruleId: 'err1' }),
        createFinding({ severity: 'warn', ruleId: 'warn1' }),
        createFinding({ severity: 'info', ruleId: 'info1' }),
      ]);
      const output = formatter.format(result);

      expect(output).toContain('Errors');
      expect(output).toContain('Warnings');
      expect(output).toContain('Info');
    });
  });
});
