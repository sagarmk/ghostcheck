/**
 * AST module — parsing and traversal.
 */

export { parseWithSwc, detectSwcLanguage, isJsx } from './swc-parser.js';
export { walkAst } from './visitor.js';
export {
  detectLanguage,
  getParserType,
  getSupportedExtensions,
  isSupportedExtension,
} from './language-detect.js';
export type { ParserType } from './language-detect.js';
export * as NodeTypes from './node-types.js';
