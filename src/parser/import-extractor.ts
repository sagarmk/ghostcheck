/**
 * Import extractor — extracts import/require statements from JS/TS source.
 *
 * Two-strategy approach:
 *   1. Fast regex pass — handles common patterns without a full parse.
 *   2. TypeScript Compiler API — accurate AST walk via ts.createSourceFile().
 *
 * Public API:
 *   - extractImports()     — default: AST with regex fallback
 *   - extractImportsRegex() — regex-only (fast, less accurate)
 *   - extractImportsAst()   — AST-only (accurate, requires TS)
 *   - isBareSpecifier()     — true for npm packages vs relative paths
 *   - getPackageName()      — extract root package name (handles @scope/pkg)
 */

import type { ImportInfo } from '../core/types.js';
import ts from 'typescript';

// =============================================================================
// Public API
// =============================================================================

/**
 * Extraction strategy.
 *   - 'ast':   TypeScript Compiler API (accurate, slower)
 *   - 'regex': Regex-based (fast, may miss edge cases)
 *   - 'auto':  Try AST first, fall back to regex on failure
 */
export type ExtractionStrategy = 'ast' | 'regex' | 'auto';

export interface ExtractImportsOptions {
  /** Extraction strategy (default: 'auto') */
  readonly strategy?: ExtractionStrategy;
  /** Include type-only imports in results (default: true) */
  readonly includeTypeOnly?: boolean;
  /** Include dynamic imports in results (default: true) */
  readonly includeDynamic?: boolean;
}

/**
 * Extract all import/require statements from source code.
 *
 * Default strategy: AST with regex fallback.
 * Returns deduplicated ImportInfo[] sorted by line number.
 */
export function extractImports(
  source: string,
  filePath: string,
  options: ExtractImportsOptions = {},
): ImportInfo[] {
  const strategy = options.strategy ?? 'auto';

  let imports: ImportInfo[];

  if (strategy === 'regex') {
    imports = extractImportsRegex(source);
  } else if (strategy === 'ast') {
    imports = extractImportsAst(source, filePath);
  } else {
    // 'auto': try AST first, fall back to regex
    try {
      imports = extractImportsAst(source, filePath);
    } catch {
      imports = extractImportsRegex(source);
    }
  }

  // Apply filters
  if (options.includeTypeOnly === false) {
    imports = imports.filter((i) => !i.isTypeOnly);
  }
  if (options.includeDynamic === false) {
    imports = imports.filter((i) => !i.isDynamic);
  }

  return deduplicateImports(imports);
}

// =============================================================================
// Strategy 1: Regex-based extraction (fast pass)
// =============================================================================

/**
 * Regex patterns for import detection.
 * Each pattern captures the module specifier as group 'source'.
 *
 * Handles:
 *   import X from 'pkg'
 *   import { X, Y } from 'pkg'
 *   import * as X from 'pkg'
 *   import 'pkg'                (side-effect)
 *   import type { X } from 'pkg'
 *   export { X } from 'pkg'
 *   export * from 'pkg'
 *   export * as ns from 'pkg'
 *   require('pkg')
 *   import('pkg')               (dynamic)
 *   const X = require('pkg')
 *   const { a, b } = require('pkg')
 */

