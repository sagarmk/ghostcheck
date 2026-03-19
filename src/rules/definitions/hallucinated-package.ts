/**
 * Rule: hallucinated-package
 *
 * Detects imports of packages that likely don't exist on npm —
 * a common AI hallucination pattern where the model invents package names.
 *
 * Rule ID: acv/hallucinated-package
 * Severity: error
 * Category: ai-specific
 *
 * Logic:
 *   1. Extract all imports from the source file
 *   2. Filter to bare specifiers only (skip relative, builtins, path aliases)
 *   3. Check each against the project's package.json dependencies
 *   4. Check each against a curated list of well-known npm packages
 *   5. Flag anything not found as a potential hallucination
 *   6. Provide Levenshtein-based "Did you mean?" suggestions
 *
 * The NpmRegistryVerifier can be used as a post-processing step
 * for online verification of flagged packages.
 */

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { builtinModules } from 'node:module';

import type {
  Rule,
  RuleContext,
  RuleVisitor,
  ASTNode,
  ActiveSeverity,
} from '../../core/types.js';
import {
  extractImports,
  isBareSpecifier,
  getPackageName,
} from '../../parser/import-extractor.js';

// =============================================================================
// Node.js built-in modules
// =============================================================================

const NODE_BUILTINS = new Set<string>([
  ...builtinModules,
  ...builtinModules.map((m) => `node:${m}`),
  // Subpath imports for common builtins
  'fs/promises',
  'dns/promises',
  'readline/promises',
  'stream/promises',
  'stream/consumers',
  'stream/web',
  'timers/promises',
  'util/types',
  'path/posix',
  'path/win32',
  'assert/strict',
  'inspector/promises',
]);

// =============================================================================
// Popular npm packages (known to exist — avoids false positives)
// =============================================================================

