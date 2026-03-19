/**
 * Unit tests for the Pipeline Orchestrator
 *
 * Tests computeSummary(), computeExitCode(), and buildScanResult().
 */

import { describe, it, expect } from 'vitest';
import { computeSummary, computeExitCode, buildScanResult } from '../../../src/core/orchestrator.js';
import { createFinding, createFindingWithFix, createAcvConfig, createScanMetrics } from '../../helpers/factories.js';
import type { Finding, AcvConfig, ScanMetrics } from '../../../src/core/types.js';

describe('Orchestrator', () => {
  describe('computeSummary()', () => {
    it('should return zero counts for empty findings', () => {
      const summary = computeSummary([]);
      expect(summary.errors).toBe(0);
      expect(summary.warnings).toBe(0);
      expect(summary.info).toBe(0);
      expect(summary.fixable).toBe(0);
      expect(summary.categories['ai-specific']).toBe(0);
      expect(summary.categories.security).toBe(0);
      expect(summary.categories.correctness).toBe(0);
    });

    it('should count errors correctly', () => {
      const findings: Finding[] = [
        createFinding({ severity: 'error' }),
        createFinding({ severity: 'error' }),
        createFinding({ severity: 'warn' }),
      ];
      const summary = computeSummary(findings);
      expect(summary.errors).toBe(2);
      expect(summary.warnings).toBe(1);
    });

    it('should count warnings correctly', () => {
      const findings: Finding[] = [
        createFinding({ severity: 'warn' }),
        createFinding({ severity: 'warn' }),
        createFinding({ severity: 'warn' }),
        createFinding({ severity: 'info' }),
      ];
      const summary = computeSummary(findings);
      expect(summary.warnings).toBe(3);
      expect(summary.info).toBe(1);
    });

    it('should count info findings correctly', () => {
      const findings: Finding[] = [
        createFinding({ severity: 'info' }),
        createFinding({ severity: 'info' }),
      ];
      const summary = computeSummary(findings);
      expect(summary.info).toBe(2);
    });

    it('should count fixable findings', () => {
      const findings: Finding[] = [
        createFinding({ fix: null }),
        createFindingWithFix(),
        createFindingWithFix(),
        createFinding({ fix: null }),
      ];
      const summary = computeSummary(findings);
      expect(summary.fixable).toBe(2);
    });

    it('should count categories correctly', () => {
      const findings: Finding[] = [
        createFinding({ category: 'security' }),
        createFinding({ category: 'security' }),
        createFinding({ category: 'ai-specific' }),
        createFinding({ category: 'correctness' }),
        createFinding({ category: 'correctness' }),
        createFinding({ category: 'correctness' }),
      ];
      const summary = computeSummary(findings);
      expect(summary.categories.security).toBe(2);
      expect(summary.categories['ai-specific']).toBe(1);
      expect(summary.categories.correctness).toBe(3);
    });

    it('should handle mixed severities and categories', () => {
      const findings: Finding[] = [
        createFinding({ severity: 'error', category: 'security' }),
        createFinding({ severity: 'warn', category: 'ai-specific' }),
        createFinding({ severity: 'info', category: 'correctness' }),
        createFindingWithFix({ severity: 'error', category: 'security' }),
      ];
      const summary = computeSummary(findings);
      expect(summary.errors).toBe(2);
      expect(summary.warnings).toBe(1);
      expect(summary.info).toBe(1);
      expect(summary.fixable).toBe(1);
      expect(summary.categories.security).toBe(2);
      expect(summary.categories['ai-specific']).toBe(1);
      expect(summary.categories.correctness).toBe(1);
    });
  });

  describe('computeExitCode()', () => {
    it('should return 0 when no findings exceed threshold', () => {
      const summary = computeSummary([]);
      const config = createAcvConfig({ failOn: 'error' });
      expect(computeExitCode(summary, config)).toBe(0);
    });

    it('should return 1 when errors exist and failOn=error', () => {
      const summary = computeSummary([createFinding({ severity: 'error' })]);
      const config = createAcvConfig({ failOn: 'error' });
      expect(computeExitCode(summary, config)).toBe(1);
    });

    it('should return 0 when only warnings exist and failOn=error', () => {
      const summary = computeSummary([createFinding({ severity: 'warn' })]);
      const config = createAcvConfig({ failOn: 'error' });
      expect(computeExitCode(summary, config)).toBe(0);
    });

    it('should return 1 when warnings exist and failOn=warn', () => {
      const summary = computeSummary([createFinding({ severity: 'warn' })]);
      const config = createAcvConfig({ failOn: 'warn' });
      expect(computeExitCode(summary, config)).toBe(1);
    });

    it('should return 1 when errors exist and failOn=warn', () => {
      const summary = computeSummary([createFinding({ severity: 'error' })]);
      const config = createAcvConfig({ failOn: 'warn' });
      expect(computeExitCode(summary, config)).toBe(1);
    });

    it('should return 1 when info findings exist and failOn=info', () => {
      const summary = computeSummary([createFinding({ severity: 'info' })]);
      const config = createAcvConfig({ failOn: 'info' });
      expect(computeExitCode(summary, config)).toBe(1);
    });

    it('should return 0 when only info and failOn=warn', () => {
      const summary = computeSummary([createFinding({ severity: 'info' })]);
      const config = createAcvConfig({ failOn: 'warn' });
      expect(computeExitCode(summary, config)).toBe(0);
    });

    it('should return 1 when maxWarnings is exceeded', () => {
      const findings = [
        createFinding({ severity: 'warn' }),
        createFinding({ severity: 'warn' }),
        createFinding({ severity: 'warn' }),
      ];
      const summary = computeSummary(findings);
      const config = createAcvConfig({ failOn: 'error', maxWarnings: 2 });
      expect(computeExitCode(summary, config)).toBe(1);
    });

    it('should return 0 when warnings are within maxWarnings limit', () => {
      const findings = [
        createFinding({ severity: 'warn' }),
        createFinding({ severity: 'warn' }),
      ];
      const summary = computeSummary(findings);
      const config = createAcvConfig({ failOn: 'error', maxWarnings: 5 });
      expect(computeExitCode(summary, config)).toBe(0);
    });

    it('should ignore maxWarnings when set to -1 (unlimited)', () => {
      const findings = Array.from({ length: 100 }, () => createFinding({ severity: 'warn' }));
      const summary = computeSummary(findings);
      const config = createAcvConfig({ failOn: 'error', maxWarnings: -1 });
      expect(computeExitCode(summary, config)).toBe(0);
    });
  });

  describe('buildScanResult()', () => {
    it('should build a complete ScanResult', () => {
      const findings: Finding[] = [
        createFinding({ severity: 'error', category: 'security' }),
        createFinding({ severity: 'warn', category: 'ai-specific' }),
      ];
      const metrics = createScanMetrics({ files: 5, durationMs: 100 });
      const config = createAcvConfig({ failOn: 'error' });

      const result = buildScanResult(findings, metrics, config);

      expect(result.version).toBe('0.1.0');
      expect(result.timestamp).toBeDefined();
      expect(result.findings).toBe(findings);
      expect(result.scan).toBe(metrics);
      expect(result.summary.errors).toBe(1);
      expect(result.summary.warnings).toBe(1);
      expect(result.exitCode).toBe(1); // Has errors with failOn=error
    });

    it('should set exitCode to 0 when no threshold violations', () => {
      const findings: Finding[] = [
        createFinding({ severity: 'warn' }),
      ];
      const metrics = createScanMetrics();
      const config = createAcvConfig({ failOn: 'error' });

      const result = buildScanResult(findings, metrics, config);
      expect(result.exitCode).toBe(0);
    });

    it('should include config summary in result', () => {
      const config = createAcvConfig({
        failOn: 'warn',
        rules: { 'rule-a': 'error', 'rule-b': 'warn' },
        languages: ['typescript', 'python'],
      });
      const metrics = createScanMetrics();

      const result = buildScanResult([], metrics, config);
      expect(result.config.failOn).toBe('warn');
      expect(result.config.rules).toBe(2);
      expect(result.config.languages).toEqual(['typescript', 'python']);
    });

    it('should produce valid ISO 8601 timestamp', () => {
      const result = buildScanResult([], createScanMetrics(), createAcvConfig());
      const date = new Date(result.timestamp);
      expect(date.toISOString()).toBe(result.timestamp);
    });

    it('should handle empty findings', () => {
      const result = buildScanResult([], createScanMetrics(), createAcvConfig());
      expect(result.findings).toHaveLength(0);
      expect(result.summary.errors).toBe(0);
      expect(result.summary.warnings).toBe(0);
      expect(result.summary.info).toBe(0);
      expect(result.exitCode).toBe(0);
    });
  });
});