// Static import: import [type] [specifiers] from 'source'
// Also handles: import 'source' (side-effect only)
const IMPORT_FROM_RE =
  /import\s+(?:type\s+)?(?:(?:\{[^}]*\}|[*]\s+as\s+\w+|\w+)(?:\s*,\s*(?:\{[^}]*\}|[*]\s+as\s+\w+))?\s+from\s+)?(['"])(?<source1>[^'"]+)\1/g;

// Export from: export { X } from 'source' / export * from 'source'
const EXPORT_FROM_RE =
  /export\s+(?:type\s+)?(?:\{[^}]*\}|[*](?:\s+as\s+\w+)?)\s+from\s+(['"])(?<source2>[^'"]+)\1/g;

// CommonJS require: require('source') — covers const X = require('source')
const REQUIRE_RE = /(?<!\w)require\s*\(\s*(['"])(?<source3>[^'"]+)\1\s*\)/g;

// Dynamic import: import('source')
const DYNAMIC_IMPORT_RE = /(?<!\w)import\s*\(\s*(['"])(?<source4>[^'"]+)\1\s*\)/g;

/**
 * Extract imports using regex patterns.
 * Fast but may miss uncommon patterns or produce false positives in comments/strings.
 */
export function extractImportsRegex(source: string): ImportInfo[] {
  const results: ImportInfo[] = [];
  const lines = source.split('\n');

  // Helper: find line number for a character offset
  function getLineAndColumn(offset: number): { line: number; column: number } {
    let charCount = 0;
    for (let i = 0; i < lines.length; i++) {
      const lineLen = (lines[i]?.length ?? 0) + 1; // +1 for \n
      if (charCount + lineLen > offset) {
        return { line: i + 1, column: offset - charCount + 1 };
      }
      charCount += lineLen;
    }
    return { line: lines.length, column: 1 };
  }

  // ── Static imports ─────────────────────────────────────────────────────
  const importFromRe = new RegExp(IMPORT_FROM_RE.source, 'g');
  let match: RegExpExecArray | null;
  while ((match = importFromRe.exec(source)) !== null) {
    const fullMatch = match[0];
    const moduleSource = match.groups?.['source1'] ?? match[2] ?? '';
    const pos = getLineAndColumn(match.index);

    const isTypeOnly = /^import\s+type\s/.test(fullMatch);
    const specifiers = parseSpecifiersFromImport(fullMatch);

    results.push({
      source: moduleSource,
      specifiers,
      isDynamic: false,
      line: pos.line,
      column: pos.column,
      isTypeOnly,
      raw: fullMatch,
    });
  }

  // ── Export-from statements ─────────────────────────────────────────────
  const exportFromRe = new RegExp(EXPORT_FROM_RE.source, 'g');
  while ((match = exportFromRe.exec(source)) !== null) {
    const fullMatch = match[0];
    const moduleSource = match.groups?.['source2'] ?? match[2] ?? '';
    const pos = getLineAndColumn(match.index);

    const isTypeOnly = /^export\s+type\s/.test(fullMatch);
    const specifiers = parseSpecifiersFromExport(fullMatch);

    results.push({
      source: moduleSource,
      specifiers,
      isDynamic: false,
      line: pos.line,
      column: pos.column,
      isTypeOnly,
      raw: fullMatch,
    });
  }

  // ── CommonJS require ───────────────────────────────────────────────────
  // Avoid matching require() inside import() already captured
  const requireRe = new RegExp(REQUIRE_RE.source, 'g');
  while ((match = requireRe.exec(source)) !== null) {
    const fullMatch = match[0];
    const moduleSource = match.groups?.['source3'] ?? match[2] ?? '';
    const pos = getLineAndColumn(match.index);

    // Try to extract destructured specifiers from surrounding context
    const specifiers = parseSpecifiersFromRequire(source, match.index);

    results.push({
      source: moduleSource,
      specifiers,
      isDynamic: false,
      line: pos.line,
      column: pos.column,
      isTypeOnly: false,
      raw: fullMatch,
    });
  }

  // ── Dynamic import() ──────────────────────────────────────────────────
  const dynamicRe = new RegExp(DYNAMIC_IMPORT_RE.source, 'g');
  while ((match = dynamicRe.exec(source)) !== null) {
    const fullMatch = match[0];
    const moduleSource = match.groups?.['source4'] ?? match[2] ?? '';
    const pos = getLineAndColumn(match.index);

    results.push({
      source: moduleSource,
      specifiers: [],
      isDynamic: true,
      line: pos.line,
      column: pos.column,
      isTypeOnly: false,
      raw: fullMatch,
    });
  }

  return results;
}

// =============================================================================
// Strategy 2: TypeScript Compiler API extraction (accurate)
// =============================================================================

/**
 * Extract imports using the TypeScript Compiler API.
 * Creates a source file AST without type checking — fast and accurate.
 */
export function extractImportsAst(source: string, filePath: string): ImportInfo[] {
  const results: ImportInfo[] = [];

  const scriptKind = getScriptKind(filePath);
  const sourceFile = ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true, scriptKind);

  // Walk the AST
  function visit(node: ts.Node): void {
    // ── import declarations ────────────────────────────────────────────
    if (ts.isImportDeclaration(node)) {
      const importDecl = node;
      const moduleSpecifier = importDecl.moduleSpecifier;

      if (ts.isStringLiteral(moduleSpecifier)) {
        const specifiers = extractImportSpecifiers(importDecl);
        const isTypeOnly = importDecl.importClause?.isTypeOnly ?? false;
        const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));

        results.push({
          source: moduleSpecifier.text,
          specifiers,
          isDynamic: false,
          line: line + 1,
          column: character + 1,
          isTypeOnly,
          raw: node.getText(sourceFile),
        });
      }
    }

    // ── export declarations with module specifier ──────────────────────
    if (ts.isExportDeclaration(node) && node.moduleSpecifier) {
      const moduleSpecifier = node.moduleSpecifier;

      if (ts.isStringLiteral(moduleSpecifier)) {
        const specifiers = extractExportSpecifiers(node);
        const isTypeOnly = node.isTypeOnly ?? false;
        const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));

        results.push({
          source: moduleSpecifier.text,
          specifiers,
          isDynamic: false,
          line: line + 1,
          column: character + 1,
          isTypeOnly,
          raw: node.getText(sourceFile),
        });
      }
    }

    // ── require() calls ────────────────────────────────────────────────
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'require' &&
      node.arguments.length === 1
    ) {
      const arg = node.arguments[0]!;
      if (ts.isStringLiteral(arg)) {
        const specifiers = extractRequireSpecifiers(node);
        const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));

        results.push({
          source: arg.text,
          specifiers,
          isDynamic: false,
          line: line + 1,
          column: character + 1,
          isTypeOnly: false,
          raw: node.getText(sourceFile),
        });
      }
    }

    // ── dynamic import() expressions ──────────────────────────────────
    if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments.length >= 1
    ) {
      const arg = node.arguments[0]!;
      if (ts.isStringLiteral(arg)) {
        const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));

        results.push({
          source: arg.text,
          specifiers: [],
          isDynamic: true,
          line: line + 1,
          column: character + 1,
          isTypeOnly: false,
          raw: node.getText(sourceFile),
        });
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return results;
}

// =============================================================================
// Package specifier utilities
// =============================================================================

/**
 * Check if a module specifier is a bare specifier (npm package).
 * Bare specifiers do NOT start with '.', '/', or a protocol.
 *
 * Examples:
 *   'lodash'           → true  (npm package)
 *   '@scope/pkg'       → true  (scoped npm package)
 *   './utils'           → false (relative path)
 *   '../lib/foo'        → false (relative path)
 *   '/absolute/path'    → false (absolute path)
 *   'node:fs'           → false (Node.js builtin)
 */
export function isBareSpecifier(specifier: string): boolean {
  if (specifier.startsWith('.') || specifier.startsWith('/')) return false;
  if (specifier.includes(':')) return false; // node:, https:, etc.
  return true;
}

/**
 * Extract the root package name from a module specifier.
 * Handles scoped packages (@org/pkg) and deep imports (pkg/subpath).
 *
 * Examples:
 *   'lodash'           → 'lodash'
 *   'lodash/map'       → 'lodash'
 *   '@scope/pkg'       → '@scope/pkg'
 *   '@scope/pkg/sub'   → '@scope/pkg'
 *   './utils'           → null (relative path, not a package)
 */
export function getPackageName(specifier: string): string | null {
  if (!isBareSpecifier(specifier)) return null;

  if (specifier.startsWith('@')) {
    // Scoped package: @scope/name or @scope/name/subpath
    const parts = specifier.split('/');
    if (parts.length < 2) return null; // malformed
    return `${parts[0]}/${parts[1]}`;
  }

  // Regular package: name or name/subpath
  const slashIdx = specifier.indexOf('/');
  return slashIdx === -1 ? specifier : specifier.slice(0, slashIdx);
}

/**
 * Separate imports into bare specifiers (npm packages) and relative paths.
 */
export function partitionImports(imports: readonly ImportInfo[]): {
  packages: ImportInfo[];
  relative: ImportInfo[];
} {
  const packages: ImportInfo[] = [];
  const relative: ImportInfo[] = [];

  for (const imp of imports) {
    if (isBareSpecifier(imp.source)) {
      packages.push(imp);
    } else {
      relative.push(imp);
    }
  }

  return { packages, relative };
}

// =============================================================================
// Internal helpers — regex specifier parsing
// =============================================================================

/**
 * Parse specifier names from an import statement string.
 * Handles: default, named ({ a, b }), namespace (* as X), and combined.
 */
function parseSpecifiersFromImport(importStr: string): string[] {
  const specifiers: string[] = [];

  // Strip 'import' keyword and 'type' modifier
  let rest = importStr.replace(/^import\s+(?:type\s+)?/, '');

  // Remove 'from ...' suffix
  const fromIdx = rest.lastIndexOf(' from ');
  if (fromIdx === -1) {
    // Side-effect import: import 'pkg'
    return [];
  }
  rest = rest.slice(0, fromIdx).trim();

  // Default import: import X, ...
  // Namespace: import * as X, ...
  // Named: import { a, b }, ...
  // Combined: import X, { a, b } from ...

  // Split by comma at the top level (not inside braces)
  const parts = splitTopLevel(rest);

  for (const part of parts) {
    const trimmed = part.trim();

    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
      // Named imports: { a, b, c as d }
      const inner = trimmed.slice(1, -1);
      const names = inner.split(',').map((n) => n.trim()).filter(Boolean);
      for (const name of names) {
        // 'a as b' → use local name 'b'; 'a' → use 'a'
        const asMatch = /^(.+?)\s+as\s+(.+)$/.exec(name);
        specifiers.push(asMatch ? asMatch[2]!.trim() : name);
      }
    } else if (trimmed.startsWith('*')) {
      // Namespace import: * as X
      const asMatch = /[*]\s+as\s+(\w+)/.exec(trimmed);
      if (asMatch) {
        specifiers.push(asMatch[1]!);
      }
    } else if (trimmed) {
      // Default import
      specifiers.push(trimmed);
    }
  }

  return specifiers;
}

