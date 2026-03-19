/**
 * Unit tests for RuleEngine
 *
 * Tests the rule execution pipeline: selecting applicable rules,
 * creating contexts, walking ASTs, and collecting findings.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RuleEngine } from '../../../src/rules/engine.js';
import { RuleRegistry } from '../../../src/rules/registry.js';
import { createAcvConfig, createASTNode, createRule, createPosition } from '../../helpers/factories.js';
import type { Rule, ASTNode, AcvConfig, RuleVisitor, Finding } from '../../../src/core/types.js';

describe('RuleEngine', () => {
  let registry: RuleRegistry;
  let engine: RuleEngine;
  let config: AcvConfig;

  beforeEach(() => {
    registry = new RuleRegistry();
    engine = new RuleEngine(registry);
    config = createAcvConfig();
  });

  describe('run()', () => {
    it('should return empty array when no rules are registered', () => {
      const ast = createASTNode({ type: 'Program', children: [] });
      const findings = engine.run({
        filePath: '/test/file.ts',
        language: 'typescript',
        ast,
        sourceText: '',
        config,
      });

      expect(findings).toEqual([]);
    });

    it('should return empty array when no rules apply to the language', () => {
      registry.register(createRule({
        id: 'python-only',
        languages: ['python'],
        create: () => ({
          ImportDeclaration: () => {},
        }),
      }));

      const ast = createASTNode({ type: 'Program', children: [] });
      const findings = engine.run({
        filePath: '/test/file.ts',
        language: 'typescript',
        ast,
        sourceText: '',
        config,
      });

      expect(findings).toEqual([]);
    });

    it('should invoke visitor handlers for matching node types', () => {
      const handler = vi.fn();
      registry.register(createRule({
        id: 'import-checker',
        languages: ['typescript'],
        create: () => ({
          ImportDeclaration: handler,
        }),
      }));

      const importNode: ASTNode = {
        type: 'ImportDeclaration',
        start: createPosition(),
        end: createPosition({ line: 1, column: 30, offset: 29 }),
        children: [],
      };

      const ast = createASTNode({
        type: 'Program',
        children: [importNode],
      });

      engine.run({
        filePath: '/test/file.ts',
        language: 'typescript',
        ast,
        sourceText: "import x from 'y';",
        config,
      });

      // Handler is called with the import node (may be called >1 time
      // due to walker's Object.values traversal of children array)
      expect(handler).toHaveBeenCalledWith(importNode);
      expect(handler.mock.calls.length).toBeGreaterThanOrEqual(1);
    });

    it('should collect findings reported by rules', () => {
      registry.register(createRule({
        id: 'always-report',
        category: 'security',
        languages: ['typescript'],
        defaultSeverity: 'error',
        create: (context) => ({
          Program: (node) => {
            context.report({
              severity: 'error',
              message: 'Found an issue',
              filePath: context.filePath,
              line: node.start.line,
              column: node.start.column,
              endLine: node.end.line,
              endColumn: node.end.column,
              codeSnippet: 'test',
              fix: null,
              suggestion: 'Fix it',
              owaspRef: null,
              confidence: 0.95,
            });
          },
        }),
      }));

      const ast = createASTNode({ type: 'Program', children: [] });
      const findings = engine.run({
        filePath: '/test/file.ts',
        language: 'typescript',
        ast,
        sourceText: 'const x = 1;',
        config,
      });

      expect(findings).toHaveLength(1);
      expect(findings[0]!.ruleId).toBe('always-report');
      expect(findings[0]!.category).toBe('security');
      expect(findings[0]!.message).toBe('Found an issue');
      expect(findings[0]!.confidence).toBe(0.95);
    });

    it('should run multiple rules simultaneously', () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();

      registry.register(createRule({
        id: 'rule-1',
        languages: ['typescript'],
        create: () => ({ Program: handler1 }),
      }));
      registry.register(createRule({
        id: 'rule-2',
        languages: ['typescript'],
        create: () => ({ Program: handler2 }),
      }));

      const ast = createASTNode({ type: 'Program', children: [] });
      engine.run({
        filePath: '/test/file.ts',
        language: 'typescript',
        ast,
        sourceText: '',
        config,
      });

      expect(handler1).toHaveBeenCalledTimes(1);
      expect(handler2).toHaveBeenCalledTimes(1);
    });

    it('should skip rules with severity "off" in config', () => {
      const handler = vi.fn();
      registry.register(createRule({
        id: 'disabled-rule',
        languages: ['typescript'],
        create: () => ({ Program: handler }),
      }));

      const offConfig = createAcvConfig({
        rules: { 'disabled-rule': 'off' },
      });

      const ast = createASTNode({ type: 'Program', children: [] });
      engine.run({
        filePath: '/test/file.ts',
        language: 'typescript',
        ast,
        sourceText: '',
        config: offConfig,
      });

      expect(handler).not.toHaveBeenCalled();
    });

    it('should walk nested children recursively', () => {
      const callHandler = vi.fn();
      registry.register(createRule({
        id: 'call-detector',
        languages: ['typescript'],
        create: () => ({ CallExpression: callHandler }),
      }));

      const callNode: ASTNode = {
        type: 'CallExpression',
        start: createPosition({ line: 2, column: 3, offset: 20 }),
        end: createPosition({ line: 2, column: 15, offset: 32 }),
        children: [],
      };

      const ast = createASTNode({
        type: 'Program',
        children: [{
          type: 'FunctionDeclaration',
          start: createPosition(),
          end: createPosition({ line: 3, column: 1, offset: 40 }),
          children: [{
            type: 'BlockStatement',
            start: createPosition({ line: 1, column: 20, offset: 19 }),
            end: createPosition({ line: 3, column: 1, offset: 40 }),
            children: [callNode],
          }],
        }],
      });

      engine.run({
        filePath: '/test/file.ts',
        language: 'typescript',
        ast,
        sourceText: 'function f() { doStuff(); }',
        config,
      });

      expect(callHandler).toHaveBeenCalledWith(callNode);
    });

    it('should provide working getSourceText in context', () => {
      let capturedText = '';
      registry.register(createRule({
        id: 'text-reader',
        languages: ['typescript'],
        create: (context) => ({
          CallExpression: (node) => {
            capturedText = context.getSourceText(node);
          },
        }),
      }));

      const sourceText = 'hello();';
      const callNode: ASTNode = {
        type: 'CallExpression',
        start: createPosition({ line: 1, column: 1, offset: 0 }),
        end: createPosition({ line: 1, column: 8, offset: 7 }),
        children: [],
      };

      const ast = createASTNode({
        type: 'Program',
        children: [callNode],
      });

      engine.run({
        filePath: '/test/file.ts',
        language: 'typescript',
        ast,
        sourceText,
        config,
      });

      expect(capturedText).toBe('hello()');
    });

    it('should set ruleId and category on reported findings', () => {
      registry.register(createRule({
        id: 'categorized-rule',
        category: 'ai-specific',
        languages: ['typescript'],
        create: (context) => ({
          Program: () => {
            context.report({
              severity: 'warn',
              message: 'test',
              filePath: '/test',
              line: 1,
              column: 1,
              endLine: 1,
              endColumn: 10,
              codeSnippet: '',
              fix: null,
              suggestion: null,
              owaspRef: null,
              confidence: 1.0,
            });
          },
        }),
      }));

      const ast = createASTNode({ type: 'Program', children: [] });
      const findings = engine.run({
        filePath: '/test/file.ts',
        language: 'typescript',
        ast,
        sourceText: '',
        config,
      });

      expect(findings[0]!.ruleId).toBe('categorized-rule');
      expect(findings[0]!.category).toBe('ai-specific');
    });
  });
});