/* eslint-disable @typescript-eslint/no-unused-vars */
const POPULAR_PACKAGES = new Set<string>([
  // Frameworks & runtimes
  'react', 'react-dom', 'react-router', 'react-router-dom', 'next', 'gatsby',
  'vue', 'nuxt', 'svelte', '@sveltejs/kit', 'angular', '@angular/core',
  '@angular/common', '@angular/router', 'express', 'fastify', 'koa', 'hapi',
  '@hapi/hapi', 'nest', '@nestjs/core', '@nestjs/common', 'restify',
  // Build tools
  'webpack', 'webpack-cli', 'webpack-dev-server', 'rollup', 'vite', 'esbuild',
  'parcel', 'turbo', 'tsup', 'unbuild', 'babel', '@babel/core', '@babel/preset-env',
  '@babel/preset-typescript', '@babel/preset-react',
  // TypeScript
  'typescript', 'tslib', 'ts-node', 'tsx', '@types/node', '@types/react',
  '@types/express', '@types/jest', '@types/mocha',
  // Testing
  'jest', 'vitest', 'mocha', 'chai', 'sinon', 'ava', 'tap', 'jasmine',
  '@jest/globals', 'supertest', '@testing-library/react', '@testing-library/jest-dom',
  '@testing-library/dom', 'cypress', 'playwright', '@playwright/test', 'puppeteer',
  'nock', 'msw',
  // Linting & formatting
  'eslint', 'prettier', 'stylelint', 'tslint', '@typescript-eslint/parser',
  '@typescript-eslint/eslint-plugin', 'eslint-plugin-react', 'eslint-plugin-import',
  // HTTP clients
  'axios', 'node-fetch', 'got', 'superagent', 'undici', 'ky', 'ofetch',
  'cross-fetch', 'isomorphic-fetch', 'whatwg-fetch',
  // Utility libraries
  'lodash', 'lodash-es', 'underscore', 'ramda', 'immer', 'immutable',
  'rxjs', 'date-fns', 'dayjs', 'moment', 'luxon', 'classnames', 'clsx',
  'uuid', 'nanoid', 'cuid', 'shortid',
  // CLI
  'commander', 'yargs', 'meow', 'cac', 'minimist', 'arg', 'inquirer',
  'prompts', 'chalk', 'ora', 'ink', 'boxen', 'cli-table3', 'figures',
  'log-symbols', 'listr2', 'debug', 'colors',
  // Data validation
  'zod', 'joi', 'yup', 'ajv', 'superstruct', 'io-ts', 'class-validator',
  'class-transformer', 'valibot',
  // Databases
  'mongoose', 'sequelize', 'typeorm', 'prisma', '@prisma/client', 'knex',
  'pg', 'mysql', 'mysql2', 'mongodb', 'redis', 'ioredis', 'better-sqlite3',
  'sqlite3', 'drizzle-orm', 'kysely',
  // Auth & security
  'jsonwebtoken', 'bcrypt', 'bcryptjs', 'passport', 'helmet', 'cors',
  'cookie-parser', 'express-session', 'csurf', 'jose', 'argon2',
  // File & process
  'fs-extra', 'glob', 'globby', 'fast-glob', 'chokidar', 'rimraf', 'mkdirp',
  'del', 'cpy', 'execa', 'shelljs', 'cross-spawn', 'cross-env', 'dotenv',
  'cosmiconfig', 'rc', 'conf',
  // Logging
  'winston', 'pino', 'bunyan', 'log4js', 'morgan', 'signale',
  // Web
  'socket.io', 'socket.io-client', 'ws', 'body-parser', 'multer', 'formidable',
  'compression', 'serve-static', 'http-proxy-middleware', 'express-rate-limit',
  // Templating & parsing
  'handlebars', 'ejs', 'pug', 'nunjucks', 'mustache', 'marked', 'markdown-it',
  'cheerio', 'jsdom', 'xml2js', 'fast-xml-parser', 'csv-parse', 'csv-stringify',
  'yaml', 'toml', 'ini',
  // Image & media
  'sharp', 'jimp', 'canvas', 'pdf-lib', 'pdfkit',
  // Cloud & services
  'aws-sdk', '@aws-sdk/client-s3', '@aws-sdk/client-dynamodb', 'firebase',
  'firebase-admin', 'stripe', 'twilio', '@sendgrid/mail', 'nodemailer',
  // GraphQL
  'graphql', 'apollo-server', '@apollo/server', '@apollo/client',
  'graphql-tag', 'type-graphql', 'urql',
  // State management
  'redux', '@reduxjs/toolkit', 'mobx', 'zustand', 'jotai', 'recoil',
  'pinia', 'vuex', 'xstate', 'valtio', 'nanostores',
  // Styling
  'styled-components', '@emotion/react', '@emotion/styled', 'tailwindcss',
  'postcss', 'autoprefixer', 'sass', 'less', 'css-loader', 'style-loader',
  // Queues & workers
  'bull', 'bullmq', 'bee-queue', 'agenda', 'amqplib', 'kafkajs',
  // Misc popular
  'semver', 'mime', 'mime-types', 'qs', 'query-string', 'form-data',
  'async', 'bluebird', 'p-limit', 'p-queue', 'p-retry', 'p-map',
  'lru-cache', 'keyv', 'flat', 'deepmerge', 'object-assign', 'ignore',
  'ansi-styles', 'supports-color', 'wrap-ansi', 'string-width', 'strip-ansi',
  'signal-exit', 'find-up', 'locate-path', 'path-exists', 'resolve-from',
  'camelcase', 'change-case', 'pluralize', 'slugify', 'sanitize-html',
  'dompurify', 'he', 'entities', 'escape-html', 'xss',
  'nodemon', 'pm2', 'concurrently', 'npm-run-all', 'husky', 'lint-staged',
  'commitlint', '@commitlint/cli', '@commitlint/config-conventional',
  'simple-git', 'isomorphic-git', 'open', 'clipboardy', 'envinfo',
  'source-map', 'source-map-support', 'stacktrace-js',
  '@swc/core', '@swc/cli', 'sucrase',
  'zx', 'tsx', 'jiti', 'pkg', 'nexe', 'electron', 'tauri',
  'three', 'd3', 'chart.js', 'echarts', 'highcharts',
  'socket.io-adapter', 'engine.io', 'formik', 'react-hook-form',
  'framer-motion', 'react-spring', '@headlessui/react', '@radix-ui/react-dialog',
  'lucide-react', 'react-icons', '@heroicons/react',
  'i18next', 'react-i18next', 'intl-messageformat',
  'storybook', '@storybook/react', 'chromatic',
  'sentry', '@sentry/node', '@sentry/react', '@sentry/browser',
  'prom-client', 'datadog-metrics', 'newrelic',
  'nats', 'mqtt', 'zeromq',
  'leveldown', 'levelup', 'rocksdb', 'nedb',
  'got', 'bent', 'phin', 'needle', 'httpie',
  'json5', 'hjson', 'comment-json',
  'cron', 'node-cron', 'node-schedule', 'later',
  'tmp', 'temp', 'tempfile', 'os-tmpdir',
  'which', 'npm-which', 'path-key',
  'picomatch', 'micromatch', 'minimatch', 'anymatch', 'braces',
  'fill-range', 'to-regex-range', 'is-glob', 'glob-parent',
]);
/* eslint-enable @typescript-eslint/no-unused-vars */

