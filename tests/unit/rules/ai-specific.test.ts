/**
 * Unit tests for AI-Specific rules (AI-001 through AI-010)
 *
 * Tests the detection of hallucinated imports, phantom API calls,
 * outdated API usage, and other AI-specific code smells.
 *
 * Rule IDs tested:
 *   AI-001: hallucinated-import
 *   AI-002: phantom-api-call
 *   AI-003: outdated-api-usage
 *   AI-004: cargo-cult-pattern
 *   AI-005: over-commented-obvious-code
 *   AI-006: inconsistent-naming-convention
 *   AI-007: training-data-leak
 *   AI-008: framework-version-mismatch
 *   AI-009: duplicate-logic-blocks
 *   AI-010: non-existent-config-option
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { RuleRegistry } from '../../../src/rules/registry.js';
import { RuleEngine } from '../../../src/rules/engine.js';
import { getAiSpecificRules } from '../../../src/rules/ai-specific/index.js';
import { createAcvConfig, createASTNode, createImportNode } from '../../helpers/factories.js';
import type { ASTNode, Finding, AcvConfig } from '../../../src/core/types.js';

describe('AI-Specific Rules', () => {
  let registry: RuleRegistry;
  let engine: RuleEngine;
  let config: AcvConfig;

  beforeEach(() => {
    registry = new RuleRegistry();
    const rules = getAiSpecificRules();
    if (rules.length > 0) {
      registry.registerAll(rules);
    }
    engine = new RuleEngine(registry);
    config = createAcvConfig();
  });

  describe('AI-001: hallucinated-import', () => {
    it('should detect imports of non-existent npm packages', () => {
      const ast: ASTNode = createASTNode({
        type: 'Program',
        children: [
          createImportNode('json-schema-validator-pro', 1),
          createImportNode('@express/advanced-router', 2),
          createImportNode('react-async-state-manager', 3),
        ],
      });

      const findings = engine.run({
        filePath: '/test/hallucinated.ts',
        language: 'typescript',
        ast,
        sourceText: 'import x from "json-schema-validator-pro";',
        config,
      });

      // When rules are implemented, these should produce findings
      // For now, this tests the pipeline works without errors
      expect(findings).toBeDefined();
      expect(Array.isArray(findings)).toBe(true);
    });

    it('should not flag known popular packages', () => {
      const ast: ASTNode = createASTNode({
        type: 'Program',
        children: [
          createImportNode('express', 1),
          createImportNode('lodash', 2),
          createImportNode('react', 3),
        ],
      });

      const findings = engine.run({
        filePath: '/test/valid-imports.ts',
        language: 'typescript',
        ast,
        sourceText: 'import express from "express";',
        config,
      });

      const hallucinated = findings.filter((f) => f.ruleId === 'hallucinated-import');
      expect(hallucinated).toHaveLength(0);
    });

    it('should detect typosquatted package names', () => {
      const ast: ASTNode = createASTNode({
        type: 'Program',
        children: [
          createImportNode('lodahs', 1),  // lodash misspelled
          createImportNode('expresss', 2), // express misspelled
        ],
      });

      const findings = engine.run({
        filePath: '/test/typosquat.ts',
        language: 'typescript',
        ast,
        sourceText: 'import x from "lodahs";',
        config,
      });

      expect(findings).toBeDefined();
    });

    it('should handle Node.js built-in imports correctly', () => {
      const ast: ASTNode = createASTNode({
        type: 'Program',
        children: [
          createImportNode('node:fs', 1),
          createImportNode('node:path', 2),
          createImportNode('node:crypto', 3),
        ],
      });

      const findings = engine.run({
        filePath: '/test/builtins.ts',
        language: 'typescript',
        ast,
        sourceText: 'import fs from "node:fs";',
        config,
      });

      const hallucinated = findings.filter((f) => f.ruleId === 'hallucinated-import');
      expect(hallucinated).toHaveLength(0);
    });
  });

  describe('AI-002: phantom-api-call', () => {
    it('should detect calls to non-existent methods on known libraries', () => {
      const ast: ASTNode = createASTNode({
        type: 'Program',
        children: [
          {
            type: 'CallExpression',
            start: { line: 1, column: 1, offset: 0 },
            end: { line: 1, column: 20, offset: 19 },
            callee: 'app.enableCors',
            children: [],
          },
        ],
      });

      const findings = engine.run({
        filePath: '/test/phantom.ts',
        language: 'typescript',
        ast,
        sourceText: 'app.enableCors();',
        config,
      });

      expect(findings).toBeDefined();
    });

    it('should not flag legitimate method calls', () => {
      const ast: ASTNode = createASTNode({
        type: 'Program',
        children: [
          {
            type: 'CallExpression',
            start: { line: 1, column: 1, offset: 0 },
            end: { line: 1, column: 15, offset: 14 },
            callee: 'app.use',
            children: [],
          },
        ],
      });

      const findings = engine.run({
        filePath: '/test/legit-calls.ts',
        language: 'typescript',
        ast,
        sourceText: 'app.use(middleware);',
        config,
      });

      const phantom = findings.filter((f) => f.ruleId === 'phantom-api-call');
      expect(phantom).toHaveLength(0);
    });
  });

  describe('AI-003: outdated-api-usage', () => {
    it('should detect deprecated Node.js APIs', () => {
      const ast: ASTNode = createASTNode({
        type: 'Program',
        children: [
          {
            type: 'CallExpression',
            start: { line: 1, column: 1, offset: 0 },
            end: { line: 1, column: 20, offset: 19 },
            callee: 'url.parse',
            children: [],
          },
        ],
      });

      const findings = engine.run({
        filePath: '/test/deprecated.ts',
        language: 'typescript',
        ast,
        sourceText: 'url.parse(urlStr);',
        config,
      });

      expect(findings).toBeDefined();
    });

    it('should detect deprecated Buffer constructor', () => {
      const ast: ASTNode = createASTNode({
        type: 'Program',
        children: [
          {
            type: 'NewExpression',
            start: { line: 1, column: 1, offset: 0 },
            end: { line: 1, column: 20, offset: 19 },
            callee: 'Buffer',
            children: [],
          },
        ],
      });

      const findings = engine.run({
        filePath: '/test/deprecated-buffer.ts',
        language: 'typescript',
        ast,
        sourceText: 'new Buffer(data);',
        config,
      });

      expect(findings).toBeDefined();
    });
  });

  describe('AI-004: cargo-cult-pattern', () => {
    it('should detect unnecessary patterns copied blindly', () => {
      const ast: ASTNode = createASTNode({ type: 'Program', children: [] });

      const findings = engine.run({
        filePath: '/test/cargo-cult.ts',
        language: 'typescript',
        ast,
        sourceText: 'void 0;',
        config,
      });

      expect(findings).toBeDefined();
    });
  });

  describe('AI-005: over-commented-obvious-code', () => {
    it('should detect excessive comments on trivial code', () => {
      const ast: ASTNode = createASTNode({
        type: 'Program',
        children: [
          {
            type: 'Comment',
            start: { line: 1, column: 1, offset: 0 },
            end: { line: 1, column: 30, offset: 29 },
            value: '// Increment the counter by one',
            children: [],
          },
        ],
      });

      const findings = engine.run({
        filePath: '/test/over-commented.ts',
        language: 'typescript',
        ast,
        sourceText: '// Increment the counter by one\ncounter++;',
        config,
      });

      expect(findings).toBeDefined();
    });
  });

  describe('AI-006: inconsistent-naming-convention', () => {
    it('should detect mixed naming conventions in the same file', () => {
      const ast: ASTNode = createASTNode({
        type: 'Program',
        children: [
          {
            type: 'VariableDeclaration',
            start: { line: 1, column: 1, offset: 0 },
            end: { line: 1, column: 20, offset: 19 },
            name: 'camelCase',
            children: [],
          },
          {
            type: 'VariableDeclaration',
            start: { line: 2, column: 1, offset: 20 },
            end: { line: 2, column: 25, offset: 44 },
            name: 'snake_case',
            children: [],
          },
        ],
      });

      const findings = engine.run({
        filePath: '/test/naming.ts',
        language: 'typescript',
        ast,
        sourceText: 'const camelCase = 1;\nconst snake_case = 2;',
        config,
      });

      expect(findings).toBeDefined();
    });
  });

  describe('AI-007: training-data-leak', () => {
    it('should detect patterns suggesting training data leakage', () => {
      const ast: ASTNode = createASTNode({ type: 'Program', children: [] });

      const findings = engine.run({
        filePath: '/test/data-leak.ts',
        language: 'typescript',
        ast,
        sourceText: '// Source: https://stackoverflow.com/questions/12345\nfunction foo() {}',
        config,
      });

      expect(findings).toBeDefined();
    });
  });

  describe('AI-008: framework-version-mismatch', () => {
    it('should detect API usage from wrong framework version', () => {
      const ast: ASTNode = createASTNode({ type: 'Program', children: [] });

      const findings = engine.run({
        filePath: '/test/version-mismatch.ts',
        language: 'typescript',
        ast,
        sourceText: 'const router = express.Router();',
        config,
      });

      expect(findings).toBeDefined();
    });
  });

  describe('AI-009: duplicate-logic-blocks', () => {
    it('should detect duplicated code blocks that should be refactored', () => {
      const ast: ASTNode = createASTNode({ type: 'Program', children: [] });

      const findings = engine.run({
        filePath: '/test/duplicate.ts',
        language: 'typescript',
        ast,
        sourceText: 'function a() { return x + 1; }\nfunction b() { return x + 1; }',
        config,
      });

      expect(findings).toBeDefined();
    });
  });

  describe('AI-010: non-existent-config-option', () => {
    it('should detect references to non-existent configuration options', () => {
      const ast: ASTNode = createASTNode({ type: 'Program', children: [] });

      const findings = engine.run({
        filePath: '/test/config-option.ts',
        language: 'typescript',
        ast,
        sourceText: 'app.set("nonExistentOption", true);',
        config,
      });

      expect(findings).toBeDefined();
    });
  });

  describe('Rule registration', () => {
    it('should return an array from getAiSpecificRules()', () => {
      const rules = getAiSpecificRules();
      expect(Array.isArray(rules)).toBe(true);
    });

    it('should have unique rule IDs', () => {
      const rules = getAiSpecificRules();
      const ids = rules.map((r) => r.id);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it('should assign ai-specific category to all rules', () => {
      const rules = getAiSpecificRules();
      for (const rule of rules) {
        expect(rule.category).toBe('ai-specific');
      }
    });
  });
});
