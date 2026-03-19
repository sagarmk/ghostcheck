/**
 * Unit tests for PrettyFormatter
 *
 * Tests the terminal output formatting including:
 * - Header rendering
 * - Finding grouping by severity
 * - Code snippet display
 * - Fix/suggestion rendering
 * - Confidence display
 * - Summary line
 */

import { describe, it, expect } from 'vitest';
import { PrettyFormatter } from '../../../src/output/pretty.js';
import { createScanResult, createFinding, createFindingWithFix, createScanSummary, createScanMetrics } from '../../helpers/factories.js';
import type { ScanResult } from '../../../src/core/types.js';

describe('PrettyFormatter', () => {
  const formatter = new PrettyFormatter();

  describe('basic output', () => {
    it('should include version header', () => {
      const result = createScanResult();
      const output = formatter.format(result);
      expect(output).toContain('AI Code Verifier');
      expect(output).toContain('v0.1.0');
    });

    it('should include scan metrics', () => {
      const result = createScanResult({
        scan: createScanMetrics({ files: 42, durationMs: 150 }),
      });
      const output = formatter.format(result);
      expect(output).toContain('42');
      expect(output).toContain('150ms');
    });

    it('should show cached count when caching is used', () => {
      const result = createScanResult({
        scan: createScanMetrics({ files: 10, cached: 5 }),
      });
      const output = formatter.format(result);
      expect(output).toContain('5 cached');
    });
  });

  describe('no findings', () => {
    it('should show success message when no findings', () => {
      const result = createScanResult({
        findings: [],
        summary: createScanSummary(),
      });
      const output = formatter.format(result);
      expect(output).toContain('No issues found');
    });

    it('should show "All clear" in summary when no findings', () => {
      const result = createScanResult({
        findings: [],
        summary: createScanSummary(),
      });
      const output = formatter.format(result);
      expect(output).toContain('All clear');
    });
  });

  describe('finding display', () => {
    it('should display error findings', () => {
      const result = createScanResult({
        findings: [createFinding({
          severity: 'error',
          ruleId: 'eval-usage',
          message: 'Unsafe eval() usage detected',
          filePath: '/src/app.ts',
          line: 10,
          column: 5,
        })],
        summary: createScanSummary({ errors: 1 }),
      });
      const output = formatter.format(result);
      expect(output).toContain('ERROR');
      expect(output).toContain('eval-usage');
      expect(output).toContain('Unsafe eval() usage detected');
    });

    it('should display warning findings', () => {
      const result = createScanResult({
        findings: [createFinding({
          severity: 'warn',
          ruleId: 'insecure-random',
          message: 'Math.random() used for security',
        })],
        summary: createScanSummary({ warnings: 1 }),
      });
      const output = formatter.format(result);
      expect(output).toContain('WARN');
      expect(output).toContain('insecure-random');
    });

    it('should display info findings', () => {
      const result = createScanResult({
        findings: [createFinding({
          severity: 'info',
          ruleId: 'unused-import',
          message: 'Unused import detected',
        })],
        summary: createScanSummary({ info: 1 }),
      });
      const output = formatter.format(result);
      expect(output).toContain('INFO');
      expect(output).toContain('unused-import');
    });

    it('should show file location', () => {
      const result = createScanResult({
        findings: [createFinding({
          filePath: '/src/utils/helpers.ts',
          line: 42,
          column: 7,
        })],
        summary: createScanSummary({ errors: 1 }),
      });
      const output = formatter.format(result);
      expect(output).toContain('/src/utils/helpers.ts:42:7');
    });

    it('should show code snippet', () => {
      const result = createScanResult({
        findings: [createFinding({
          codeSnippet: 'eval(userInput)',
        })],
        summary: createScanSummary({ errors: 1 }),
      });
      const output = formatter.format(result);
      expect(output).toContain('eval(userInput)');
    });

    it('should show fix suggestion when available', () => {
      const result = createScanResult({
        findings: [createFindingWithFix({
          fix: { from: 'eval(code)', to: 'safeEval(code)' },
        })],
        summary: createScanSummary({ errors: 1, fixable: 1 }),
      });
      const output = formatter.format(result);
      expect(output).toContain('fix:');
      expect(output).toContain('eval(code)');
      expect(output).toContain('safeEval(code)');
    });

    it('should show text suggestion when no fix', () => {
      const result = createScanResult({
        findings: [createFinding({
          fix: null,
          suggestion: 'Use parameterized queries instead',
        })],
        summary: createScanSummary({ errors: 1 }),
      });
      const output = formatter.format(result);
      expect(output).toContain('suggestion:');
      expect(output).toContain('Use parameterized queries instead');
    });

    it('should show confidence percentage when less than 100%', () => {
      const result = createScanResult({
        findings: [createFinding({ confidence: 0.75 })],
        summary: createScanSummary({ errors: 1 }),
      });
      const output = formatter.format(result);
      expect(output).toContain('confidence: 75%');
    });

    it('should not show confidence when 100%', () => {
      const result = createScanResult({
        findings: [createFinding({ confidence: 1.0 })],
        summary: createScanSummary({ errors: 1 }),
      });
      const output = formatter.format(result);
      expect(output).not.toContain('confidence:');
    });
  });

  describe('grouping', () => {
    it('should group findings by severity (errors first)', () => {
      const result = createScanResult({
        findings: [
          createFinding({ severity: 'info', ruleId: 'info-rule' }),
          createFinding({ severity: 'error', ruleId: 'error-rule' }),
          createFinding({ severity: 'warn', ruleId: 'warn-rule' }),
        ],
        summary: createScanSummary({ errors: 1, warnings: 1, info: 1 }),
      });
      const output = formatter.format(result);

      const errorPos = output.indexOf('Errors');
      const warnPos = output.indexOf('Warnings');
      const infoPos = output.indexOf('Info');

      // Errors should come before warnings, warnings before info
      expect(errorPos).toBeLessThan(warnPos);
      expect(warnPos).toBeLessThan(infoPos);
    });
  });

  describe('summary line', () => {
    it('should show error count in summary', () => {
      const result = createScanResult({
        findings: [createFinding({ severity: 'error' })],
        summary: createScanSummary({ errors: 3 }),
      });
      const output = formatter.format(result);
      expect(output).toContain('3 errors');
    });

    it('should show warning count in summary', () => {
      const result = createScanResult({
        findings: [createFinding({ severity: 'warn' })],
        summary: createScanSummary({ warnings: 5 }),
      });
      const output = formatter.format(result);
      expect(output).toContain('5 warnings');
    });

    it('should show fixable count in summary', () => {
      const result = createScanResult({
        findings: [createFindingWithFix()],
        summary: createScanSummary({ errors: 1, fixable: 2 }),
      });
      const output = formatter.format(result);
      expect(output).toContain('2 fixable');
    });
  });
});
