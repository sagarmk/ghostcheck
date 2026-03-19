/**
 * Unit tests for OutputEngine
 *
 * Tests formatter routing, auto-detection, custom formatter registration,
 * and error handling for unknown formats.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { OutputEngine } from '../../../src/output/engine.js';
import { createScanResult } from '../../helpers/factories.js';

describe('OutputEngine', () => {
  let outputEngine: OutputEngine;

  beforeEach(() => {
    outputEngine = new OutputEngine();
  });

  describe('format()', () => {
    it('should format with pretty formatter', () => {
      const result = createScanResult();
      const output = outputEngine.format(result, 'pretty');
      expect(output).toBeDefined();
      expect(typeof output).toBe('string');
      expect(output.length).toBeGreaterThan(0);
    });

    it('should format with json formatter', () => {
      const result = createScanResult();
      const output = outputEngine.format(result, 'json');
      expect(output).toBeDefined();

      // Should be valid JSON
      const parsed = JSON.parse(output);
      expect(parsed.version).toBe('0.1.0');
    });

    it('should format with sarif formatter', () => {
      const result = createScanResult();
      const output = outputEngine.format(result, 'sarif');
      expect(output).toBeDefined();

      // Should be valid SARIF JSON
      const parsed = JSON.parse(output);
      expect(parsed.version).toBe('2.1.0');
      expect(parsed.$schema).toContain('sarif');
    });

    it('should throw for unknown format', () => {
      const result = createScanResult();
      expect(() => outputEngine.format(result, 'xml' as any)).toThrow(
        /Unknown output format.*xml/,
      );
    });

    it('should include available formats in error message', () => {
      const result = createScanResult();
      try {
        outputEngine.format(result, 'csv' as any);
      } catch (e) {
        expect((e as Error).message).toContain('pretty');
        expect((e as Error).message).toContain('json');
        expect((e as Error).message).toContain('sarif');
      }
    });
  });

  describe('registerFormatter()', () => {
    it('should use custom formatter when registered', () => {
      const customFormatter = {
        format: vi.fn().mockReturnValue('custom output'),
      };

      outputEngine.registerFormatter('custom', customFormatter);
      const result = createScanResult();
      const output = outputEngine.format(result, 'custom' as any);

      expect(output).toBe('custom output');
      expect(customFormatter.format).toHaveBeenCalledWith(result);
    });

    it('should prioritize custom formatter over built-in', () => {
      const customJson = {
        format: vi.fn().mockReturnValue('{"custom": true}'),
      };

      outputEngine.registerFormatter('json', customJson);
      const result = createScanResult();
      const output = outputEngine.format(result, 'json');

      expect(output).toBe('{"custom": true}');
    });
  });

  describe('autoDetectFormat()', () => {
    it('should return a valid output format', () => {
      const format = outputEngine.autoDetectFormat();
      expect(['pretty', 'json', 'sarif', 'junit', 'github']).toContain(format);
    });
  });
});