/**
 * Parse specifier names from an export-from statement.
 */
function parseSpecifiersFromExport(exportStr: string): string[] {
  const specifiers: string[] = [];

  // Match: export { a, b } from ... OR export * from ... OR export * as ns from ...
  const namedMatch = /export\s+(?:type\s+)?\{([^}]*)\}/.exec(exportStr);
  if (namedMatch) {
    const names = namedMatch[1]!.split(',').map((n) => n.trim()).filter(Boolean);
    for (const name of names) {
      const asMatch = /^(.+?)\s+as\s+(.+)$/.exec(name);
      specifiers.push(asMatch ? asMatch[2]!.trim() : name);
    }
    return specifiers;
  }

  const nsMatch = /export\s+[*]\s+as\s+(\w+)/.exec(exportStr);
  if (nsMatch) {
    return [nsMatch[1]!];
  }

  // export * from ... — re-export all, no specific specifiers
  return ['*'];
}

/**
 * Try to extract specifiers from a require() call's surrounding context.
 * Looks backward from the require position for const/let/var destructuring.
 */
function parseSpecifiersFromRequire(source: string, requireIndex: number): string[] {
  // Look backward up to 200 chars for a variable declaration
  const lookback = source.slice(Math.max(0, requireIndex - 200), requireIndex);

  // Match: const { a, b } = require(...)
  const destructureMatch = /(?:const|let|var)\s+\{([^}]*)\}\s*=\s*$/.exec(lookback);
  if (destructureMatch) {
    return destructureMatch[1]!
      .split(',')
      .map((n) => n.trim())
      .filter(Boolean)
      .map((n) => {
        const asMatch = /^(.+?):\s*(.+)$/.exec(n);
        return asMatch ? asMatch[2]!.trim() : n;
      });
  }

  // Match: const X = require(...)
  const defaultMatch = /(?:const|let|var)\s+(\w+)\s*=\s*$/.exec(lookback);
  if (defaultMatch) {
    return [defaultMatch[1]!];
  }

  return [];
}

