/**
 * Unified AST visitor — walks the normalized AST and dispatches
 * to rule visitor handlers by node type.
 */

import type { ASTNode, RuleVisitor } from '../core/types.js';

/**
 * Walk an AST tree and invoke matching visitor handlers.
 *
 * For each node, if any visitor has a handler for that node's type,
 * the handler is called. Then all children are walked recursively.
 */
export function walkAst(root: ASTNode, visitors: readonly RuleVisitor[]): void {
  visitNode(root, visitors);
}

/**
 * Visit a single node and its children.
 */
function visitNode(node: ASTNode, visitors: readonly RuleVisitor[]): void {
  // Dispatch to matching handlers
  for (const visitor of visitors) {
    const handler = visitor[node.type];
    if (handler) {
      handler(node);
    }
  }

  // Recurse into children
  if (node.children) {
    for (const child of node.children) {
      visitNode(child, visitors);
    }
  }

  // Also walk any array-valued properties that contain AST nodes
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        if (isAstNode(item)) {
          visitNode(item, visitors);
        }
      }
    } else if (isAstNode(value)) {
      visitNode(value, visitors);
    }
  }
}

/**
 * Type guard to check if a value is an AST node.
 */
function isAstNode(value: unknown): value is ASTNode {
  return (
    typeof value === 'object' &&
    value !== null &&
    'type' in value &&
    typeof (value as Record<string, unknown>)['type'] === 'string' &&
    'start' in value &&
    'end' in value
  );
}
