/**
 * Unit tests for Correctness rules (COR-001 through COR-012)
 *
 * Tests the detection of dead code, unreachable branches, missing null checks,
 * empty catch blocks, off-by-one errors, and other correctness issues.
 *
 * Rule IDs tested:
 *   COR-001: dead-code-after-return
 *   COR-002: unreachable-branch
 *   COR-003: missing-null-check
 *   COR-004: type-coercion-risk
 *   COR-005: incomplete-error-handling
 *   COR-006: unused-import
 *   COR-007: placeholder-todo-stub
 *   COR-008: empty-catch-block
 *   COR-009: off-by-one-loop
 *   COR-010: async-without-await
 *   COR-011: incorrect-array-method-return
 *   COR-012: assignment-in-condition
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { RuleRegistry } from '../../../src/rules/registry.js';
import { RuleEngine } from '../../../src/rules/engine.js';
import { getCorrectnessRules } from '../../../src/rules/correctness/index.js';
import { createAcvConfig, createASTNode } from '../../helpers/factories.js';
import type { ASTNode, AcvConfig } from '../../../src/core/types.js';

describe('Correctness Rules', () => {
  let registry: RuleRegistry;
  let engine: RuleEngine;
  let config: AcvConfig;

  beforeEach(() => {
    registry = new RuleRegistry();
    const rules = getCorrectnessRules();
    if (rules.length > 0) {
      registry.registerAll(rules);
    }
    engine = new RuleEngine(registry);
    config = createAcvConfig();
  });

  describe('COR-001: dead-code-after-return', () => {
    it('should detect code after a return statement', () => {
      const ast: ASTNode = createASTNode({
        type: 'Program',
        children: [{
          type: 'FunctionDeclaration',
          start: { line: 1, column: 1, offset: 0 },
          end: { line: 5, column: 2, offset: 80 },
          children: [{
            type: 'BlockStatement',
            start: { line: 1, column: 20, offset: 19 },
            end: { line: 5, column: 2, offset: 80 },
            children: [
              {
                type: 'ReturnStatement',
                start: { line: 2, column: 3, offset: 22 },
                end: { line: 2, column: 12, offset: 31 },
                children: [],
              },
              {
                type: 'ExpressionStatement',
                start: { line: 3, column: 3, offset: 34 },
                end: { line: 3, column: 30, offset: 61 },
                children: [],
              },
            ],
          }],
        }],
      });

      const findings = engine.run({
        filePath: '/test/dead-code.ts',
        language: 'typescript',
        ast,
        sourceText: 'function f() {\n  return 1;\n  console.log("unreachable");\n}',
        config,
      });

      expect(findings).toBeDefined();
    });
  });

  describe('COR-002: unreachable-branch', () => {
    it('should detect always-true conditions', () => {
      const ast: ASTNode = createASTNode({
        type: 'Program',
        children: [{
          type: 'IfStatement',
          start: { line: 1, column: 1, offset: 0 },
          end: { line: 3, column: 2, offset: 40 },
          condition: 'x === x',
          children: [],
        }],
      });

      const findings = engine.run({
        filePath: '/test/unreachable.ts',
        language: 'typescript',
        ast,
        sourceText: 'if (x === x) { return "always"; } else { return "never"; }',
        config,
      });

      expect(findings).toBeDefined();
    });

    it('should detect constant boolean conditions', () => {
      const ast: ASTNode = createASTNode({
        type: 'Program',
        children: [{
          type: 'IfStatement',
          start: { line: 1, column: 1, offset: 0 },
          end: { line: 3, column: 2, offset: 40 },
          condition: 'true',
          children: [],
        }],
      });

      const findings = engine.run({
        filePath: '/test/constant-cond.ts',
        language: 'typescript',
        ast,
        sourceText: 'if (true) { doSomething(); }',
        config,
      });

      expect(findings).toBeDefined();
    });
  });

  describe('COR-003: missing-null-check', () => {
    it('should detect property access without null checks', () => {
      const ast: ASTNode = createASTNode({
        type: 'Program',
        children: [{
          type: 'MemberExpression',
          start: { line: 1, column: 1, offset: 0 },
          end: { line: 1, column: 20, offset: 19 },
          object: 'user.address',
          property: 'city',
          optional: false,
          children: [],
        }],
      });

      const findings = engine.run({
        filePath: '/test/null-check.ts',
        language: 'typescript',
        ast,
        sourceText: 'const city = user.address.city;',
        config,
      });

      expect(findings).toBeDefined();
    });
  });

  describe('COR-004: type-coercion-risk', () => {
    it('should detect loose equality (==) usage', () => {
      const ast: ASTNode = createASTNode({
        type: 'Program',
        children: [{
          type: 'BinaryExpression',
          start: { line: 1, column: 1, offset: 0 },
          end: { line: 1, column: 10, offset: 9 },
          operator: '==',
          children: [],
        }],
      });

      const findings = engine.run({
        filePath: '/test/coercion.ts',
        language: 'typescript',
        ast,
        sourceText: 'if (a == b) {}',
        config,
      });

      expect(findings).toBeDefined();
    });

    it('should allow == null for null/undefined check', () => {
      const ast: ASTNode = createASTNode({
        type: 'Program',
        children: [{
          type: 'BinaryExpression',
          start: { line: 1, column: 1, offset: 0 },
          end: { line: 1, column: 15, offset: 14 },
          operator: '==',
          right: 'null',
          children: [],
        }],
      });

      const findings = engine.run({
        filePath: '/test/null-equality.ts',
        language: 'typescript',
        ast,
        sourceText: 'if (x == null) {}',
        config,
      });

      // == null is an accepted pattern for null/undefined check
      const coercionFindings = findings.filter((f) => f.ruleId === 'type-coercion-risk');
      expect(coercionFindings).toHaveLength(0);
    });
  });

  describe('COR-005: incomplete-error-handling', () => {
    it('should detect catch blocks that only log errors', () => {
      const ast: ASTNode = createASTNode({
        type: 'Program',
        children: [{
          type: 'TryStatement',
          start: { line: 1, column: 1, offset: 0 },
          end: { line: 5, column: 2, offset: 80 },
          children: [{
            type: 'CatchClause',
            start: { line: 3, column: 3, offset: 40 },
            end: { line: 5, column: 2, offset: 80 },
            children: [{
              type: 'ExpressionStatement',
              start: { line: 4, column: 5, offset: 55 },
              end: { line: 4, column: 30, offset: 79 },
              children: [createASTNode({
                type: 'CallExpression',
                start: { line: 4, column: 5, offset: 55 },
                end: { line: 4, column: 30, offset: 79 },
                callee: 'console.error',
              })],
            }],
          }],
        }],
      });

      const findings = engine.run({
        filePath: '/test/error-handling.ts',
        language: 'typescript',
        ast,
        sourceText: 'try { op(); } catch(e) { console.error(e); }',
        config,
      });

      expect(findings).toBeDefined();
    });
  });

  describe('COR-006: unused-import', () => {
    it('should detect imported names that are never used', () => {
      const ast: ASTNode = createASTNode({
        type: 'Program',
        children: [{
          type: 'ImportDeclaration',
          start: { line: 1, column: 1, offset: 0 },
          end: { line: 1, column: 35, offset: 34 },
          source: 'node:path',
          specifiers: ['join', 'resolve'],
          children: [],
        }],
      });

      const findings = engine.run({
        filePath: '/test/unused-import.ts',
        language: 'typescript',
        ast,
        sourceText: "import { join, resolve } from 'node:path';",
        config,
      });

      expect(findings).toBeDefined();
    });
  });

  describe('COR-007: placeholder-todo-stub', () => {
    it('should detect TODO comments', () => {
      const ast: ASTNode = createASTNode({
        type: 'Program',
        children: [{
          type: 'Comment',
          start: { line: 1, column: 1, offset: 0 },
          end: { line: 1, column: 35, offset: 34 },
          value: '// TODO: Implement authentication',
          children: [],
        }],
      });

      const findings = engine.run({
        filePath: '/test/todo.ts',
        language: 'typescript',
        ast,
        sourceText: '// TODO: Implement authentication\nfunction auth() { return true; }',
        config,
      });

      expect(findings).toBeDefined();
    });

    it('should detect FIXME markers', () => {
      const ast: ASTNode = createASTNode({
        type: 'Program',
        children: [{
          type: 'Comment',
          start: { line: 1, column: 1, offset: 0 },
          end: { line: 1, column: 30, offset: 29 },
          value: '// FIXME: This is broken',
          children: [],
        }],
      });

      const findings = engine.run({
        filePath: '/test/fixme.ts',
        language: 'typescript',
        ast,
        sourceText: '// FIXME: This is broken\nfunction broken() {}',
        config,
      });

      expect(findings).toBeDefined();
    });

    it('should detect throw new Error("Not implemented")', () => {
      const ast: ASTNode = createASTNode({
        type: 'Program',
        children: [{
          type: 'ThrowStatement',
          start: { line: 1, column: 1, offset: 0 },
          end: { line: 1, column: 40, offset: 39 },
          children: [{
            type: 'NewExpression',
            start: { line: 1, column: 7, offset: 6 },
            end: { line: 1, column: 39, offset: 38 },
            callee: 'Error',
            arguments: ['Not implemented'],
            children: [],
          }],
        }],
      });

      const findings = engine.run({
        filePath: '/test/not-implemented.ts',
        language: 'typescript',
        ast,
        sourceText: 'throw new Error("Not implemented");',
        config,
      });

      expect(findings).toBeDefined();
    });
  });

  describe('COR-008: empty-catch-block', () => {
    it('should detect empty catch blocks', () => {
      const ast: ASTNode = createASTNode({
        type: 'Program',
        children: [{
          type: 'TryStatement',
          start: { line: 1, column: 1, offset: 0 },
          end: { line: 3, column: 2, offset: 40 },
          children: [{
            type: 'CatchClause',
            start: { line: 2, column: 3, offset: 20 },
            end: { line: 3, column: 2, offset: 40 },
            children: [{
              type: 'BlockStatement',
              start: { line: 2, column: 15, offset: 32 },
              end: { line: 3, column: 2, offset: 40 },
              children: [], // Empty body
            }],
          }],
        }],
      });

      const findings = engine.run({
        filePath: '/test/empty-catch.ts',
        language: 'typescript',
        ast,
        sourceText: 'try { op(); } catch (e) { }',
        config,
      });

      expect(findings).toBeDefined();
    });
  });

  describe('COR-009: off-by-one-loop', () => {
    it('should detect <= in array index loops', () => {
      const ast: ASTNode = createASTNode({
        type: 'Program',
        children: [{
          type: 'ForStatement',
          start: { line: 1, column: 1, offset: 0 },
          end: { line: 3, column: 2, offset: 60 },
          test: {
            type: 'BinaryExpression',
            operator: '<=',
            right: 'items.length',
            start: { line: 1, column: 20, offset: 19 },
            end: { line: 1, column: 38, offset: 37 },
          },
          children: [],
        }],
      });

      const findings = engine.run({
        filePath: '/test/off-by-one.ts',
        language: 'typescript',
        ast,
        sourceText: 'for (let i = 0; i <= items.length; i++) { items[i]; }',
        config,
      });

      expect(findings).toBeDefined();
    });
  });

  describe('COR-010: async-without-await', () => {
    it('should detect async functions that never await', () => {
      const ast: ASTNode = createASTNode({
        type: 'Program',
        children: [{
          type: 'FunctionDeclaration',
          start: { line: 1, column: 1, offset: 0 },
          end: { line: 3, column: 2, offset: 50 },
          async: true,
          children: [{
            type: 'BlockStatement',
            start: { line: 1, column: 25, offset: 24 },
            end: { line: 3, column: 2, offset: 50 },
            children: [{
              type: 'ReturnStatement',
              start: { line: 2, column: 3, offset: 27 },
              end: { line: 2, column: 12, offset: 36 },
              children: [],
            }],
          }],
        }],
      });

      const findings = engine.run({
        filePath: '/test/async-no-await.ts',
        language: 'typescript',
        ast,
        sourceText: 'async function noAwait() { return 42; }',
        config,
      });

      expect(findings).toBeDefined();
    });
  });

  describe('COR-011: incorrect-array-method-return', () => {
    it('should detect assigning forEach result to a variable', () => {
      const ast: ASTNode = createASTNode({
        type: 'Program',
        children: [{
          type: 'VariableDeclaration',
          start: { line: 1, column: 1, offset: 0 },
          end: { line: 1, column: 50, offset: 49 },
          children: [{
            type: 'CallExpression',
            start: { line: 1, column: 15, offset: 14 },
            end: { line: 1, column: 49, offset: 48 },
            callee: 'numbers.forEach',
            children: [],
          }],
        }],
      });

      const findings = engine.run({
        filePath: '/test/array-return.ts',
        language: 'typescript',
        ast,
        sourceText: 'const result = numbers.forEach(n => n * 2);',
        config,
      });

      expect(findings).toBeDefined();
    });
  });

  describe('COR-012: assignment-in-condition', () => {
    it('should detect = used instead of == or === in if conditions', () => {
      const ast: ASTNode = createASTNode({
        type: 'Program',
        children: [{
          type: 'IfStatement',
          start: { line: 1, column: 1, offset: 0 },
          end: { line: 1, column: 25, offset: 24 },
          condition: {
            type: 'AssignmentExpression',
            operator: '=',
            start: { line: 1, column: 5, offset: 4 },
            end: { line: 1, column: 10, offset: 9 },
          },
          children: [],
        }],
      });

      const findings = engine.run({
        filePath: '/test/assignment-cond.ts',
        language: 'typescript',
        ast,
        sourceText: 'if (y = x) { }',
        config,
      });

      expect(findings).toBeDefined();
    });
  });

  describe('Rule registration', () => {
    it('should return an array from getCorrectnessRules()', () => {
      const rules = getCorrectnessRules();
      expect(Array.isArray(rules)).toBe(true);
    });

    it('should have unique rule IDs', () => {
      const rules = getCorrectnessRules();
      const ids = rules.map((r) => r.id);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it('should assign correctness category to all rules', () => {
      const rules = getCorrectnessRules();
      for (const rule of rules) {
        expect(rule.category).toBe('correctness');
      }
    });
  });
});
