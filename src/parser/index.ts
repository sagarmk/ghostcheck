/**
 * Parser module — public API for source code parsing.
 *
 * This module provides the parsing pipeline entry point.
 * Internally delegates to the AST module (ast/) which uses SWC
 * for JavaScript/TypeScript parsing.
 *
 * Consumers should import from here rather than ast/ directly:
 *   import { parse, detectLanguage } from './parser/index.js';
 *
 * Future: additional parser backends (tree-sitter for Python/Go/Rust)
 * will be registered here without changing the public API.
 */

export {
  parseWithSwc as parse,
  parseWithSwc,
  detectSwcLanguage,
  isJsx,
} from '../ast/swc-parser.js';

export {
  detectLanguage,
  getParserType,
  getSupportedExtensions,
  isSupportedExtension,
} from '../ast/language-detect.js';
export type { ParserType } from '../ast/language-detect.js';

export { walkAst } from '../ast/visitor.js';

export * as NodeTypes from '../ast/node-types.js';

// Import extraction
export {
  extractImports,
  extractImportsRegex,
  extractImportsAst,
  isBareSpecifier,
  getPackageName,
  partitionImports,
} from './import-extractor.js';
export type { ExtractionStrategy, ExtractImportsOptions } from './import-extractor.js';
