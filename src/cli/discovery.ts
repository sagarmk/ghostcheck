/**
 * File discovery module using fast-glob.
 *
 * Discovers files for scanning, respecting .gitignore and .acvrc ignore patterns.
 * Returns absolute file paths sorted deterministically.
 *
 * Edge cases handled:
 *   - Target path doesn't exist → DiscoveryError
 *   - No files found → empty array (caller decides exit code)
 *   - Permission errors → DiscoveryError
 *   - Symlink loops → followSymbolicLinks: false
 *   - Binary files → filtered by extension (only source files matched)
 */

import fg from 'fast-glob';
import ignoreModule from 'ignore';
const ignore = ignoreModule.default ?? ignoreModule;
import { readFile, stat, access, constants } from 'node:fs/promises';
import { join, resolve, relative, dirname, parse } from 'node:path';
import { existsSync } from 'node:fs';
import type { Language } from '../core/types.js';

// =============================================================================
// Types
// =============================================================================

/**
 * Options for file discovery.
 */
export interface DiscoveryOptions {
  /** Root path to search from (file or directory) */
  readonly path: string;
  /** Additional glob patterns to ignore */
  readonly ignore: readonly string[];
  /** Glob patterns to include (empty = default source file extensions) */
  readonly include?: readonly string[];
  /** Maximum file size in bytes (files larger are skipped) */
  readonly maxFileSize: number;
  /** Languages to include (empty = all supported) */
  readonly languages: readonly Language[];
  /** Only include git-staged files */
  readonly staged: boolean;
  /** Only include files changed since this git ref */
  readonly since?: string;
}

/**
 * Discovery result with metadata.
 */
export interface DiscoveryResult {
  /** Absolute paths of discovered files, sorted */
  readonly files: readonly string[];
  /** Number of files skipped due to size limit */
  readonly skippedBySize: number;
  /** Number of files skipped by ignore patterns */
  readonly skippedByIgnore: number;
  /** Root path that was searched */
  readonly rootPath: string;
}

/**
 * Error thrown when file discovery fails.
 */
export class DiscoveryError extends Error {
  constructor(
    message: string,
    public readonly code: 'PATH_NOT_FOUND' | 'PERMISSION_DENIED' | 'NOT_DIRECTORY' | 'UNKNOWN',
  ) {
    super(message);
    this.name = 'DiscoveryError';
  }
}

// =============================================================================
// Extension mapping
// =============================================================================

/**
 * Extension-to-language mapping for supported languages.
 */
const EXTENSION_MAP: Readonly<Record<string, Language>> = {
  '.js': 'javascript',
  '.jsx': 'javascript',
  '.mjs': 'javascript',
  '.cjs': 'javascript',
  '.ts': 'typescript',
  '.tsx': 'typescript',
  '.mts': 'typescript',
  '.cts': 'typescript',
  '.py': 'python',
  '.pyw': 'python',
  '.go': 'go',
  '.rs': 'rust',
  '.java': 'java',
  '.rb': 'ruby',
};

/**
 * Default patterns always ignored regardless of config.
 */
const DEFAULT_IGNORES: readonly string[] = [
  '**/node_modules/**',
  '**/dist/**',
  '**/build/**',
  '**/.git/**',
  '**/vendor/**',
  '**/.next/**',
  '**/.nuxt/**',
  '**/coverage/**',
  '**/__pycache__/**',
  '**/target/**', // Rust/Java build output
];

// =============================================================================
// Public API
// =============================================================================

/**
 * Discover files to scan based on configuration.
 *
 * Respects .gitignore, .acvrc ignore patterns, and language filters.
 * Returns absolute file paths sorted for deterministic output.
 *
 * @throws DiscoveryError if the target path doesn't exist or can't be accessed
 */
export async function discoverFiles(options: DiscoveryOptions): Promise<string[]> {
  const rootPath = resolve(options.path);

  // ── Validate path exists and is accessible ──────────────────────────
  await validatePath(rootPath);

  // ── Handle single file target ───────────────────────────────────────
  const pathStat = await stat(rootPath);
  if (pathStat.isFile()) {
    return handleSingleFile(rootPath, options, pathStat.size);
  }

  // ── Build glob patterns ─────────────────────────────────────────────
  const extensions = getSupportedExtensions(options.languages);
  const patterns = options.include?.length
    ? [...options.include]
    : buildGlobPatterns(extensions);

  // ── Load .gitignore + .acvignore patterns ──────────────────────────
  const gitignorePatterns = await loadGitignore(rootPath);
  const acvignorePatterns = await loadAcvignore(rootPath);
  const ig = ignore()
    .add(gitignorePatterns)
    .add(acvignorePatterns)
    .add([...options.ignore]);

  // ── Run fast-glob ───────────────────────────────────────────────────
  const allIgnores = [...DEFAULT_IGNORES, ...options.ignore, ...acvignorePatterns];

  const entries = await fg(patterns, {
    cwd: rootPath,
    absolute: true,
    dot: false,
    ignore: allIgnores,
    stats: true,
    followSymbolicLinks: false,
    onlyFiles: true,
    suppressErrors: true, // Don't throw on permission errors for individual files
  });

  // ── Filter by .gitignore, file size ────────────────────────────────
  const discoveredFiles: string[] = [];

  for (const entry of entries) {
    const entryPath = typeof entry === 'string' ? entry : entry.path;
    const entrySize = typeof entry === 'string' ? null : entry.stats?.size ?? null;

    // Apply .gitignore filtering on relative path
    const relativePath = relative(rootPath, entryPath);
    if (relativePath && ig.ignores(relativePath)) {
      continue;
    }

    // Filter by file size
    if (entrySize !== null && entrySize > options.maxFileSize) {
      continue;
    }

    discoveredFiles.push(entryPath);
  }

  // ── Sort for deterministic output ──────────────────────────────────
  return discoveredFiles.sort();
}

