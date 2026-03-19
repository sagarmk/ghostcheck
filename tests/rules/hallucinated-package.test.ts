/**
 * Unit tests for acv/hallucinated-package rule
 *
 * Tests the detection of imports of packages that likely don't exist on npm.
 * The rule checks bare import specifiers against:
 *   1. Node.js built-in modules (skip)
 *   2. Project package.json dependencies (skip)
 *   3. Curated popular packages allowlist (skip)
 *   4. Everything else → flagged as hallucinated
 *   5. Levenshtein suggestions for typos
 *
 * Rule ID: acv/hallucinated-package
 * Severity: error
 * Category: ai-specific
 */

import { describe, it, expect, beforeEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { RuleRegistry } from '../../src/rules/registry.js';
import { RuleEngine, type RuleEngineRunOptions } from '../../src/rules/engine.js';
import { hallucinatedPackageRule } from '../../src/rules/definitions/hallucinated-package.js';
import { createAcvConfig } from '../helpers/factories.js';
import type { ASTNode, Finding, AcvConfig } from '../../src/core/types.js';

// =============================================================================
// Helpers
// =============================================================================

/**
 * Create a Program AST node that wraps the full source text.
 * The rule uses context.getSourceText(node) which slices from node.start.offset
 * to node.end.offset — so we create a node spanning the full source.
 */
function createProgramNode(sourceText: string): ASTNode {
  return {
    type: 'Program',
    start: { line: 1, column: 1, offset: 0 },
    end: { line: 1, column: sourceText.length + 1, offset: sourceText.length },
  };
}

/**
 * Run the hallucinated-package rule against source text.
 */
function runRule(
  sourceText: string,
  filePath = '/test/file.ts',
  configOverrides: Partial<AcvConfig> = {},
): readonly Finding[] {
  const registry = new RuleRegistry();
  registry.register(hallucinatedPackageRule);
  const engine = new RuleEngine(registry);
  const config = createAcvConfig(configOverrides);

  const options: RuleEngineRunOptions = {
    filePath,
    language: 'typescript',
    ast: createProgramNode(sourceText),
    sourceText,
    config,
  };

  return engine.run(options);
}

/**
 * Read a fixture file.
 */
function readFixture(name: string): string {
  const fixturePath = path.join(__dirname, '..', 'fixtures', name);
  return fs.readFileSync(fixturePath, 'utf-8');
}

// =============================================================================
// Tests
// =============================================================================

describe('acv/hallucinated-package', () => {
  describe('Rule metadata', () => {
    it('should have correct rule ID', () => {
      expect(hallucinatedPackageRule.id).toBe('acv/hallucinated-package');
    });

    it('should have severity error', () => {
      expect(hallucinatedPackageRule.defaultSeverity).toBe('error');
    });

    it('should be in ai-specific category', () => {
      expect(hallucinatedPackageRule.category).toBe('ai-specific');
    });

    it('should support javascript and typescript', () => {
      expect(hallucinatedPackageRule.languages).toContain('javascript');
      expect(hallucinatedPackageRule.languages).toContain('typescript');
    });

    it('should have a create function', () => {
      expect(typeof hallucinatedPackageRule.create).toBe('function');
    });

    it('should have meta with description', () => {
      expect(hallucinatedPackageRule.meta.description).toBeTruthy();
      expect(hallucinatedPackageRule.meta.description.length).toBeGreaterThan(10);
    });
  });

  describe('Positive detection — hallucinated packages trigger findings', () => {
    it('should detect a completely made-up package', () => {
      const source = `import { createForm } from 'react-magic-form';`;
      const findings = runRule(source);

      expect(findings.length).toBeGreaterThanOrEqual(1);
      const f = findings.find((f) => f.message.includes('react-magic-form'));
      expect(f).toBeDefined();
      expect(f!.ruleId).toBe('acv/hallucinated-package');
      expect(f!.severity).toBe('error');
      expect(f!.category).toBe('ai-specific');
    });

    it('should detect multiple hallucinated packages', () => {
      const source = `
import { validate } from 'super-validator';
import { aiHelper } from 'ai-helper-utils';
import { createForm } from 'react-magic-form';
      `.trim();
      const findings = runRule(source);

      const packageNames = findings.map((f) => f.message);
      expect(packageNames.some((m) => m.includes('super-validator'))).toBe(true);
      expect(packageNames.some((m) => m.includes('ai-helper-utils'))).toBe(true);
      expect(packageNames.some((m) => m.includes('react-magic-form'))).toBe(true);
    });

    it('should detect hallucinated scoped packages', () => {
      const source = `
import { transform } from '@babel/ai-transforms';
import { compile } from '@webpack/smart-compiler';
      `.trim();
      const findings = runRule(source);

      expect(findings.length).toBeGreaterThanOrEqual(2);
      const messages = findings.map((f) => f.message).join('\n');
      expect(messages).toContain('@babel/ai-transforms');
      expect(messages).toContain('@webpack/smart-compiler');
    });

    it('should report correct line numbers', () => {
      const source = `const x = 1;
import { foo } from 'totally-fake-package-xyz';
const y = 2;`;
      const findings = runRule(source);

      expect(findings.length).toBeGreaterThanOrEqual(1);
      const f = findings.find((f) => f.message.includes('totally-fake-package-xyz'));
      expect(f).toBeDefined();
      expect(f!.line).toBe(2);
    });

    it('should report correct severity (error)', () => {
      const source = `import x from 'nonexistent-package-abc';`;
      const findings = runRule(source);

      expect(findings.length).toBeGreaterThanOrEqual(1);
      expect(findings[0]!.severity).toBe('error');
    });

    it('should detect default imports of hallucinated packages', () => {
      const source = `import superLib from 'super-mega-awesome-lib';`;
      const findings = runRule(source);

      expect(findings.length).toBeGreaterThanOrEqual(1);
      expect(findings[0]!.message).toContain('super-mega-awesome-lib');
    });

    it('should detect namespace imports of hallucinated packages', () => {
      const source = `import * as fakeLib from 'fake-namespace-lib-xyz';`;
      const findings = runRule(source);

      expect(findings.length).toBeGreaterThanOrEqual(1);
      expect(findings[0]!.message).toContain('fake-namespace-lib-xyz');
    });

    it('should detect require() of hallucinated packages', () => {
      const source = `const fake = require('hallucinated-node-package');`;
      const findings = runRule(source);

      expect(findings.length).toBeGreaterThanOrEqual(1);
      expect(findings[0]!.message).toContain('hallucinated-node-package');
    });

    it('should include codeSnippet in findings', () => {
      const source = `import x from 'phantom-package-xyz';`;
      const findings = runRule(source);

      expect(findings.length).toBeGreaterThanOrEqual(1);
      expect(findings[0]!.codeSnippet).toBeTruthy();
    });

    it('should have confidence score', () => {
      const source = `import x from 'nonexistent-abc-def';`;
      const findings = runRule(source);

      expect(findings.length).toBeGreaterThanOrEqual(1);
      expect(findings[0]!.confidence).toBeGreaterThan(0);
      expect(findings[0]!.confidence).toBeLessThanOrEqual(1);
    });
  });

  describe('Negative detection — clean code produces no findings', () => {
    it('should NOT flag Node.js built-in modules', () => {
      const source = `
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import http from 'http';
import os from 'os';
      `.trim();
      const findings = runRule(source);

      expect(findings).toHaveLength(0);
    });

    it('should NOT flag node: prefixed built-ins', () => {
      const source = `
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
      `.trim();
      const findings = runRule(source);

      expect(findings).toHaveLength(0);
    });

    it('should NOT flag subpath built-ins', () => {
      const source = `
import { readFile } from 'fs/promises';
import { resolve as dnsResolve } from 'dns/promises';
      `.trim();
      const findings = runRule(source);

      expect(findings).toHaveLength(0);
    });

    it('should NOT flag popular npm packages', () => {
      const source = `
import express from 'express';
import React from 'react';
import lodash from 'lodash';
import chalk from 'chalk';
import axios from 'axios';
import zod from 'zod';
      `.trim();
      const findings = runRule(source);

      expect(findings).toHaveLength(0);
    });

    it('should NOT flag popular scoped packages', () => {
      const source = `
import { something } from '@angular/core';
import { other } from '@nestjs/common';
import { tool } from '@babel/core';
      `.trim();
      const findings = runRule(source);

      expect(findings).toHaveLength(0);
    });

    it('should NOT flag relative imports', () => {
      const source = `
import { helper } from './utils';
import { config } from '../config';
import { deep } from './deeply/nested/module';
      `.trim();
      const findings = runRule(source);

      expect(findings).toHaveLength(0);
    });

    it('should NOT flag TypeScript path aliases', () => {
      const source = `
import { component } from '@/components/Button';
import { util } from '~/utils/string';
import { config } from '#config';
      `.trim();
      const findings = runRule(source);

      expect(findings).toHaveLength(0);
    });

    it('should NOT flag type-only imports', () => {
      const source = `
import type { SomeType } from 'possibly-nonexistent-types-pkg';
      `.trim();
      const findings = runRule(source);

      expect(findings).toHaveLength(0);
    });

    it('should produce zero findings for clean fixture', () => {
      const source = readFixture('clean-file.fixture.ts');
      const findings = runRule(source);

      expect(findings).toHaveLength(0);
    });
  });

  describe('Levenshtein "Did you mean?" suggestions', () => {
    it('should suggest "lodash" for "lodahs" (distance 2)', () => {
      const source = `import x from 'lodahs';`;
      const findings = runRule(source);

      expect(findings.length).toBeGreaterThanOrEqual(1);
      const f = findings[0]!;
      expect(f.message).toContain('Did you mean');
      expect(f.message).toContain('lodash');
    });

    it('should suggest "express" for "expresss" (distance 1)', () => {
      const source = `import x from 'expresss';`;
      const findings = runRule(source);

      expect(findings.length).toBeGreaterThanOrEqual(1);
      const f = findings[0]!;
      expect(f.message).toContain('Did you mean');
      expect(f.message).toContain('express');
    });

    it('should suggest "react" for "raect" (distance 2)', () => {
      const source = `import x from 'raect';`;
      const findings = runRule(source);

      expect(findings.length).toBeGreaterThanOrEqual(1);
      const f = findings[0]!;
      expect(f.message).toContain('Did you mean');
      expect(f.message).toContain('react');
    });

    it('should provide fix object with from/to for close matches', () => {
      const source = `import x from 'expresss';`;
      const findings = runRule(source);

      expect(findings.length).toBeGreaterThanOrEqual(1);
      const f = findings[0]!;
      expect(f.fix).toBeTruthy();
      expect(f.fix!.from).toBe('expresss');
      expect(f.fix!.to).toBe('express');
    });

    it('should provide suggestedFix text for typos', () => {
      const source = `import x from 'lodahs';`;
      const findings = runRule(source);

      expect(findings.length).toBeGreaterThanOrEqual(1);
      expect(findings[0]!.suggestedFix).toBeDefined();
      expect(findings[0]!.suggestedFix).toContain('lodash');
    });

    it('should NOT suggest for totally unrelated names (distance > 3)', () => {
      const source = `import x from 'zzzzzzz-totally-fake';`;
      const findings = runRule(source);

      expect(findings.length).toBeGreaterThanOrEqual(1);
      const f = findings[0]!;
      // Should not have a "Did you mean" suggestion
      expect(f.message).not.toContain('Did you mean');
      // fix should be null for unrelated names
      expect(f.fix).toBeNull();
    });

    it('should include levenshtein distance in meta for close matches', () => {
      const source = `import x from 'expresss';`;
      const findings = runRule(source);

      expect(findings.length).toBeGreaterThanOrEqual(1);
      const f = findings[0]!;
      expect(f.meta).toBeDefined();
      expect(f.meta!.levenshteinDistance).toBeDefined();
      expect(f.meta!.levenshteinDistance).toBe(1);
    });

    it('should include closestMatch in meta', () => {
      const source = `import x from 'expresss';`;
      const findings = runRule(source);

      expect(findings.length).toBeGreaterThanOrEqual(1);
      const f = findings[0]!;
      expect(f.meta!.closestMatch).toBe('express');
    });
  });

  describe('Edge cases', () => {
    it('should handle empty source', () => {
      const findings = runRule('');
      expect(findings).toHaveLength(0);
    });

    it('should handle source with only comments', () => {
      const source = `
// This is a comment
/* Another comment */
/** JSDoc comment */
      `.trim();
      const findings = runRule(source);
      expect(findings).toHaveLength(0);
    });

    it('should handle minified code', () => {
      const source = `import{a}from'nonexistent-pkg-xyz';import{b}from'express';`;
      const findings = runRule(source);

      // Should detect the nonexistent package but not express
      const fakeFindings = findings.filter((f) =>
        f.message.includes('nonexistent-pkg-xyz'),
      );
      const expressFindings = findings.filter((f) =>
        f.message.includes('express'),
      );
      expect(fakeFindings.length).toBeGreaterThanOrEqual(1);
      expect(expressFindings).toHaveLength(0);
    });

    it('should handle files with no imports', () => {
      const source = `
const x = 1;
const y = 2;
function add(a: number, b: number): number { return a + b; }
      `.trim();
      const findings = runRule(source);
      expect(findings).toHaveLength(0);
    });

    it('should handle dynamic imports of hallucinated packages', () => {
      const source = `const mod = await import('dynamic-fake-package-abc');`;
      const findings = runRule(source);

      // Dynamic imports should also be checked
      const fakeFindings = findings.filter((f) =>
        f.message.includes('dynamic-fake-package-abc'),
      );
      expect(fakeFindings.length).toBeGreaterThanOrEqual(1);
    });

    it('should handle re-exports from hallucinated packages', () => {
      const source = `export { something } from 'fake-reexport-package';`;
      const findings = runRule(source);

      expect(findings.length).toBeGreaterThanOrEqual(1);
      expect(findings[0]!.message).toContain('fake-reexport-package');
    });

    it('should handle multiple imports from the same hallucinated package', () => {
      const source = `
import { a } from 'multi-import-fake-pkg';
import { b } from 'multi-import-fake-pkg';
      `.trim();
      const findings = runRule(source);

      // May produce 1 or 2 findings depending on deduplication
      expect(findings.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Fixture file — hallucinated-imports.fixture.ts', () => {
    it('should detect all hallucinated packages in the fixture', () => {
      const source = readFixture('hallucinated-imports.fixture.ts');
      const findings = runRule(source);

      // The fixture has: react-magic-form, super-validator, ai-helper-utils,
      // @babel/ai-transforms, @webpack/smart-compiler, lodahs, expresss, raect,
      // intl-currency-formatter, pg-pool-manager, react-async-state-manager
      expect(findings.length).toBeGreaterThanOrEqual(5);
    });

    it('should have all findings with ruleId acv/hallucinated-package', () => {
      const source = readFixture('hallucinated-imports.fixture.ts');
      const findings = runRule(source);

      for (const f of findings) {
        expect(f.ruleId).toBe('acv/hallucinated-package');
      }
    });

    it('should have all findings with severity error', () => {
      const source = readFixture('hallucinated-imports.fixture.ts');
      const findings = runRule(source);

      for (const f of findings) {
        expect(f.severity).toBe('error');
      }
    });

    it('should have all findings with category ai-specific', () => {
      const source = readFixture('hallucinated-imports.fixture.ts');
      const findings = runRule(source);

      for (const f of findings) {
        expect(f.category).toBe('ai-specific');
      }
    });
  });

  describe('Fixture file — mixed-issues.fixture.ts', () => {
    it('should detect hallucinated packages in the mixed fixture', () => {
      const source = readFixture('mixed-issues.fixture.ts');
      const findings = runRule(source);

      // Should find at least ai-form-validator and array-magic-utils
      const hallucinated = findings.filter(
        (f) => f.ruleId === 'acv/hallucinated-package',
      );
      expect(hallucinated.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('Config interaction', () => {
    it('should not produce findings when rule is set to off', () => {
      const source = `import x from 'totally-fake-xyz';`;
      const findings = runRule(source, '/test/file.ts', {
        rules: { 'acv/hallucinated-package': 'off' },
      });

      expect(findings).toHaveLength(0);
    });

    it('should not produce findings when ai-specific category is disabled', () => {
      const source = `import x from 'totally-fake-xyz';`;
      const findings = runRule(source, '/test/file.ts', {
        categories: {
          'ai-specific': false,
          security: true,
          correctness: true,
        },
      });

      expect(findings).toHaveLength(0);
    });
  });
});
