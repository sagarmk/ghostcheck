/**
 * JavaScript/TypeScript parser using @swc/core.
 *
 * SWC is ~10x faster than Babel for parsing, making it ideal for
 * static analysis where we need AST but not code generation.
 */

import type { ASTNode, Position } from '../core/types.js';

/**
 * SWC parse options.
 */
export interface SwcParseOptions {
  readonly language: 'javascript' | 'typescript';
  readonly jsx: boolean;
  readonly timeout: number;
}

/**
 * Detect if a file uses JSX based on its extension.
 */
export function isJsx(filePath: string): boolean {
  return filePath.endsWith('.jsx') || filePath.endsWith('.tsx');
}

/**
 * Detect parse language from file extension.
 */
export function detectSwcLanguage(filePath: string): 'javascript' | 'typescript' | null {
  const ext = filePath.slice(filePath.lastIndexOf('.'));
  switch (ext) {
    case '.js':
    case '.jsx':
    case '.mjs':
    case '.cjs':
      return 'javascript';
    case '.ts':
    case '.tsx':
    case '.mts':
    case '.cts':
      return 'typescript';
    default:
      return null;
  }
}

/**
 * Parse JavaScript/TypeScript source code into a normalized AST.
 *
 * Uses @swc/core's parseSync for maximum performance.
 * The resulting AST is mapped to our normalized ASTNode interface
 * so rules don't depend on SWC-specific types.
 */
export async function parseWithSwc(
  source: string,
  filePath: string,
  options: Partial<SwcParseOptions> = {},
): Promise<ASTNode> {
  const language = options.language ?? detectSwcLanguage(filePath);
  if (!language) {
    throw new Error(`Cannot determine language for file: ${filePath}`);
  }

  const jsx = options.jsx ?? isJsx(filePath);

  // Dynamic import to avoid loading SWC until needed
  const swc = await import('@swc/core');

  const ast = await swc.parse(source, {
    syntax: language === 'typescript' ? 'typescript' : 'ecmascript',
    tsx: language === 'typescript' && jsx,
    jsx: language === 'javascript' && jsx,
    target: 'es2022',
    comments: true,
  });

  return normalizeSwcAst(ast);
}

/**
 * Normalize an SWC AST module into our ASTNode interface.
 *
 * SWC uses a global BytePos counter that accumulates across parse() calls
 * within the same process. Span offsets are NOT 0-based per-file — they're
 * cumulative. We normalize by subtracting the module's start offset (baseOffset)
 * from all spans so that offsets are 0-based relative to the file's source text.
 */
function normalizeSwcAst(module: {
  type: string;
  body: unknown[];
  span: { start: number; end: number };
}): ASTNode {
  const baseOffset = module.span.start;

  return {
    type: module.type,
    start: offsetToPosition(module.span.start - baseOffset),
    end: offsetToPosition(module.span.end - baseOffset),
    children: (module.body as Array<{ type: string; span: { start: number; end: number } }>).map(
      (node) => normalizeSwcNode(node, baseOffset),
    ),
  };
}

/**
 * Recursively normalize an SWC AST node.
 * Subtracts baseOffset from all span positions to get 0-based per-file offsets.
 */
function normalizeSwcNode(node: Record<string, unknown>, baseOffset: number): ASTNode {
  const span = node['span'] as { start: number; end: number } | undefined;

  const result: ASTNode = {
    type: (node['type'] as string) ?? 'Unknown',
    start: span ? offsetToPosition(span.start - baseOffset) : { line: 0, column: 0, offset: 0 },
    end: span ? offsetToPosition(span.end - baseOffset) : { line: 0, column: 0, offset: 0 },
  };

  // Copy additional properties (for rule inspection)
  for (const [key, value] of Object.entries(node)) {
    if (key !== 'type' && key !== 'span') {
      (result as Record<string, unknown>)[key] = value;
    }
  }

  return result;
}

/**
 * Convert a 0-based byte offset to a Position.
 * Note: Accurate line/column requires the source text — this is a stub
 * that uses the offset as column (will be correct for the first line).
 */
function offsetToPosition(offset: number): Position {
  return { line: 1, column: offset + 1, offset };
}
