/**
 * Unit tests for JsonFormatter
 *
 * Tests that JSON output is valid, complete, and properly formatted.
 */

import { describe, it, expect } from 'vitest';
import { JsonFormatter } from '../../../src/output/json.js';
import { createScanResult, createFinding, createFindingWithFix, createScanSummary, createScanMetrics } from '../../helpers/factories.js';

describe('JsonFormatter', () => {
  const formatter = new JsonFormatter();

  it('should produce valid JSON', () => {
    const result = createScanResult();
    const output = formatter.format(result);
    expect(() => JSON.parse(output)).not.toThrow();
  });

  it('should preserve all scan result fields', () => {
    const result = createScanResult({
      version: '0.1.0',
      timestamp: '2026-03-18T00:00:00.000Z',
    });
    const parsed = JSON.parse(formatter.format(result));

    expect(parsed.version).toBe('0.1.0');
    expect(parsed.timestamp).toBe('2026-03-18T00:00:00.000Z');
    expect(parsed.config).toBeDefined();
    expect(parsed.scan).toBeDefined();
    expect(parsed.findings).toBeDefined();
    expect(parsed.summary).toBeDefined();
    expect(parsed.exitCode).toBeDefined();
  });

  it('should include all finding fields', () => {
    const finding = createFinding({
      ruleId: 'sql-injection-concat',
      severity: 'error',
      category: 'security',
      message: 'SQL injection via string concatenation',
      filePath: '/src/db.ts',
      line: 15,
      column: 3,
      endLine: 15,
      endColumn: 60,
      codeSnippet: "const q = 'SELECT * FROM ' + table;",
      confidence: 0.92,
      owaspRef: 'A03:2021-Injection',
    });

    const result = createScanResult({
      findings: [finding],
      summary: createScanSummary({ errors: 1, categories: { 'ai-specific': 0, security: 1, correctness: 0 } }),
    });

    const parsed = JSON.parse(formatter.format(result));
    const f = parsed.findings[0];

    expect(f.ruleId).toBe('sql-injection-concat');
    expect(f.severity).toBe('error');
    expect(f.category).toBe('security');
    expect(f.message).toBe('SQL injection via string concatenation');
    expect(f.filePath).toBe('/src/db.ts');
    expect(f.line).toBe(15);
    expect(f.column).toBe(3);
    expect(f.confidence).toBe(0.92);
    expect(f.owaspRef).toBe('A03:2021-Injection');
  });

  it('should include fix information', () => {
    const result = createScanResult({
      findings: [createFindingWithFix({
        fix: { from: 'eval(x)', to: 'JSON.parse(x)' },
      })],
      summary: createScanSummary({ errors: 1, fixable: 1 }),
    });

    const parsed = JSON.parse(formatter.format(result));
    expect(parsed.findings[0].fix).toEqual({ from: 'eval(x)', to: 'JSON.parse(x)' });
  });

  it('should handle empty findings array', () => {
    const result = createScanResult({ findings: [] });
    const parsed = JSON.parse(formatter.format(result));
    expect(parsed.findings).toEqual([]);
  });

  it('should handle many findings', () => {
    const findings = Array.from({ length: 100 }, (_, i) =>
      createFinding({ ruleId: `rule-${i}`, line: i + 1 }),
    );
    const result = createScanResult({ findings });
    const parsed = JSON.parse(formatter.format(result));
    expect(parsed.findings).toHaveLength(100);
  });

  it('should use indented format (2 spaces)', () => {
    const result = createScanResult();
    const output = formatter.format(result);
    // JSON.stringify with indent 2 produces lines starting with "  "
    expect(output).toContain('\n  ');
  });

  it('should include scan metrics', () => {
    const result = createScanResult({
      scan: createScanMetrics({ files: 42, durationMs: 1234, cached: 10, parsed: 32, skipped: 2 }),
    });
    const parsed = JSON.parse(formatter.format(result));
    expect(parsed.scan.files).toBe(42);
    expect(parsed.scan.durationMs).toBe(1234);
    expect(parsed.scan.cached).toBe(10);
    expect(parsed.scan.parsed).toBe(32);
    expect(parsed.scan.skipped).toBe(2);
  });
});
