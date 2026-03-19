/**
 * Unit tests for RuleRegistry
 *
 * Tests rule registration, lookup, filtering by language/category/config,
 * and effective severity resolution.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { RuleRegistry } from '../../../src/rules/registry.js';
import { createRule, createAcvConfig } from '../../helpers/factories.js';
import type { Rule, AcvConfig } from '../../../src/core/types.js';

describe('RuleRegistry', () => {
  let registry: RuleRegistry;

  beforeEach(() => {
    registry = new RuleRegistry();
  });

  describe('register()', () => {
    it('should register a single rule', () => {
      const rule = createRule({ id: 'test-001' });
      registry.register(rule);
      expect(registry.size).toBe(1);
    });

    it('should throw on duplicate rule IDs', () => {
      const rule = createRule({ id: 'test-001' });
      registry.register(rule);
      expect(() => registry.register(rule)).toThrow('Duplicate rule ID: "test-001"');
    });

    it('should allow registering rules with different IDs', () => {
      registry.register(createRule({ id: 'rule-a' }));
      registry.register(createRule({ id: 'rule-b' }));
      registry.register(createRule({ id: 'rule-c' }));
      expect(registry.size).toBe(3);
    });
  });

  describe('registerAll()', () => {
    it('should register multiple rules at once', () => {
      const rules = [
        createRule({ id: 'rule-1' }),
        createRule({ id: 'rule-2' }),
        createRule({ id: 'rule-3' }),
      ];
      registry.registerAll(rules);
      expect(registry.size).toBe(3);
    });

    it('should throw if any rule has a duplicate ID', () => {
      const rules = [
        createRule({ id: 'rule-1' }),
        createRule({ id: 'rule-1' }), // duplicate
      ];
      expect(() => registry.registerAll(rules)).toThrow('Duplicate rule ID');
    });

    it('should handle empty array', () => {
      registry.registerAll([]);
      expect(registry.size).toBe(0);
    });
  });

  describe('get()', () => {
    it('should return a registered rule by ID', () => {
      const rule = createRule({ id: 'my-rule', name: 'My Rule' });
      registry.register(rule);
      expect(registry.get('my-rule')).toBe(rule);
    });

    it('should return undefined for unregistered ID', () => {
      expect(registry.get('non-existent')).toBeUndefined();
    });
  });

  describe('getAll()', () => {
    it('should return all registered rules', () => {
      registry.register(createRule({ id: 'a' }));
      registry.register(createRule({ id: 'b' }));
      const all = registry.getAll();
      expect(all).toHaveLength(2);
    });

    it('should return empty array when no rules registered', () => {
      expect(registry.getAll()).toHaveLength(0);
    });

    it('should return a copy (not internal state)', () => {
      registry.register(createRule({ id: 'a' }));
      const all1 = registry.getAll();
      const all2 = registry.getAll();
      expect(all1).not.toBe(all2); // Different array instances
      expect(all1).toEqual(all2);  // Same contents
    });
  });

  describe('getForLanguage()', () => {
    it('should return only rules for the specified language', () => {
      registry.register(createRule({ id: 'ts-rule', languages: ['typescript'] }));
      registry.register(createRule({ id: 'py-rule', languages: ['python'] }));
      registry.register(createRule({ id: 'both', languages: ['typescript', 'python'] }));

      const tsRules = registry.getForLanguage('typescript');
      expect(tsRules).toHaveLength(2);
      expect(tsRules.map((r) => r.id)).toContain('ts-rule');
      expect(tsRules.map((r) => r.id)).toContain('both');
    });

    it('should return empty for language with no rules', () => {
      registry.register(createRule({ id: 'ts-only', languages: ['typescript'] }));
      expect(registry.getForLanguage('rust')).toHaveLength(0);
    });
  });

  describe('getByCategory()', () => {
    it('should return only rules in the specified category', () => {
      registry.register(createRule({ id: 'sec-1', category: 'security' }));
      registry.register(createRule({ id: 'sec-2', category: 'security' }));
      registry.register(createRule({ id: 'ai-1', category: 'ai-specific' }));
      registry.register(createRule({ id: 'cor-1', category: 'correctness' }));

      const secRules = registry.getByCategory('security');
      expect(secRules).toHaveLength(2);
      expect(secRules.every((r) => r.category === 'security')).toBe(true);
    });

    it('should return empty for category with no rules', () => {
      registry.register(createRule({ id: 'sec-1', category: 'security' }));
      expect(registry.getByCategory('correctness')).toHaveLength(0);
    });
  });

  describe('getEnabled()', () => {
    it('should filter out rules from disabled categories', () => {
      registry.register(createRule({ id: 'sec-1', category: 'security' }));
      registry.register(createRule({ id: 'ai-1', category: 'ai-specific' }));

      const config = createAcvConfig({
        categories: {
          'ai-specific': false, // disabled
          security: true,
          correctness: true,
        },
      });

      const enabled = registry.getEnabled(config);
      expect(enabled).toHaveLength(1);
      expect(enabled[0]!.id).toBe('sec-1');
    });

    it('should filter out rules with severity set to off', () => {
      registry.register(createRule({ id: 'rule-a' }));
      registry.register(createRule({ id: 'rule-b' }));

      const config = createAcvConfig({
        rules: { 'rule-a': 'off' },
      });

      const enabled = registry.getEnabled(config);
      expect(enabled).toHaveLength(1);
      expect(enabled[0]!.id).toBe('rule-b');
    });

    it('should return all rules when everything is enabled', () => {
      registry.register(createRule({ id: 'r1', category: 'security' }));
      registry.register(createRule({ id: 'r2', category: 'ai-specific' }));
      registry.register(createRule({ id: 'r3', category: 'correctness' }));

      const config = createAcvConfig();
      expect(registry.getEnabled(config)).toHaveLength(3);
    });
  });

  describe('getEffectiveSeverity()', () => {
    it('should return default severity when no override', () => {
      const rule = createRule({ id: 'test', defaultSeverity: 'warn' });
      registry.register(rule);

      const config = createAcvConfig();
      expect(registry.getEffectiveSeverity(rule, config)).toBe('warn');
    });

    it('should return overridden severity from config', () => {
      const rule = createRule({ id: 'test', defaultSeverity: 'warn' });
      registry.register(rule);

      const config = createAcvConfig({
        rules: { test: 'error' },
      });
      expect(registry.getEffectiveSeverity(rule, config)).toBe('error');
    });

    it('should return off when rule is disabled via config', () => {
      const rule = createRule({ id: 'test', defaultSeverity: 'error' });
      registry.register(rule);

      const config = createAcvConfig({
        rules: { test: 'off' },
      });
      expect(registry.getEffectiveSeverity(rule, config)).toBe('off');
    });
  });

  describe('size', () => {
    it('should return 0 for empty registry', () => {
      expect(registry.size).toBe(0);
    });

    it('should track count accurately after multiple registrations', () => {
      registry.register(createRule({ id: 'a' }));
      expect(registry.size).toBe(1);
      registry.register(createRule({ id: 'b' }));
      expect(registry.size).toBe(2);
    });
  });
});
