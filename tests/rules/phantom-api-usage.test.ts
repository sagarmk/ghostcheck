/**
 * Unit tests for acv/phantom-api rule
 *
 * Tests the detection of non-existent API usage on known Node.js modules
 * and common JavaScript objects. The rule detects:
 *   1. Non-existent methods on Node.js built-in modules (fs, crypto, path, etc.)
 *   2. Common hallucinated global/prototype methods (JSON.tryParse, Promise.delay, etc.)
 *
 * Rule ID: acv/phantom-api
 * Severity: warn
 * Category: ai-specific
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { RuleRegistry } from '../../src/rules/registry.js';
import { RuleEngine, type RuleEngineRunOptions } from '../../src/rules/engine.js';
import { phantomApiUsageRule } from '../../src/rules/definitions/phantom-api-usage.js';
import { createAcvConfig } from '../helpers/factories.js';
import type { ASTNode, Finding, AcvConfig } from '../../src/core/types.js';

// =============================================================================
// Helpers
// =============================================================================

function createProgramNode(sourceText: string): ASTNode {
  return {
    type: 'Program',
    start: { line: 1, column: 1, offset: 0 },
    end: { line: 1, column: sourceText.length + 1, offset: sourceText.length },
  };
}

function runRule(
  sourceText: string,
  filePath = '/test/file.ts',
  configOverrides: Partial<AcvConfig> = {},
): readonly Finding[] {
  const registry = new RuleRegistry();
  registry.register(phantomApiUsageRule);
  const engine = new RuleEngine(registry);
  const config = createAcvConfig(configOverrides);

  return engine.run({
    filePath,
    language: 'typescript',
    ast: createProgramNode(sourceText),
    sourceText,
    config,
  });
}

function readFixture(name: string): string {
  const fixturePath = path.join(__dirname, '..', 'fixtures', name);
  return fs.readFileSync(fixturePath, 'utf-8');
}

// =============================================================================
// Tests
// =============================================================================

describe('acv/phantom-api', () => {
  describe('Rule metadata', () => {
    it('should have correct rule ID', () => {
      expect(phantomApiUsageRule.id).toBe('acv/phantom-api');
    });

    it('should have severity warn', () => {
      expect(phantomApiUsageRule.defaultSeverity).toBe('warn');
    });

    it('should be in ai-specific category', () => {
      expect(phantomApiUsageRule.category).toBe('ai-specific');
    });

    it('should support javascript and typescript', () => {
      expect(phantomApiUsageRule.languages).toContain('javascript');
      expect(phantomApiUsageRule.languages).toContain('typescript');
    });

    it('should have meta with description', () => {
      expect(phantomApiUsageRule.meta.description).toBeTruthy();
    });
  });

  describe('Node.js fs module — phantom methods', () => {
    it('should detect fs.readFilePromise (hallucinated)', () => {
      const source = `
import fs from 'fs';
const data = await fs.readFilePromise('file.txt');
      `.trim();
      const findings = runRule(source);

      expect(findings.length).toBeGreaterThanOrEqual(1);
      const f = findings.find((f) => f.message.includes('readFilePromise'));
      expect(f).toBeDefined();
      expect(f!.ruleId).toBe('acv/phantom-api');
      expect(f!.severity).toBe('warn');
    });

    it('should suggest fs.promises.readFile for fs.readFilePromise', () => {
      const source = `
import fs from 'fs';
const data = await fs.readFilePromise('file.txt');
      `.trim();
      const findings = runRule(source);

      const f = findings.find((f) => f.message.includes('readFilePromise'));
      expect(f).toBeDefined();
      expect(f!.message).toContain('fs.promises.readFile');
    });

    it('should detect fs.writeFileAsync (hallucinated)', () => {
      const source = `
import fs from 'fs';
await fs.writeFileAsync('out.json', data);
      `.trim();
      const findings = runRule(source);

      const f = findings.find((f) => f.message.includes('writeFileAsync'));
      expect(f).toBeDefined();
    });

    it('should detect fs.deleteFile (hallucinated)', () => {
      const source = `
import fs from 'fs';
await fs.deleteFile('temp.json');
      `.trim();
      const findings = runRule(source);

      const f = findings.find((f) => f.message.includes('deleteFile'));
      expect(f).toBeDefined();
      expect(f!.message).toContain('fs.unlink');
    });

    it('should NOT flag valid fs methods', () => {
      const source = `
import fs from 'fs';
const data = fs.readFileSync('file.txt', 'utf-8');
fs.writeFileSync('out.txt', data);
const exists = fs.existsSync('test.txt');
      `.trim();
      const findings = runRule(source);

      const fsFindings = findings.filter(
        (f) => f.message.includes('"fs"') && f.ruleId === 'acv/phantom-api',
      );
      expect(fsFindings).toHaveLength(0);
    });
  });

  describe('Node.js crypto module — phantom methods', () => {
    it('should detect crypto.generateHash (hallucinated)', () => {
      const source = `
import crypto from 'crypto';
const hash = crypto.generateHash('sha256', data);
      `.trim();
      const findings = runRule(source);

      const f = findings.find((f) => f.message.includes('generateHash'));
      expect(f).toBeDefined();
      expect(f!.message).toContain('crypto.createHash');
    });

    it('should detect crypto.hashPassword (hallucinated)', () => {
      const source = `
import crypto from 'crypto';
const hashed = crypto.hashPassword('mypassword');
      `.trim();
      const findings = runRule(source);

      const f = findings.find((f) => f.message.includes('hashPassword'));
      expect(f).toBeDefined();
    });

    it('should NOT flag valid crypto methods', () => {
      const source = `
import crypto from 'crypto';
const hash = crypto.createHash('sha256').update('data').digest('hex');
const uuid = crypto.randomUUID();
const bytes = crypto.randomBytes(32);
      `.trim();
      const findings = runRule(source);

      const cryptoFindings = findings.filter(
        (f) => f.message.includes('"crypto"') && f.ruleId === 'acv/phantom-api',
      );
      expect(cryptoFindings).toHaveLength(0);
    });
  });

  describe('Node.js path module — phantom methods', () => {
    it('should detect path.getExtension (hallucinated)', () => {
      const source = `
import path from 'path';
const ext = path.getExtension('file.txt');
      `.trim();
      const findings = runRule(source);

      const f = findings.find((f) => f.message.includes('getExtension'));
      expect(f).toBeDefined();
      expect(f!.message).toContain('path.extname');
    });

    it('should detect path.getFilename (hallucinated)', () => {
      const source = `
import path from 'path';
const name = path.getFilename('/home/user/file.txt');
      `.trim();
      const findings = runRule(source);

      const f = findings.find((f) => f.message.includes('getFilename'));
      expect(f).toBeDefined();
    });

    it('should detect path.combine (hallucinated)', () => {
      const source = `
import path from 'path';
const combined = path.combine('/home', 'user');
      `.trim();
      const findings = runRule(source);

      const f = findings.find((f) => f.message.includes('combine'));
      expect(f).toBeDefined();
      expect(f!.message).toContain('path.join');
    });

    it('should NOT flag valid path methods', () => {
      const source = `
import path from 'path';
const ext = path.extname('file.txt');
const base = path.basename('/home/file.txt');
const dir = path.dirname('/home/file.txt');
const joined = path.join('/home', 'user');
const resolved = path.resolve('.');
      `.trim();
      const findings = runRule(source);

      const pathFindings = findings.filter(
        (f) => f.message.includes('"path"') && f.ruleId === 'acv/phantom-api',
      );
      expect(pathFindings).toHaveLength(0);
    });
  });

  describe('node: prefix imports', () => {
    it('should detect phantom APIs with node: prefix imports', () => {
      const source = `
import fs from 'node:fs';
const data = await fs.readFilePromise('file.txt');
      `.trim();
      const findings = runRule(source);

      const f = findings.find((f) => f.message.includes('readFilePromise'));
      expect(f).toBeDefined();
    });
  });

  describe('require() imports', () => {
    it('should detect phantom APIs with require()', () => {
      const source = `
const fs = require('fs');
const data = fs.readFilePromise('file.txt');
      `.trim();
      const findings = runRule(source);

      const f = findings.find((f) => f.message.includes('readFilePromise'));
      expect(f).toBeDefined();
    });
  });

  describe('Hallucinated global/prototype methods', () => {
    it('should detect JSON.tryParse()', () => {
      const source = `const parsed = JSON.tryParse('{"key": "value"}');`;
      const findings = runRule(source);

      const f = findings.find((f) => f.message.includes('JSON.tryParse'));
      expect(f).toBeDefined();
      expect(f!.suggestedFix).toContain('try/catch');
    });

    it('should detect JSON.safeParse()', () => {
      const source = `const parsed = JSON.safeParse('{"key": "value"}');`;
      const findings = runRule(source);

      const f = findings.find((f) => f.message.includes('JSON.safeParse'));
      expect(f).toBeDefined();
    });

    it('should detect Promise.delay()', () => {
      const source = `await Promise.delay(1000);`;
      const findings = runRule(source);

      const f = findings.find((f) => f.message.includes('Promise.delay'));
      expect(f).toBeDefined();
      expect(f!.suggestedFix).toContain('setTimeout');
    });

    it('should detect Promise.sleep()', () => {
      const source = `await Promise.sleep(500);`;
      const findings = runRule(source);

      const f = findings.find((f) => f.message.includes('Promise.sleep'));
      expect(f).toBeDefined();
    });

    it('should detect Promise.wait()', () => {
      const source = `await Promise.wait(200);`;
      const findings = runRule(source);

      const f = findings.find((f) => f.message.includes('Promise.wait'));
      expect(f).toBeDefined();
    });

    it('should detect Promise.map()', () => {
      const source = `const results = await Promise.map(items, fn);`;
      const findings = runRule(source);

      const f = findings.find((f) => f.message.includes('Promise.map'));
      expect(f).toBeDefined();
      expect(f!.suggestedFix).toContain('Promise.all');
    });

    it('should detect Promise.each()', () => {
      const source = `await Promise.each(items, processItem);`;
      const findings = runRule(source);

      const f = findings.find((f) => f.message.includes('Promise.each'));
      expect(f).toBeDefined();
    });

    it('should detect Math.clamp()', () => {
      const source = `const clamped = Math.clamp(5, 0, 10);`;
      const findings = runRule(source);

      const f = findings.find((f) => f.message.includes('Math.clamp'));
      expect(f).toBeDefined();
      expect(f!.suggestedFix).toContain('Math.min');
    });

    it('should detect Math.lerp()', () => {
      const source = `const val = Math.lerp(0, 100, 0.5);`;
      const findings = runRule(source);

      const f = findings.find((f) => f.message.includes('Math.lerp'));
      expect(f).toBeDefined();
    });

    it('should detect Number.isFloat()', () => {
      const source = `const isF = Number.isFloat(3.14);`;
      const findings = runRule(source);

      const f = findings.find((f) => f.message.includes('Number.isFloat'));
      expect(f).toBeDefined();
    });

    it('should detect Array.flatDeep()', () => {
      const source = `const flat = Array.flatDeep([1, [2, [3]]]);`;
      const findings = runRule(source);

      const f = findings.find((f) => f.message.includes('flatDeep'));
      expect(f).toBeDefined();
      expect(f!.suggestedFix).toContain('flat');
    });

    it('should detect Object.isEmpty()', () => {
      const source = `const empty = Object.isEmpty({});`;
      const findings = runRule(source);

      const f = findings.find((f) => f.message.includes('Object.isEmpty'));
      expect(f).toBeDefined();
    });

    it('should detect .toCapitalize() on strings', () => {
      const source = `const cap = str.toCapitalize();`;
      const findings = runRule(source);

      const f = findings.find((f) => f.message.includes('toCapitalize'));
      expect(f).toBeDefined();
    });

    it('should detect .toCamelCase() on strings', () => {
      const source = `const camel = str.toCamelCase();`;
      const findings = runRule(source);

      const f = findings.find((f) => f.message.includes('toCamelCase'));
      expect(f).toBeDefined();
    });

    it('should detect .toSnakeCase() on strings', () => {
      const source = `const snake = str.toSnakeCase();`;
      const findings = runRule(source);

      const f = findings.find((f) => f.message.includes('toSnakeCase'));
      expect(f).toBeDefined();
    });

    it('should detect .toKebabCase() on strings', () => {
      const source = `const kebab = str.toKebabCase();`;
      const findings = runRule(source);

      const f = findings.find((f) => f.message.includes('toKebabCase'));
      expect(f).toBeDefined();
    });

    it('should detect .isNullOrUndefined()', () => {
      const source = `if (value.isNullOrUndefined()) { return; }`;
      const findings = runRule(source);

      const f = findings.find((f) => f.message.includes('isNullOrUndefined'));
      expect(f).toBeDefined();
    });

    it('should detect .isNullOrEmpty()', () => {
      const source = `if (str.isNullOrEmpty()) { return; }`;
      const findings = runRule(source);

      const f = findings.find((f) => f.message.includes('isNullOrEmpty'));
      expect(f).toBeDefined();
    });

    it('should detect .trimAll()', () => {
      const source = `const trimmed = str.trimAll();`;
      const findings = runRule(source);

      const f = findings.find((f) => f.message.includes('trimAll'));
      expect(f).toBeDefined();
    });
  });

  describe('Correct severity and metadata', () => {
    it('should report severity warn for module API findings', () => {
      const source = `
import fs from 'fs';
fs.readFilePromise('x');
      `.trim();
      const findings = runRule(source);

      expect(findings.length).toBeGreaterThanOrEqual(1);
      expect(findings[0]!.severity).toBe('warn');
    });

    it('should report severity warn for hallucinated method findings', () => {
      const source = `JSON.tryParse('{}');`;
      const findings = runRule(source);

      expect(findings.length).toBeGreaterThanOrEqual(1);
      expect(findings[0]!.severity).toBe('warn');
    });

    it('should report correct line numbers', () => {
      const source = `const a = 1;
const b = 2;
const parsed = JSON.tryParse('{}');
const c = 3;`;
      const findings = runRule(source);

      const f = findings.find((f) => f.message.includes('JSON.tryParse'));
      expect(f).toBeDefined();
      expect(f!.line).toBe(3);
    });

    it('should include codeSnippet', () => {
      const source = `
import fs from 'fs';
const data = fs.readFilePromise('file.txt');
      `.trim();
      const findings = runRule(source);

      expect(findings.length).toBeGreaterThanOrEqual(1);
      expect(findings[0]!.codeSnippet).toBeTruthy();
    });

    it('should include suggestedFix for known hallucinations', () => {
      const source = `
import crypto from 'crypto';
crypto.generateHash('sha256', 'data');
      `.trim();
      const findings = runRule(source);

      const f = findings.find((f) => f.message.includes('generateHash'));
      expect(f).toBeDefined();
      expect(f!.suggestedFix).toBeTruthy();
    });

    it('should have confidence > 0 for all findings', () => {
      const source = `
import fs from 'fs';
fs.readFilePromise('x');
JSON.tryParse('{}');
      `.trim();
      const findings = runRule(source);

      for (const f of findings) {
        expect(f.confidence).toBeGreaterThan(0);
        expect(f.confidence).toBeLessThanOrEqual(1);
      }
    });
  });

  describe('Negative detection — clean code produces no findings', () => {
    it('should NOT flag valid standard API usage', () => {
      const source = `
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const data = fs.readFileSync('file.txt', 'utf-8');
const ext = path.extname('file.txt');
const hash = crypto.createHash('sha256').update(data).digest('hex');
JSON.parse('{}');
JSON.stringify({});
Promise.all([]);
Promise.resolve(42);
Math.min(1, 2);
Math.max(3, 4);
Math.floor(3.5);
Number.isInteger(42);
Number.isFinite(42);
Array.isArray([]);
Object.keys({});
Object.values({});
      `.trim();
      const findings = runRule(source);

      expect(findings).toHaveLength(0);
    });

    it('should produce zero findings for clean fixture', () => {
      const source = readFixture('clean-file.fixture.ts');
      const findings = runRule(source);

      expect(findings).toHaveLength(0);
    });

    it('should NOT flag methods inside comments', () => {
      const source = `
import fs from 'fs';
// fs.readFilePromise is not real
/* crypto.generateHash is not real */
const data = fs.readFileSync('file.txt', 'utf-8');
      `.trim();
      const findings = runRule(source);

      // Module-based findings should be skipped for comment lines
      const moduleFindingsOnComments = findings.filter(
        (f) => f.message.includes('readFilePromise') && f.ruleId === 'acv/phantom-api',
      );
      expect(moduleFindingsOnComments).toHaveLength(0);
    });
  });

  describe('Edge cases', () => {
    it('should handle empty source', () => {
      const findings = runRule('');
      expect(findings).toHaveLength(0);
    });

    it('should handle source with only comments', () => {
      const source = `
