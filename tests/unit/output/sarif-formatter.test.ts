/**
 * Unit tests for SarifFormatter
 *
 * Tests SARIF v2.1 output format compliance including:
 * - Schema reference
 * - Tool driver metadata
 * - Rule descriptors
 * - Result entries with locations
 * - Severity mapping
 * - Fix information
 */

import { describe, it, expect } from 'vitest';
import { SarifFormatter } from '../../../src/output/sarif.js';
import { createScanResult, createFinding, createFindingWithFix, createScanSummary } from '../../helpers/factories.js';

describe('SarifFormatter', () => {
  const formatter = new SarifFormatter();

  describe('SARIF structure', () => {
    it('should produce valid JSON', () => {
      const result = createScanResult();
      const output = formatter.format(result);
      expect(() => JSON.parse(output)).not.toThrow();
    });

    it('should include SARIF v2.1 schema reference', () => {
      const result = createScanResult();
      const parsed = JSON.parse(formatter.format(result));
      expect(parsed.$schema).toContain('sarif-schema-2.1.0');
    });

    it('should set version to 2.1.0', () => {
      const result = createScanResult();
      const parsed = JSON.parse(formatter.format(result));
      expect(parsed.version).toBe('2.1.0');
    });

    it('should have exactly one run', () => {
      const result = createScanResult();
      const parsed = JSON.parse(formatter.format(result));
      expect(parsed.runs).toHaveLength(1);
    });
  });

  describe('tool driver', () => {
    it('should identify as ai-code-verifier', () => {
      const result = createScanResult();
      const parsed = JSON.parse(formatter.format(result));
      expect(parsed.runs[0].tool.driver.name).toBe('ai-code-verifier');
    });

    it('should include version from scan result', () => {
      const result = createScanResult({ version: '0.1.0' });
      const parsed = JSON.parse(formatter.format(result));
      expect(parsed.runs[0].tool.driver.version).toBe('0.1.0');
    });

    it('should include information URI', () => {
      const result = createScanResult();
      const parsed = JSON.parse(formatter.format(result));
      expect(parsed.runs[0].tool.driver.informationUri).toBeDefined();
    });
  });

  describe('results mapping', () => {
    it('should map findings to SARIF results', () => {
      const result = createScanResult({
        findings: [
          createFinding({ ruleId: 'eval-usage', message: 'Unsafe eval' }),
        ],
        summary: createScanSummary({ errors: 1 }),
      });
      const parsed = JSON.parse(formatter.format(result));
      const sarifResults = parsed.runs[0].results;

      expect(sarifResults).toHaveLength(1);
      expect(sarifResults[0].ruleId).toBe('eval-usage');
      expect(sarifResults[0].message.text).toBe('Unsafe eval');
    });

    it('should map error severity to SARIF error level', () => {
      const result = createScanResult({
        findings: [createFinding({ severity: 'error' })],
        summary: createScanSummary({ errors: 1 }),
      });
      const parsed = JSON.parse(formatter.format(result));
      expect(parsed.runs[0].results[0].level).toBe('error');
    });

    it('should map warn severity to SARIF warning level', () => {
      const result = createScanResult({
        findings: [createFinding({ severity: 'warn' })],
        summary: createScanSummary({ warnings: 1 }),
      });
      const parsed = JSON.parse(formatter.format(result));
      expect(parsed.runs[0].results[0].level).toBe('warning');
    });

    it('should map info severity to SARIF note level', () => {
      const result = createScanResult({
        findings: [createFinding({ severity: 'info' })],
        summary: createScanSummary({ info: 1 }),
      });
      const parsed = JSON.parse(formatter.format(result));
      expect(parsed.runs[0].results[0].level).toBe('note');
    });
  });

  describe('locations', () => {
    it('should include physical location with line/column', () => {
      const result = createScanResult({
        findings: [createFinding({
          filePath: '/src/app.ts',
          line: 42,
          column: 7,
          endLine: 42,
          endColumn: 20,
        })],
        summary: createScanSummary({ errors: 1 }),
      });
      const parsed = JSON.parse(formatter.format(result));
      const location = parsed.runs[0].results[0].locations[0].physicalLocation;

      expect(location.artifactLocation.uri).toBe('/src/app.ts');
      expect(location.region.startLine).toBe(42);
      expect(location.region.startColumn).toBe(7);
      expect(location.region.endLine).toBe(42);
      expect(location.region.endColumn).toBe(20);
    });
  });

  describe('fixes', () => {
    it('should include fix information when available', () => {
      const result = createScanResult({
        findings: [createFindingWithFix({
          fix: { from: 'eval(x)', to: 'JSON.parse(x)' },
        })],
        summary: createScanSummary({ errors: 1, fixable: 1 }),
      });
      const parsed = JSON.parse(formatter.format(result));
      const sarifResult = parsed.runs[0].results[0];

      expect(sarifResult.fixes).toBeDefined();
      expect(sarifResult.fixes).toHaveLength(1);
    });

    it('should not include fixes when finding has no fix', () => {
      const result = createScanResult({
        findings: [createFinding({ fix: null })],
        summary: createScanSummary({ errors: 1 }),
      });
      const parsed = JSON.parse(formatter.format(result));
      expect(parsed.runs[0].results[0].fixes).toBeUndefined();
    });
  });

  describe('confidence', () => {
    it('should include confidence in properties when < 1.0', () => {
      const result = createScanResult({
        findings: [createFinding({ confidence: 0.85 })],
        summary: createScanSummary({ errors: 1 }),
      });
      const parsed = JSON.parse(formatter.format(result));
      expect(parsed.runs[0].results[0].properties.confidence).toBe(0.85);
    });

    it('should not include confidence properties when 1.0', () => {
      const result = createScanResult({
        findings: [createFinding({ confidence: 1.0 })],
        summary: createScanSummary({ errors: 1 }),
      });
      const parsed = JSON.parse(formatter.format(result));
      expect(parsed.runs[0].results[0].properties).toBeUndefined();
    });
  });

  describe('rule descriptors', () => {
    it('should generate rule descriptors from findings', () => {
      const result = createScanResult({
        findings: [
          createFinding({ ruleId: 'rule-a', severity: 'error', category: 'security' }),
          createFinding({ ruleId: 'rule-b', severity: 'warn', category: 'ai-specific' }),
        ],
        summary: createScanSummary({ errors: 1, warnings: 1 }),
      });
      const parsed = JSON.parse(formatter.format(result));
      const rules = parsed.runs[0].tool.driver.rules;

      expect(rules).toHaveLength(2);
      expect(rules.map((r: any) => r.id)).toContain('rule-a');
      expect(rules.map((r: any) => r.id)).toContain('rule-b');
    });

    it('should deduplicate rule descriptors', () => {
      const result = createScanResult({
        findings: [
          createFinding({ ruleId: 'same-rule' }),
          createFinding({ ruleId: 'same-rule' }),
          createFinding({ ruleId: 'same-rule' }),
        ],
        summary: createScanSummary({ errors: 3 }),
      });
      const parsed = JSON.parse(formatter.format(result));
      expect(parsed.runs[0].tool.driver.rules).toHaveLength(1);
    });
  });

  describe('invocations', () => {
    it('should set executionSuccessful to true when exitCode is not 3', () => {
      const result = createScanResult({ exitCode: 0 });
      const parsed = JSON.parse(formatter.format(result));
      expect(parsed.runs[0].invocations[0].executionSuccessful).toBe(true);
    });

    it('should set executionSuccessful to false when exitCode is 3 (runtime error)', () => {
      const result = createScanResult({ exitCode: 3 });
      const parsed = JSON.parse(formatter.format(result));
      expect(parsed.runs[0].invocations[0].executionSuccessful).toBe(false);
    });
  });
});