// =============================================================================
// Levenshtein distance
// =============================================================================

/**
 * Compute the Levenshtein edit distance between two strings.
 * Used to suggest "Did you mean X?" for hallucinated package names.
 */
function levenshteinDistance(a: string, b: string): number {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  // Use two-row optimization instead of full matrix
  let prevRow = new Array<number>(b.length + 1);
  let currRow = new Array<number>(b.length + 1);

  for (let j = 0; j <= b.length; j++) {
    prevRow[j] = j;
  }

  for (let i = 1; i <= a.length; i++) {
    currRow[0] = i;

    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      currRow[j] = Math.min(
        (prevRow[j] ?? 0) + 1,           // deletion
        (currRow[j - 1] ?? 0) + 1,       // insertion
        (prevRow[j - 1] ?? 0) + cost,    // substitution
      );
    }

    // Swap rows
    [prevRow, currRow] = [currRow, prevRow];
  }

  return prevRow[b.length] ?? a.length;
}

/**
 * Find the closest matching package name from the popular list.
 * Returns null if no close match found (distance > 3).
 */
function findClosestMatch(
  pkg: string,
  candidates: ReadonlySet<string>,
): { match: string; distance: number } | null {
  let bestMatch: string | null = null;
  let bestDistance = Infinity;
  const maxDistance = 3; // Don't suggest if too different

  for (const candidate of candidates) {
    // Quick length filter — can't be close if lengths differ too much
    if (Math.abs(candidate.length - pkg.length) > maxDistance) continue;

    const dist = levenshteinDistance(pkg.toLowerCase(), candidate.toLowerCase());
    if (dist < bestDistance && dist <= maxDistance) {
      bestDistance = dist;
      bestMatch = candidate;
    }
  }

  return bestMatch !== null ? { match: bestMatch, distance: bestDistance } : null;
}

// =============================================================================
// Package.json loading
// =============================================================================

/**
 * Cache for loaded package.json dependency sets.
 * Key: absolute path to package.json file.
 */
const packageJsonCache = new Map<string, Set<string>>();

/**
 * Find and load the nearest package.json, returning its dependency set.
 * Walks up the directory tree from the given file's directory.
 */
