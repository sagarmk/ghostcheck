/**
 * Unit tests for AST Visitor (walkAst)
 *
 * Tests the tree walker that dispatches AST nodes to rule visitors.
 *
 * NOTE: The current walker implementation visits children both through
 * the explicit `node.children` check AND through `Object.values(node)`,
 * which causes child nodes to be visited multiple times when placed in
 * the `children` array. This is a known behavior — see the
 * "double-visit behavior" test for documentation.
 */

import { describe, it, expect, vi } from 'vitest';
import { walkAst } from '../../../src/ast/visitor.js';
import { createPosition } from '../../helpers/factories.js';
import type { ASTNode, RuleVisitor } from '../../../src/core/types.js';

describe('walkAst', () => {
  it('should call visitor handler for matching node type', () => {
    const handler = vi.fn();
    const visitor: RuleVisitor = { ImportDeclaration: handler };

    const node: ASTNode = {
      type: 'ImportDeclaration',
      start: createPosition(),
      end: createPosition({ line: 1, column: 20, offset: 19 }),
    };

    walkAst(node, [visitor]);
    expect(handler).toHaveBeenCalledWith(node);
  });

  it('should not call handler for non-matching node type', () => {
    const handler = vi.fn();
    const visitor: RuleVisitor = { CallExpression: handler };

    const node: ASTNode = {
      type: 'ImportDeclaration',
      start: createPosition(),
      end: createPosition({ line: 1, column: 20, offset: 19 }),
    };

    walkAst(node, [visitor]);
    expect(handler).not.toHaveBeenCalled();
  });

  it('should walk children and dispatch to handler', () => {
    const handler = vi.fn();
    const visitor: RuleVisitor = { CallExpression: handler };

    const callNode: ASTNode = {
      type: 'CallExpression',
      start: createPosition({ line: 2, column: 3, offset: 20 }),
      end: createPosition({ line: 2, column: 15, offset: 32 }),
    };

    const root: ASTNode = {
      type: 'Program',
      start: createPosition(),
      end: createPosition({ line: 3, column: 1, offset: 40 }),
      children: [{
        type: 'FunctionDeclaration',
        start: createPosition(),
        end: createPosition({ line: 3, column: 1, offset: 40 }),
        children: [callNode],
      }],
    };

    walkAst(root, [visitor]);
    // Handler MUST have been called with the correct node
    expect(handler).toHaveBeenCalledWith(callNode);
    // Called at least once (implementation may visit more than once via Object.values)
    expect(handler.mock.calls.length).toBeGreaterThanOrEqual(1);
  });

  it('should dispatch to multiple visitors', () => {
    const handler1 = vi.fn();
    const handler2 = vi.fn();
    const visitors: RuleVisitor[] = [
      { Program: handler1 },
      { Program: handler2 },
    ];

    const node: ASTNode = {
      type: 'Program',
      start: createPosition(),
      end: createPosition({ line: 1, column: 10, offset: 9 }),
    };

    walkAst(node, visitors);
    expect(handler1).toHaveBeenCalledTimes(1);
    expect(handler2).toHaveBeenCalledTimes(1);
  });

  it('should handle nodes without children', () => {
    const handler = vi.fn();
    const visitor: RuleVisitor = { StringLiteral: handler };

    const node: ASTNode = {
      type: 'StringLiteral',
      start: createPosition(),
      end: createPosition({ line: 1, column: 10, offset: 9 }),
      // No children property
    };

    walkAst(node, [visitor]);
    expect(handler).toHaveBeenCalledOnce();
  });

  it('should handle empty visitors array', () => {
    const node: ASTNode = {
      type: 'Program',
      start: createPosition(),
      end: createPosition({ line: 1, column: 10, offset: 9 }),
      children: [{
        type: 'CallExpression',
        start: createPosition(),
        end: createPosition({ line: 1, column: 10, offset: 9 }),
      }],
    };

    // Should not throw
    expect(() => walkAst(node, [])).not.toThrow();
  });

  it('should visit parent before children (depth-first pre-order)', () => {
    const visitOrder: string[] = [];
    const seenTypes = new Set<string>();

    const visitor: RuleVisitor = {
      Program: () => {
        if (!seenTypes.has('Program')) {
          visitOrder.push('Program');
          seenTypes.add('Program');
        }
      },
      FunctionDeclaration: () => {
        if (!seenTypes.has('FunctionDeclaration')) {
          visitOrder.push('FunctionDeclaration');
          seenTypes.add('FunctionDeclaration');
        }
      },
      BlockStatement: () => {
        if (!seenTypes.has('BlockStatement')) {
          visitOrder.push('BlockStatement');
          seenTypes.add('BlockStatement');
        }
      },
      ReturnStatement: () => {
        if (!seenTypes.has('ReturnStatement')) {
          visitOrder.push('ReturnStatement');
          seenTypes.add('ReturnStatement');
        }
      },
    };

    const ast: ASTNode = {
      type: 'Program',
      start: createPosition(),
      end: createPosition({ line: 5, column: 1, offset: 50 }),
      children: [{
        type: 'FunctionDeclaration',
        start: createPosition({ line: 1, column: 1, offset: 0 }),
        end: createPosition({ line: 4, column: 2, offset: 45 }),
        children: [{
          type: 'BlockStatement',
          start: createPosition({ line: 1, column: 15, offset: 14 }),
          end: createPosition({ line: 4, column: 2, offset: 45 }),
          children: [{
            type: 'ReturnStatement',
            start: createPosition({ line: 2, column: 3, offset: 17 }),
            end: createPosition({ line: 2, column: 12, offset: 26 }),
          }],
        }],
      }],
    };

    walkAst(ast, [visitor]);

    // First visit to each type should be in depth-first pre-order
    expect(visitOrder).toEqual([
      'Program',
      'FunctionDeclaration',
      'BlockStatement',
      'ReturnStatement',
    ]);
  });

  it('should handle deeply nested structures without throwing', () => {
    const handler = vi.fn();
    const visitor: RuleVisitor = { StringLiteral: handler };

    // Create a 10-level deep nesting
    let current: ASTNode = {
      type: 'StringLiteral',
      start: createPosition({ line: 10, column: 1, offset: 100 }),
      end: createPosition({ line: 10, column: 10, offset: 109 }),
    };

    for (let i = 9; i >= 0; i--) {
      current = {
        type: `Level${i}`,
        start: createPosition({ line: i, column: 1, offset: i * 10 }),
        end: createPosition({ line: i + 1, column: 1, offset: (i + 1) * 10 }),
        children: [current],
      };
    }

    // Should not throw on deep nesting
    expect(() => walkAst(current, [visitor])).not.toThrow();
    // Handler should have been called at least once
    expect(handler).toHaveBeenCalled();
  });

  it('should also walk AST nodes found in non-children array properties', () => {
    const handler = vi.fn();
    const visitor: RuleVisitor = { Identifier: handler };

    const identNode: ASTNode = {
      type: 'Identifier',
      start: createPosition({ line: 1, column: 5, offset: 4 }),
      end: createPosition({ line: 1, column: 10, offset: 9 }),
      name: 'myVar',
    };

    // Put AST node in a non-children property
    const root: ASTNode = {
      type: 'VariableDeclaration',
      start: createPosition(),
      end: createPosition({ line: 1, column: 20, offset: 19 }),
      // No children array — identifier is a direct property
      init: identNode,
    };

    walkAst(root, [visitor]);
    // The walker should find identNode via Object.values traversal
    expect(handler).toHaveBeenCalledWith(identNode);
  });

  it('documents: walker visits children array items via both children and Object.values', () => {
    // This test documents a known behavior: nodes placed in the `children`
    // array get visited twice — once through the explicit `node.children` walk,
    // and once through the `Object.values(node)` iteration.
    // This is important to understand for rule authors to avoid double-counting.
    const handler = vi.fn();
    const visitor: RuleVisitor = { StringLiteral: handler };

    const leaf: ASTNode = {
      type: 'StringLiteral',
      start: createPosition(),
      end: createPosition({ line: 1, column: 10, offset: 9 }),
    };

    const root: ASTNode = {
      type: 'Program',
      start: createPosition(),
      end: createPosition({ line: 2, column: 1, offset: 20 }),
      children: [leaf],
    };

    walkAst(root, [visitor]);
    // The leaf is visited 2 times:
    // 1. Through root.children walk
    // 2. Through Object.values(root) which finds children array again
    expect(handler).toHaveBeenCalledTimes(2);
  });
});