/**
 * Split a string by commas, but only at the top level (not inside braces).
 */
function splitTopLevel(str: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = '';

  for (const ch of str) {
    if (ch === '{') depth++;
    else if (ch === '}') depth--;

    if (ch === ',' && depth === 0) {
      parts.push(current);
      current = '';
    } else {
      current += ch;
    }
  }

  if (current.trim()) {
    parts.push(current);
  }

  return parts;
}

// =============================================================================
// Internal helpers — AST specifier extraction
// =============================================================================

/**
 * Extract specifier names from a TS import declaration.
 */
function extractImportSpecifiers(node: ts.ImportDeclaration): string[] {
  const specifiers: string[] = [];
  const clause = node.importClause;

  if (!clause) {
    // Side-effect import: import 'pkg'
    return [];
  }

  // Default import
  if (clause.name) {
    specifiers.push(clause.name.text);
  }

  // Named bindings
  if (clause.namedBindings) {
    if (ts.isNamespaceImport(clause.namedBindings)) {
      // import * as X
      specifiers.push(clause.namedBindings.name.text);
    } else if (ts.isNamedImports(clause.namedBindings)) {
      // import { a, b }
      for (const elem of clause.namedBindings.elements) {
        specifiers.push(elem.name.text);
      }
    }
  }

  return specifiers;
}

