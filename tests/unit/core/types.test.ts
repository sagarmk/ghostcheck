/**
 * Unit tests for core type helpers
 *
 * Tests defineConfig(), definePlugin(), defineRule() helper functions.
 */

import { describe, it, expect } from 'vitest';
import { defineConfig, definePlugin, defineRule } from '../../../src/core/types.js';
import type { AcvConfig, PluginInterface, Rule } from '../../../src/core/types.js';

describe('Type Helpers', () => {
  describe('defineConfig()', () => {
    it('should return the config object unchanged', () => {
      const config: Partial<AcvConfig> = {
        failOn: 'error',
        rules: { 'hallucinated-import': 'error' },
      };
      expect(defineConfig(config)).toBe(config);
    });

    it('should accept empty config', () => {
      expect(defineConfig({})).toEqual({});
    });

    it('should accept full config', () => {
      const config: Partial<AcvConfig> = {
        rules: { 'rule-a': 'error' },
        categories: { 'ai-specific': true, security: true, correctness: false },
        languages: ['typescript'],
        ignore: ['vendor/**'],
        failOn: 'warn',
        maxWarnings: 10,
        cache: true,
        maxWorkers: 4,
        maxFileSize: '2mb',
        parseTimeout: 3000,
        format: 'json',
        hooks: {},
      };
      const result = defineConfig(config);
      expect(result).toBe(config);
      expect(result.failOn).toBe('warn');
    });
  });

  describe('definePlugin()', () => {
    it('should return the plugin object unchanged', () => {
      const plugin: PluginInterface = {
        name: 'test-plugin',
        version: '1.0.0',
        rules: [],
      };
      expect(definePlugin(plugin)).toBe(plugin);
    });

    it('should accept plugin with all fields', () => {
      const plugin: PluginInterface = {
        name: 'full-plugin',
        version: '2.0.0',
        rules: [],
        languages: [],
        reporters: [],
        hooks: {
          beforeScan: () => {},
          afterScan: () => {},
        },
      };
      expect(definePlugin(plugin)).toBe(plugin);
    });
  });

  describe('defineRule()', () => {
    it('should return the rule object unchanged', () => {
      const rule: Rule = {
        id: 'test-rule',
        name: 'Test Rule',
        category: 'security',
        defaultSeverity: 'error',
        languages: ['typescript'],
        meta: {
          description: 'A test rule',
          fixable: false,
        },
        create: () => ({}),
      };
      expect(defineRule(rule)).toBe(rule);
    });

    it('should preserve rule create function', () => {
      const createFn = () => ({ ImportDeclaration: () => {} });
      const rule: Rule = {
        id: 'func-rule',
        name: 'Func Rule',
        category: 'ai-specific',
        defaultSeverity: 'warn',
        languages: ['javascript', 'typescript'],
        meta: { description: 'Test', fixable: true },
        create: createFn,
      };

      const result = defineRule(rule);
      expect(result.create).toBe(createFn);
    });
  });
});