// Just comments here
/* No real code */
      `.trim();
      const findings = runRule(source);
      expect(findings).toHaveLength(0);
    });

    it('should handle source with no imports (only global patterns)', () => {
      const source = `
const parsed = JSON.tryParse('{}');
const clamped = Math.clamp(5, 0, 10);
      `.trim();
      const findings = runRule(source);

      // Should still detect hallucinated global methods
      expect(findings.length).toBeGreaterThanOrEqual(2);
    });

    it('should handle aliased imports', () => {
      const source = `
import * as fileSystem from 'fs';
const data = fileSystem.readFilePromise('file.txt');
      `.trim();
      const findings = runRule(source);

      const f = findings.find((f) => f.message.includes('readFilePromise'));
      expect(f).toBeDefined();
    });

    it('should handle var/let requires', () => {
      const source = `
var fs = require('fs');
let data = fs.readFilePromise('x');
      `.trim();
      const findings = runRule(source);

      const f = findings.find((f) => f.message.includes('readFilePromise'));
      expect(f).toBeDefined();
    });

    it('should handle multiple phantom APIs on different modules', () => {
      const source = `
import fs from 'fs';
import crypto from 'crypto';
import path from 'path';
fs.readFilePromise('x');
crypto.generateHash('sha256', 'data');
path.getExtension('file.txt');
      `.trim();
      const findings = runRule(source);

      expect(findings.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('Fixture file — phantom-apis.fixture.ts', () => {
    it('should detect multiple phantom APIs in the fixture', () => {
      const source = readFixture('phantom-apis.fixture.ts');
      const findings = runRule(source);

      // The fixture has fs.readFilePromise, fs.writeFileAsync, fs.deleteFile,
      // crypto.generateHash, crypto.hashPassword, path.getExtension,
      // path.getFilename, path.combine, JSON.tryParse, Promise.delay,
      // Math.clamp, Array.flatDeep
      expect(findings.length).toBeGreaterThanOrEqual(6);
    });

    it('should have all findings with ruleId acv/phantom-api', () => {
      const source = readFixture('phantom-apis.fixture.ts');
      const findings = runRule(source);

      for (const f of findings) {
        expect(f.ruleId).toBe('acv/phantom-api');
      }
    });

    it('should have all findings with severity warn', () => {
      const source = readFixture('phantom-apis.fixture.ts');
      const findings = runRule(source);

      for (const f of findings) {
        expect(f.severity).toBe('warn');
      }
    });
  });

  describe('Fixture file — mixed-issues.fixture.ts', () => {
    it('should detect phantom APIs in the mixed fixture', () => {
      const source = readFixture('mixed-issues.fixture.ts');
      const findings = runRule(source);

      // Should find fs.readFilePromise, crypto.generateHash,
      // JSON.tryParse, Math.clamp
      expect(findings.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('Config interaction', () => {
    it('should not produce findings when rule is set to off', () => {
      const source = `
import fs from 'fs';
fs.readFilePromise('x');
      `.trim();
      const findings = runRule(source, '/test/file.ts', {
        rules: { 'acv/phantom-api': 'off' },
      });

      expect(findings).toHaveLength(0);
    });

    it('should not produce findings when ai-specific category is disabled', () => {
      const source = `
import fs from 'fs';
fs.readFilePromise('x');
      `.trim();
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