function loadPackageJsonDeps(filePath: string): Set<string> {
  let dir = dirname(filePath);

  while (dir.length > 0) {
    const pkgPath = join(dir, 'package.json');

    // Check cache
    const cached = packageJsonCache.get(pkgPath);
    if (cached) return cached;

    try {
      const raw = readFileSync(pkgPath, 'utf-8');
      const pkg = JSON.parse(raw) as Record<string, unknown>;
      const deps = new Set<string>();

      const sections = [
        'dependencies',
        'devDependencies',
        'peerDependencies',
        'optionalDependencies',
      ] as const;

      for (const section of sections) {
        const sectionDeps = pkg[section];
        if (sectionDeps && typeof sectionDeps === 'object') {
          for (const name of Object.keys(
            sectionDeps as Record<string, unknown>,
          )) {
            deps.add(name);
          }
        }
      }

      packageJsonCache.set(pkgPath, deps);
      return deps;
    } catch {
      // No package.json here, try parent directory
      const parent = dirname(dir);
      if (parent === dir) break; // Reached filesystem root
      dir = parent;
    }
  }

  // No package.json found — return empty set
  return new Set<string>();
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Check if an import specifier is a TypeScript path alias.
 * Common patterns: @/..., ~/..., #/...
 */
function isPathAlias(specifier: string): boolean {
  // Scoped npm packages start with @ and contain /
  // Path aliases start with @ but often don't have a second segment that looks like a package
  if (specifier.startsWith('@/') || specifier.startsWith('~/') || specifier.startsWith('#')) {
    return true;
  }
  return false;
}

/**
 * Extract the code line from source text at the given 1-based line number.
 */
function getLineText(source: string, lineNum: number): string {
  const lines = source.split('\n');
  const idx = lineNum - 1;
  if (idx >= 0 && idx < lines.length) {
    return lines[idx] ?? '';
  }
  return '';
}

// =============================================================================
// Rule definition
// =============================================================================

export const hallucinatedPackageRule: Rule = {
  id: 'acv/hallucinated-package',
  name: 'Hallucinated Package',
  category: 'ai-specific',
  defaultSeverity: 'error',
  languages: ['javascript', 'typescript'],
  meta: {
    description:
      'Detects imports of packages that likely do not exist on npm. ' +
      'AI code generators sometimes hallucinate package names that sound plausible ' +
      'but have no corresponding npm package.',
    fixable: false,
    confidence: 0.8,
    falsePositiveRate: 0.15,
    examples: [
      {
        description: 'Hallucinated package import',
        bad: "import { slugify } from 'string-utils-pro';",
        good: "import slugify from 'slugify';",
      },
    ],
  },

  create(context: RuleContext): RuleVisitor {
    const deps = loadPackageJsonDeps(context.filePath);
    const severity = context.config.severity as ActiveSeverity;
    let scanned = false;

    function scanSource(node: ASTNode): void {
      if (scanned) return;
      scanned = true;

      const source = context.getSourceText(node);
      if (!source || source.length === 0) return;

      // Extract all imports from source
      let imports;
      try {
        imports = extractImports(source, context.filePath);
      } catch {
        // If import extraction fails, skip this file
        return;
      }

      for (const imp of imports) {
        // Only check bare specifiers (not relative, not absolute)
        if (!isBareSpecifier(imp.source)) continue;

        // Get the root package name (handle deep imports like 'lodash/merge')
        const pkgName = getPackageName(imp.source);
        if (!pkgName) continue;

        // Skip Node.js built-in modules
        if (NODE_BUILTINS.has(pkgName) || NODE_BUILTINS.has(imp.source)) continue;

        // Skip TypeScript path aliases
        if (isPathAlias(imp.source)) continue;

        // Skip type-only imports (they might reference @types/ packages)
        if (imp.isTypeOnly) continue;

        // Skip if in project's package.json
        if (deps.has(pkgName)) continue;

        // Skip if it's a well-known npm package (exists, just not installed)
        if (POPULAR_PACKAGES.has(pkgName)) continue;

        // This import is suspicious — not in package.json and not in popular list
        const lineText = getLineText(source, imp.line);
        const col = imp.column ?? 1;

        // Try to find a close match for "Did you mean?" suggestion
        const closest = findClosestMatch(pkgName, POPULAR_PACKAGES);

        let message = `Package "${pkgName}" does not exist in project dependencies and is not a known npm package.`;
        let suggestedFix: string | undefined;

        if (closest && closest.distance <= 2) {
          message += ` Did you mean "${closest.match}"?`;
          suggestedFix = `Replace "${pkgName}" with "${closest.match}"`;
        }

        context.report({
          severity,
          ruleName: 'Hallucinated Package',
          message,
          filePath: context.filePath,
          line: imp.line,
          column: col,
          endLine: imp.line,
          endColumn: col + (imp.raw?.length ?? imp.source.length),
          codeSnippet: lineText.trim(),
          fix: closest && closest.distance <= 2
            ? { from: pkgName, to: closest.match }
            : null,
          suggestedFix,
          suggestion: closest
            ? `Package "${closest.match}" exists on npm (edit distance: ${String(closest.distance)})`
            : 'Verify this package exists on npm: https://www.npmjs.com/package/' + encodeURIComponent(pkgName),
          owaspRef: null,
          confidence: closest ? 0.9 : 0.75,
          meta: {
            registryChecked: 'npm (heuristic)',
            ...(closest
              ? {
                  levenshteinDistance: closest.distance,
                  closestMatch: closest.match,
                }
              : {}),
          },
        });
      }
    }

    return {
      Program: scanSource,
      Module: scanSource,
    };
  },
};