/**
 * Extract specifier names from a TS export declaration.
 */
function extractExportSpecifiers(node: ts.ExportDeclaration): string[] {
  if (!node.exportClause) {
    // export * from 'pkg'
    return ['*'];
  }

  if (ts.isNamespaceExport(node.exportClause)) {
    // export * as ns from 'pkg'
    return [node.exportClause.name.text];
  }

  // export { a, b } from 'pkg'
  const specifiers: string[] = [];
  for (const elem of node.exportClause.elements) {
    specifiers.push(elem.name.text);
  }
  return specifiers;
}

/**
 * Extract specifier names from a require() call's parent context.
 */
function extractRequireSpecifiers(node: ts.CallExpression): string[] {
  const parent = node.parent;
  if (!parent) return [];

  // const X = require('pkg')
  if (ts.isVariableDeclaration(parent) && ts.isIdentifier(parent.name)) {
    return [parent.name.text];
  }

  // const { a, b } = require('pkg')
  if (ts.isVariableDeclaration(parent) && ts.isObjectBindingPattern(parent.name)) {
    return parent.name.elements.map((elem) => {
      if (ts.isIdentifier(elem.name)) return elem.name.text;
      return '';
    }).filter(Boolean);
  }

  return [];
}

/**
 * Determine TypeScript script kind from file extension.
 */
function getScriptKind(filePath: string): ts.ScriptKind {
  const ext = filePath.slice(filePath.lastIndexOf('.')).toLowerCase();
  switch (ext) {
    case '.ts':
    case '.mts':
    case '.cts':
      return ts.ScriptKind.TS;
    case '.tsx':
      return ts.ScriptKind.TSX;
    case '.jsx':
      return ts.ScriptKind.JSX;
    case '.js':
    case '.mjs':
    case '.cjs':
    default:
      return ts.ScriptKind.JS;
  }
}

// =============================================================================
// Deduplication
// =============================================================================

/**
 * Deduplicate imports by source + isDynamic.
 * Merges specifiers from duplicate imports of the same module.
 * Sorts by line number for deterministic output.
 */
function deduplicateImports(imports: ImportInfo[]): ImportInfo[] {
  const map = new Map<string, ImportInfo>();

  for (const imp of imports) {
    const key = `${imp.source}::${String(imp.isDynamic)}`;
    const existing = map.get(key);

    if (existing) {
      // Merge specifiers
      const mergedSpecifiers = [
        ...new Set([...existing.specifiers, ...imp.specifiers]),
      ];
      map.set(key, {
        ...existing,
        specifiers: mergedSpecifiers,
        // Keep isTypeOnly only if BOTH are type-only
        isTypeOnly: existing.isTypeOnly === true && imp.isTypeOnly === true,
      });
    } else {
      map.set(key, imp);
    }
  }

  return [...map.values()].sort((a, b) => a.line - b.line);
}
