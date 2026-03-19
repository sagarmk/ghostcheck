/**
 * Unit tests for acv/unsafe-pattern rule
 *
 * Tests the detection of common security antipatterns:
 *   1. eval() / new Function() — code injection (CWE-95)
 *   2. innerHTML / outerHTML / document.write — XSS (CWE-79)
 *   3. SQL string concatenation / template literals — SQL injection (CWE-89)
 *   4. Hardcoded API keys, passwords, tokens, private keys (CWE-798/321)
 *   5. Disabled TLS verification (CWE-295)
 *
 * Rule ID: acv/unsafe-pattern
 * Severity: warn
 * Category: security
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { RuleRegistry } from '../../src/rules/registry.js';
import { RuleEngine, type RuleEngineRunOptions } from '../../src/rules/engine.js';
import { unsafePatternRule } from '../../src/rules/definitions/unsafe-pattern.js';
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
  filePath = '/src/app/file.ts',
  configOverrides: Partial<AcvConfig> = {},
): readonly Finding[] {
  const registry = new RuleRegistry();
  registry.register(unsafePatternRule);
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

describe('acv/unsafe-pattern', () => {
  describe('Rule metadata', () => {
    it('should have correct rule ID', () => {
      expect(unsafePatternRule.id).toBe('acv/unsafe-pattern');
    });

    it('should have severity warn', () => {
      expect(unsafePatternRule.defaultSeverity).toBe('warn');
    });

    it('should be in security category', () => {
      expect(unsafePatternRule.category).toBe('security');
    });

    it('should support javascript and typescript', () => {
      expect(unsafePatternRule.languages).toContain('javascript');
      expect(unsafePatternRule.languages).toContain('typescript');
    });

    it('should have meta with description', () => {
      expect(unsafePatternRule.meta.description).toBeTruthy();
    });
  });

  // =========================================================================
  // 1. eval() / new Function() — Code Injection (CWE-95)
  // =========================================================================

  describe('eval() usage detection (CWE-95)', () => {
    it('should detect eval() call', () => {
      const source = `const result = eval(userInput);`;
      const findings = runRule(source);

      const f = findings.find((f) => f.message.includes('eval()'));
      expect(f).toBeDefined();
      expect(f!.ruleId).toBe('acv/unsafe-pattern');
      expect(f!.severity).toBe('warn');
      expect(f!.category).toBe('security');
    });

    it('should report CWE-95 in metadata', () => {
      const source = `eval(code);`;
      const findings = runRule(source);

      const f = findings.find((f) => f.message.includes('eval'));
      expect(f).toBeDefined();
      expect(f!.meta).toBeDefined();
      expect(f!.meta!.cweId).toBe('CWE-95');
    });

    it('should report OWASP A03:2021 reference', () => {
      const source = `eval(code);`;
      const findings = runRule(source);

      const f = findings.find((f) => f.message.includes('eval'));
      expect(f).toBeDefined();
      expect(f!.owaspRef).toContain('A03:2021');
    });

    it('should detect eval with whitespace', () => {
      const source = `eval  (userInput);`;
      const findings = runRule(source);

      const f = findings.find((f) => f.message.includes('eval'));
      expect(f).toBeDefined();
    });

    it('should NOT flag eval as a string', () => {
      const source = `const method = 'eval';`;
      const findings = runRule(source);

      const evalFindings = findings.filter((f) => f.message.includes('eval()'));
      expect(evalFindings).toHaveLength(0);
    });
  });

  describe('new Function() detection (CWE-95)', () => {
    it('should detect new Function() call', () => {
      const source = `const fn = new Function('x', code);`;
      const findings = runRule(source);

      const f = findings.find((f) => f.message.includes('new Function'));
      expect(f).toBeDefined();
      expect(f!.meta!.cweId).toBe('CWE-95');
    });

    it('should detect new Function with whitespace', () => {
      const source = `const fn = new  Function  ('x', code);`;
      const findings = runRule(source);

      const f = findings.find((f) => f.message.includes('Function'));
      expect(f).toBeDefined();
    });
  });

  // =========================================================================
  // 2. innerHTML / outerHTML / document.write — XSS (CWE-79)
  // =========================================================================

  describe('innerHTML detection (CWE-79)', () => {
    it('should detect innerHTML assignment', () => {
      const source = `element.innerHTML = userContent;`;
      const findings = runRule(source);

      const f = findings.find((f) => f.message.includes('innerHTML'));
      expect(f).toBeDefined();
      expect(f!.meta!.cweId).toBe('CWE-79');
    });

    it('should detect innerHTML with += operator', () => {
      const source = `element.innerHTML += moreContent;`;
      const findings = runRule(source);

      const f = findings.find((f) => f.message.includes('innerHTML'));
      expect(f).toBeDefined();
    });

    it('should NOT flag innerHTML when sanitized with DOMPurify', () => {
      const source = `element.innerHTML = DOMPurify.sanitize(userContent);`;
      const findings = runRule(source);

      const innerHtmlFindings = findings.filter((f) =>
        f.message.includes('innerHTML'),
      );
      expect(innerHtmlFindings).toHaveLength(0);
    });

    it('should suggest DOMPurify or textContent', () => {
      const source = `el.innerHTML = html;`;
      const findings = runRule(source);

      const f = findings.find((f) => f.message.includes('innerHTML'));
      expect(f).toBeDefined();
      expect(f!.suggestedFix).toBeTruthy();
    });
  });

  describe('outerHTML detection (CWE-79)', () => {
    it('should detect outerHTML assignment', () => {
      const source = `element.outerHTML = newContent;`;
      const findings = runRule(source);

      const f = findings.find((f) => f.message.includes('outerHTML'));
      expect(f).toBeDefined();
      expect(f!.meta!.cweId).toBe('CWE-79');
    });
  });

  describe('document.write detection (CWE-79)', () => {
    it('should detect document.write()', () => {
      const source = `document.write(content);`;
      const findings = runRule(source);

      const f = findings.find((f) => f.message.includes('document.write'));
      expect(f).toBeDefined();
      expect(f!.meta!.cweId).toBe('CWE-79');
    });
  });

  // =========================================================================
  // 3. SQL Injection (CWE-89)
  // =========================================================================

  describe('SQL concatenation detection (CWE-89)', () => {
    it('should detect SQL string concatenation with +', () => {
      const source = `const query = "SELECT * FROM users WHERE id = " + userId;`;
      const findings = runRule(source);

      const f = findings.find((f) => f.message.includes('SQL'));
      expect(f).toBeDefined();
      expect(f!.meta!.cweId).toBe('CWE-89');
    });

    it('should detect INSERT with concatenation', () => {
      const source = `const q = "INSERT INTO logs VALUES (" + data + ")";`;
      const findings = runRule(source);

      const f = findings.find((f) => f.message.includes('SQL'));
      expect(f).toBeDefined();
    });

    it('should detect UPDATE with concatenation', () => {
      const source = `const q = "UPDATE users SET name = " + name;`;
      const findings = runRule(source);

      const f = findings.find((f) => f.message.includes('SQL'));
      expect(f).toBeDefined();
    });

    it('should detect DELETE with concatenation', () => {
      const source = `const q = "DELETE FROM users WHERE id = " + userId;`;
      const findings = runRule(source);

      const f = findings.find((f) => f.message.includes('SQL'));
      expect(f).toBeDefined();
    });

    it('should suggest parameterized queries', () => {
      const source = `const query = "SELECT * FROM users WHERE id = " + userId;`;
      const findings = runRule(source);

      const f = findings.find((f) => f.message.includes('SQL'));
      expect(f).toBeDefined();
      expect(f!.suggestedFix).toContain('parameterized');
    });
  });

  describe('SQL template literal detection (CWE-89)', () => {
    it('should detect SQL with template literal interpolation', () => {
      const source = 'const q = `SELECT * FROM users WHERE id = ${userId}`;';
      const findings = runRule(source);

      const f = findings.find((f) =>
        f.message.includes('SQL') && f.message.includes('template literal'),
      );
      expect(f).toBeDefined();
      expect(f!.meta!.cweId).toBe('CWE-89');
    });
  });

  // =========================================================================
  // 4. Hardcoded Secrets (CWE-798 / CWE-321)
  // =========================================================================

  describe('Hardcoded API key detection (CWE-798)', () => {
    it('should detect hardcoded api_key', () => {
      const source = `const api_key = 'sk-1234567890abcdef1234567890abcdef';`;
      const findings = runRule(source);

      const f = findings.find((f) => f.message.includes('API key'));
      expect(f).toBeDefined();
      expect(f!.meta!.cweId).toBe('CWE-798');
    });

    it('should detect apiKey with = assignment', () => {
      const source = `const apiKey = "abcdefghijklmnopqrstuvwxyz123456";`;
      const findings = runRule(source);

      const f = findings.find((f) => f.message.includes('API key'));
      expect(f).toBeDefined();
    });

    it('should NOT flag api key from environment variables', () => {
      const source = `const apiKey = process.env.API_KEY;`;
      const findings = runRule(source);

      const apiKeyFindings = findings.filter((f) =>
        f.message.includes('API key'),
      );
      expect(apiKeyFindings).toHaveLength(0);
    });

    it('should NOT flag placeholder api keys', () => {
      const source = `const api_key = 'your_api_key_here_placeholder';`;
      const findings = runRule(source);

      const apiKeyFindings = findings.filter((f) =>
        f.message.includes('API key'),
      );
      expect(apiKeyFindings).toHaveLength(0);
    });

    it('should NOT flag example api keys', () => {
      const source = `const api_key = 'example-api-key-for-testing';`;
      const findings = runRule(source);

      const apiKeyFindings = findings.filter((f) =>
        f.message.includes('API key'),
      );
      expect(apiKeyFindings).toHaveLength(0);
    });

    it('should report OWASP A02:2021 reference for secrets', () => {
      const source = `const api_key = 'sk-1234567890abcdef1234567890abcdef';`;
      const findings = runRule(source);

      const f = findings.find((f) => f.message.includes('API key'));
      expect(f).toBeDefined();
      expect(f!.owaspRef).toContain('A02:2021');
    });
  });

  describe('Hardcoded password detection (CWE-798)', () => {
    it('should detect hardcoded password', () => {
      const source = `const password = 'SuperSecretP@ss123!';`;
      const findings = runRule(source);

      const f = findings.find((f) =>
        f.message.toLowerCase().includes('password'),
      );
      expect(f).toBeDefined();
      expect(f!.meta!.cweId).toBe('CWE-798');
    });

    it('should detect password with : separator (object property)', () => {
      const source = `const config = { password: 'MyS3cretPwd!' };`;
      const findings = runRule(source);

      const f = findings.find((f) =>
        f.message.toLowerCase().includes('password'),
      );
      expect(f).toBeDefined();
    });

    it('should NOT flag password from env variable', () => {
      const source = `const password = process.env.DB_PASSWORD;`;
      const findings = runRule(source);

      const pwdFindings = findings.filter((f) =>
        f.message.toLowerCase().includes('password'),
      );
      expect(pwdFindings).toHaveLength(0);
    });
  });

  describe('Hardcoded token/secret detection (CWE-798)', () => {
    it('should detect hardcoded auth_token', () => {
      const source = `const auth_token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.abcdefghijklmnop';`;
      const findings = runRule(source);

      const f = findings.find((f) =>
        f.message.includes('token') || f.message.includes('secret'),
      );
      expect(f).toBeDefined();
    });

    it('should detect hardcoded secret', () => {
      const source = `const secret = 'super-secret-key-1234567890abcdef';`;
      const findings = runRule(source);

      const f = findings.find((f) =>
        f.message.includes('token') || f.message.includes('secret'),
      );
      expect(f).toBeDefined();
    });
  });

  describe('Private key detection (CWE-321)', () => {
    it('should detect private key in source', () => {
      const source = `const key = \`-----BEGIN PRIVATE KEY-----
MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC7
-----END PRIVATE KEY-----\`;`;
      const findings = runRule(source);

      const f = findings.find((f) =>
        f.message.includes('Private key') || f.message.includes('private key'),
      );
      expect(f).toBeDefined();
      expect(f!.meta!.cweId).toBe('CWE-321');
    });

    it('should detect RSA private key', () => {
      const source = `const key = '-----BEGIN RSA PRIVATE KEY-----';`;
      const findings = runRule(source);

      const f = findings.find((f) =>
        f.message.toLowerCase().includes('private key'),
      );
      expect(f).toBeDefined();
    });

    it('should have high confidence for private keys', () => {
      const source = `const key = '-----BEGIN PRIVATE KEY-----';`;
      const findings = runRule(source);

      const f = findings.find((f) =>
        f.message.toLowerCase().includes('private key'),
      );
      expect(f).toBeDefined();
      expect(f!.confidence).toBeGreaterThanOrEqual(0.95);
    });
  });

  // =========================================================================
  // 5. Disabled TLS (CWE-295)
  // =========================================================================

  describe('TLS verification disabled detection (CWE-295)', () => {
    it('should detect rejectUnauthorized: false', () => {
      const source = `const opts = { rejectUnauthorized: false };`;
      const findings = runRule(source);

      const f = findings.find((f) =>
        f.message.includes('rejectUnauthorized') || f.message.includes('TLS'),
      );
      expect(f).toBeDefined();
      expect(f!.meta!.cweId).toBe('CWE-295');
    });

    it('should detect NODE_TLS_REJECT_UNAUTHORIZED = 0', () => {
      const source = `process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';`;
      const findings = runRule(source);

      const f = findings.find((f) =>
        f.message.includes('NODE_TLS_REJECT_UNAUTHORIZED'),
      );
      expect(f).toBeDefined();
      expect(f!.meta!.cweId).toBe('CWE-295');
    });

    it('should detect verify: false', () => {
      const source = `const ssl = { verify: false };`;
      const findings = runRule(source);

      const f = findings.find((f) =>
        f.message.includes('SSL') || f.message.includes('verify'),
      );
      expect(f).toBeDefined();
    });

    it('should suggest proper certificate handling', () => {
      const source = `const opts = { rejectUnauthorized: false };`;
      const findings = runRule(source);

      const f = findings.find((f) => f.message.includes('TLS'));
      expect(f).toBeDefined();
      expect(f!.suggestedFix).toBeTruthy();
    });
  });

  // =========================================================================
  // Comment and suppression handling
  // =========================================================================

  describe('Comment and suppression handling', () => {
    it('should NOT flag patterns in single-line comments', () => {
      const source = `// eval(dangerousCode) is bad, don't do this`;
      const findings = runRule(source);

      const evalFindings = findings.filter((f) => f.message.includes('eval'));
      expect(evalFindings).toHaveLength(0);
    });

    it('should NOT flag patterns in block comments', () => {
      const source = `/* eval(dangerousCode) */`;
      const findings = runRule(source);

      const evalFindings = findings.filter((f) => f.message.includes('eval'));
      expect(evalFindings).toHaveLength(0);
    });

    it('should NOT flag patterns in JSDoc comments', () => {
      const source = `* eval(code) is dangerous`;
      const findings = runRule(source);

      const evalFindings = findings.filter((f) => f.message.includes('eval'));
      expect(evalFindings).toHaveLength(0);
    });

    it('should NOT flag patterns with eslint-disable comment', () => {
      const source = `eval(code); // eslint-disable-line no-eval`;
      const findings = runRule(source);

      const evalFindings = findings.filter((f) => f.message.includes('eval'));
      expect(evalFindings).toHaveLength(0);
    });

    it('should NOT flag patterns with nosec comment', () => {
      const source = `eval(code); // nosec`;
      const findings = runRule(source);

      const evalFindings = findings.filter((f) => f.message.includes('eval'));
      expect(evalFindings).toHaveLength(0);
    });

    it('should NOT flag patterns with safe: comment', () => {
      const source = `eval(code); // safe: this is sandboxed`;
      const findings = runRule(source);

      const evalFindings = findings.filter((f) => f.message.includes('eval'));
      expect(evalFindings).toHaveLength(0);
    });
  });

  // =========================================================================
  // Negative detection — clean code
  // =========================================================================

  describe('Negative detection — clean code produces no findings', () => {
    it('should produce zero findings for clean fixture', () => {
      const source = readFixture('clean-file.fixture.ts');
      const findings = runRule(source);

      expect(findings).toHaveLength(0);
    });

    it('should NOT flag textContent assignment', () => {
      const source = `element.textContent = userInput;`;
      const findings = runRule(source);
      expect(findings).toHaveLength(0);
    });

    it('should NOT flag parameterized SQL queries', () => {
      const source = `db.query('SELECT * FROM users WHERE id = ?', [userId]);`;
      const findings = runRule(source);

      const sqlFindings = findings.filter((f) => f.message.includes('SQL'));
      expect(sqlFindings).toHaveLength(0);
    });

    it('should NOT flag environment variable references', () => {
      const source = `
const apiKey = process.env.API_KEY;
const password = process.env.DB_PASSWORD;
const token = process.env.AUTH_TOKEN;
      `.trim();
      const findings = runRule(source);

      expect(findings).toHaveLength(0);
    });

    it('should NOT flag TLS enabled config', () => {
      const source = `const opts = { rejectUnauthorized: true };`;
      const findings = runRule(source);

      const tlsFindings = findings.filter((f) =>
        f.message.includes('rejectUnauthorized'),
      );
      expect(tlsFindings).toHaveLength(0);
    });
  });

  // =========================================================================
  // Correct line numbers and metadata
  // =========================================================================

  describe('Line numbers and metadata', () => {
    it('should report correct line number for eval', () => {
      const source = `const a = 1;
const b = 2;
const result = eval(code);
const c = 3;`;
      const findings = runRule(source);

      const f = findings.find((f) => f.message.includes('eval'));
      expect(f).toBeDefined();
      expect(f!.line).toBe(3);
    });

    it('should report correct line number for hardcoded secret', () => {
      const source = `// line 1
// line 2
// line 3
const api_key = 'sk-abcdefghijklmnopqrstuv123456789';
// line 5`;
      const findings = runRule(source);

      const f = findings.find((f) => f.message.includes('API key'));
      expect(f).toBeDefined();
      expect(f!.line).toBe(4);
    });

    it('should include patternId in meta', () => {
      const source = `eval(code);`;
      const findings = runRule(source);

      const f = findings.find((f) => f.message.includes('eval'));
      expect(f).toBeDefined();
      expect(f!.meta!.patternId).toBe('eval-usage');
    });

    it('should include codeSnippet', () => {
      const source = `eval(userInput);`;
      const findings = runRule(source);

      expect(findings.length).toBeGreaterThanOrEqual(1);
      expect(findings[0]!.codeSnippet).toBeTruthy();
    });

    it('should include suggestedFix', () => {
      const source = `eval(code);`;
      const findings = runRule(source);

      const f = findings.find((f) => f.message.includes('eval'));
      expect(f).toBeDefined();
      expect(f!.suggestedFix).toBeTruthy();
      expect(f!.suggestedFix!.length).toBeGreaterThan(0);
    });

    it('should have confidence between 0 and 1', () => {
      const source = `eval(code);`;
      const findings = runRule(source);

      for (const f of findings) {
        expect(f.confidence).toBeGreaterThan(0);
        expect(f.confidence).toBeLessThanOrEqual(1);
      }
    });
  });

  // =========================================================================
  // Edge cases
  // =========================================================================

  describe('Edge cases', () => {
    it('should handle empty source', () => {
      const findings = runRule('');
      expect(findings).toHaveLength(0);
    });

    it('should handle source with only comments', () => {
      const source = `
// Just a comment
/* Block comment */
/** JSDoc */
      `.trim();
      const findings = runRule(source);
      expect(findings).toHaveLength(0);
    });

    it('should handle multiple patterns in one file', () => {
      const source = `
eval(code);
element.innerHTML = html;
const q = "SELECT * FROM users WHERE id = " + userId;
const api_key = 'sk-abcdefghijklmnopqrstuv123456789';
const opts = { rejectUnauthorized: false };
      `.trim();
      const findings = runRule(source);

      // Should have at least 5 findings (one per pattern)
      expect(findings.length).toBeGreaterThanOrEqual(5);
    });

    it('should handle minified code', () => {
      const source = `eval(x);element.innerHTML=y;`;
      const findings = runRule(source);

      expect(findings.length).toBeGreaterThanOrEqual(2);
    });

    it('should detect patterns on the first line', () => {
      const source = `eval(code);`;
      const findings = runRule(source);

      const f = findings.find((f) => f.message.includes('eval'));
      expect(f).toBeDefined();
      expect(f!.line).toBe(1);
    });
  });

  // =========================================================================
  // Fixture file tests
  // =========================================================================

  describe('Fixture file — unsafe-patterns.fixture.ts', () => {
    it('should detect all unsafe patterns in the fixture', () => {
      const source = readFixture('unsafe-patterns.fixture.ts');
      const findings = runRule(source);

      // The fixture has: eval, new Function, innerHTML, document.write,
      // SQL concat, SQL template, API key, password, token, private key,
      // rejectUnauthorized: false, NODE_TLS, verify: false
      expect(findings.length).toBeGreaterThanOrEqual(8);
    });

    it('should have all findings with ruleId acv/unsafe-pattern', () => {
      const source = readFixture('unsafe-patterns.fixture.ts');
      const findings = runRule(source);

      for (const f of findings) {
        expect(f.ruleId).toBe('acv/unsafe-pattern');
      }
    });

    it('should have all findings with severity warn', () => {
      const source = readFixture('unsafe-patterns.fixture.ts');
      const findings = runRule(source);

      for (const f of findings) {
        expect(f.severity).toBe('warn');
      }
    });

    it('should have all findings with category security', () => {
      const source = readFixture('unsafe-patterns.fixture.ts');
      const findings = runRule(source);

      for (const f of findings) {
        expect(f.category).toBe('security');
      }
    });

    it('should detect eval() in the fixture', () => {
      const source = readFixture('unsafe-patterns.fixture.ts');
      const findings = runRule(source);

      const evalFindings = findings.filter((f) =>
        f.message.includes('eval()'),
      );
      expect(evalFindings.length).toBeGreaterThanOrEqual(1);
    });

    it('should detect innerHTML in the fixture', () => {
      const source = readFixture('unsafe-patterns.fixture.ts');
      const findings = runRule(source);

      const innerHtmlFindings = findings.filter((f) =>
        f.message.includes('innerHTML'),
      );
      expect(innerHtmlFindings.length).toBeGreaterThanOrEqual(1);
    });

    it('should detect hardcoded API key in the fixture', () => {
      const source = readFixture('unsafe-patterns.fixture.ts');
      const findings = runRule(source);

      const apiKeyFindings = findings.filter((f) =>
        f.message.includes('API key'),
      );
      expect(apiKeyFindings.length).toBeGreaterThanOrEqual(1);
    });

    it('should detect TLS disable in the fixture', () => {
      const source = readFixture('unsafe-patterns.fixture.ts');
      const findings = runRule(source);

      const tlsFindings = findings.filter(
        (f) => f.message.includes('TLS') || f.message.includes('NODE_TLS'),
      );
      expect(tlsFindings.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Fixture file — mixed-issues.fixture.ts', () => {
    it('should detect unsafe patterns in the mixed fixture', () => {
      const source = readFixture('mixed-issues.fixture.ts');
      const findings = runRule(source);

      // Should find eval, innerHTML, SQL concat, API key, TLS disable
      expect(findings.length).toBeGreaterThanOrEqual(3);
    });
  });

  // =========================================================================
  // Config interaction
  // =========================================================================

  describe('Config interaction', () => {
    it('should not produce findings when rule is set to off', () => {
      const source = `eval(code);`;
      const findings = runRule(source, '/test/file.ts', {
        rules: { 'acv/unsafe-pattern': 'off' },
      });

      expect(findings).toHaveLength(0);
    });

    it('should not produce findings when security category is disabled', () => {
      const source = `eval(code);`;
      const findings = runRule(source, '/test/file.ts', {
        categories: {
          'ai-specific': true,
          security: false,
          correctness: true,
        },
      });

      expect(findings).toHaveLength(0);
    });
  });
});