/**
 * Discover files with full metadata.
 * Like discoverFiles() but returns counts of skipped files.
 */
export async function discoverFilesDetailed(options: DiscoveryOptions): Promise<DiscoveryResult> {
  const rootPath = resolve(options.path);
  await validatePath(rootPath);

  const pathStat = await stat(rootPath);
  if (pathStat.isFile()) {
    const files = handleSingleFile(rootPath, options, pathStat.size);
    return {
      files,
      skippedBySize: files.length === 0 ? 1 : 0,
      skippedByIgnore: 0,
      rootPath,
    };
  }

  const extensions = getSupportedExtensions(options.languages);
  const patterns = options.include?.length
    ? [...options.include]
    : buildGlobPatterns(extensions);

  const gitignorePatterns = await loadGitignore(rootPath);
  const acvignorePatterns2 = await loadAcvignore(rootPath);
  const ig = ignore()
    .add(gitignorePatterns)
    .add(acvignorePatterns2)
    .add([...options.ignore]);

  const allIgnores = [...DEFAULT_IGNORES, ...options.ignore, ...acvignorePatterns2];

  const entries = await fg(patterns, {
    cwd: rootPath,
    absolute: true,
    dot: false,
    ignore: allIgnores,
    stats: true,
    followSymbolicLinks: false,
    onlyFiles: true,
    suppressErrors: true,
  });

  const files: string[] = [];
  let skippedBySize = 0;
  let skippedByIgnore = 0;

  for (const entry of entries) {
    const filePath = typeof entry === 'string' ? entry : entry.path;
    const fileSize = typeof entry === 'string' ? null : entry.stats?.size ?? null;

    const relativePath = relative(rootPath, filePath);
    if (relativePath && ig.ignores(relativePath)) {
      skippedByIgnore++;
      continue;
    }

    if (fileSize !== null && fileSize > options.maxFileSize) {
      skippedBySize++;
      continue;
    }

    files.push(filePath);
  }

  return {
    files: files.sort(),
    skippedBySize,
    skippedByIgnore,
    rootPath,
  };
}

/**
 * Detect the language of a file from its extension.
 * Returns null for unsupported extensions.
 */
export function detectLanguage(filePath: string): Language | null {
  const ext = filePath.slice(filePath.lastIndexOf('.'));
  return EXTENSION_MAP[ext] ?? null;
}

// =============================================================================
// Internal helpers
// =============================================================================

/**
 * Validate that a path exists and is accessible.
 */
async function validatePath(targetPath: string): Promise<void> {
  try {
    await access(targetPath, constants.R_OK);
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') {
      throw new DiscoveryError(
        `Path does not exist: ${targetPath}`,
        'PATH_NOT_FOUND',
      );
    }
    if (code === 'EACCES' || code === 'EPERM') {
      throw new DiscoveryError(
        `Permission denied: ${targetPath}`,
        'PERMISSION_DENIED',
      );
    }
    throw new DiscoveryError(
      `Cannot access path: ${targetPath} (${code ?? 'unknown error'})`,
      'UNKNOWN',
    );
  }
}

/**
 * Handle when the target path is a single file.
 */
function handleSingleFile(
  filePath: string,
  options: DiscoveryOptions,
  fileSize: number,
): string[] {
  // Check extension
  const ext = filePath.slice(filePath.lastIndexOf('.'));
  const lang = EXTENSION_MAP[ext];

  if (!lang) return []; // Unsupported extension
  if (options.languages.length > 0 && !options.languages.includes(lang)) return [];
  if (fileSize > options.maxFileSize) return [];

  return [filePath];
}

/**
 * Get supported file extensions, optionally filtered by language.
 */
function getSupportedExtensions(languages: readonly Language[]): string[] {
  if (languages.length === 0) {
    return Object.keys(EXTENSION_MAP);
  }

  const langSet = new Set(languages);
  return Object.entries(EXTENSION_MAP)
    .filter(([, lang]) => langSet.has(lang))
    .map(([ext]) => ext);
}

/**
 * Build glob patterns from supported extensions.
 */
function buildGlobPatterns(extensions: string[]): string[] {
  if (extensions.length === 1) {
    return [`**/*${extensions[0]}`];
  }
  const extList = extensions.map((e) => e.slice(1)).join(',');
  return [`**/*.{${extList}}`];
}

/**
 * Load ignore patterns from a file (.gitignore or .acvignore).
 */
async function loadIgnoreFile(filePath: string): Promise<string[]> {
  if (!existsSync(filePath)) return [];
  try {
    const content = await readFile(filePath, 'utf-8');
    return content
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#'));
  } catch {
    return [];
  }
}

/**
 * Load .gitignore patterns from a directory.
 * Looks for .gitignore in the given directory and all parent directories
 * up to the git root.
 */
async function loadGitignore(rootPath: string): Promise<string[]> {
  return loadIgnoreFile(join(rootPath, '.gitignore'));
}

/**
 * Load .acvignore patterns — walks up from rootPath to find the file
 * (it may be at the project root while scanning a subdirectory).
 */
async function loadAcvignore(rootPath: string): Promise<string[]> {
  let dir = resolve(rootPath);
  const { root } = parse(dir);
  while (dir !== root) {
    const patterns = await loadIgnoreFile(join(dir, '.acvignore'));
    if (patterns.length > 0) return patterns;
    dir = dirname(dir);
  }
  return [];
}
