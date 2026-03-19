/**
 * Language detection from file extension.
 * Maps file extensions to supported language identifiers.
 */

import type { Language } from '../core/types.js';

/**
 * Map of file extensions to language identifiers.
 */
const EXTENSION_TO_LANGUAGE: Readonly<Record<string, Language>> = {
  // JavaScript
  '.js': 'javascript',
  '.jsx': 'javascript',
  '.mjs': 'javascript',
  '.cjs': 'javascript',

  // TypeScript
  '.ts': 'typescript',
  '.tsx': 'typescript',
  '.mts': 'typescript',
  '.cts': 'typescript',

  // Python
  '.py': 'python',
  '.pyw': 'python',

  // Go
  '.go': 'go',

  // Rust
  '.rs': 'rust',

  // Java
  '.java': 'java',

  // Ruby
  '.rb': 'ruby',
};

/**
 * Map of languages to parser type.
 */
export type ParserType = 'swc' | 'tree-sitter';

const LANGUAGE_TO_PARSER: Readonly<Record<Language, ParserType>> = {
  javascript: 'swc',
  typescript: 'swc',
  python: 'tree-sitter',
  go: 'tree-sitter',
  rust: 'tree-sitter',
  java: 'tree-sitter',
  ruby: 'tree-sitter',
};

/**
 * Detect language from a file path.
 * Returns null for unsupported extensions.
 */
export function detectLanguage(filePath: string): Language | null {
  const lastDot = filePath.lastIndexOf('.');
  if (lastDot === -1) return null;

  const ext = filePath.slice(lastDot).toLowerCase();
  return EXTENSION_TO_LANGUAGE[ext] ?? null;
}

/**
 * Get the parser type for a language.
 */
export function getParserType(language: Language): ParserType {
  return LANGUAGE_TO_PARSER[language];
}

/**
 * Get all supported file extensions.
 */
export function getSupportedExtensions(): readonly string[] {
  return Object.keys(EXTENSION_TO_LANGUAGE);
}

/**
 * Check if a file extension is supported.
 */
export function isSupportedExtension(ext: string): boolean {
  return ext.toLowerCase() in EXTENSION_TO_LANGUAGE;
}
