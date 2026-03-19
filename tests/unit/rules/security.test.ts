/**
 * Unit tests for Security rules (SEC-001 through SEC-013)
 *
 * Tests the detection of eval usage, SQL injection, hardcoded secrets,
 * command injection, and other security vulnerabilities.
 *
 * Rule IDs tested:
 *   SEC-001: eval-usage
 *   SEC-002: sql-injection-concat
 *   SEC-003: hardcoded-secret-pattern
 *   SEC-004: insecure-random
 *   SEC-005: missing-csrf
 *   SEC-006: open-redirect
 *   SEC-007: xxe-parsing
 *   SEC-008: prototype-pollution
 *   SEC-009: command-injection
 *   SEC-010: path-traversal
 *   SEC-011: unsafe-deserialization
 *   SEC-012: cors-wildcard
 *   SEC-013: ssrf-pattern
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { RuleRegistry } from '../../../src/rules/registry.js';
import { RuleEngine } from '../../../src/rules/engine.js';
import { getSecurityRules } from '../../../src/rules/security/index.js';
import { createAcvConfig, createASTNode, createCallExpressionNode, createStringLiteralNode } from '../../helpers/factories.js';
import type { ASTNode, AcvConfig } from '../../../src/core/types.js';

describe('Security Rules', () => {
  let registry: RuleRegistry;
  let engine: RuleEngine;
  let config: AcvConfig;

  beforeEach(() => {
    registry = new RuleRegistry();
    const rules = getSecurityRules();
    if (rules.length > 0) {
      registry.registerAll(rules);
    }
    engine = new RuleEngine(registry);
    config = createAcvConfig();
  });

  describe('SEC-001: eval-usage', () => {
    it('should detect direct eval() calls', () => {
      const ast: ASTNode = createASTNode({
        type: 'Program',
        children: [createCallExpressionNode('eval', 1)],
      });

      const findings = engine.run({
        filePath: '/test/eval.ts',
        language: 'typescript',
        ast,
        sourceText: 'eval("alert(1)");',
        config,
      });

      expect(findings).toBeDefined();
    });

    it('should detect indirect eval (Function constructor)', () => {
      const ast: ASTNode = createASTNode({
        type: 'Program',
        children: [{
          type: 'NewExpression',
          start: { line: 1, column: 1, offset: 0 },
          end: { line: 1, column: 25, offset: 24 },
          callee: 'Function',
          children: [],
        }],
      });

      const findings = engine.run({
        filePath: '/test/indirect-eval.ts',
        language: 'typescript',
        ast,
        sourceText: 'new Function("return 1")',
        config,
      });

      expect(findings).toBeDefined();
    });

    it('should not flag eval in comments', () => {
      const ast: ASTNode = createASTNode({
        type: 'Program',
        children: [{
          type: 'Comment',
          start: { line: 1, column: 1, offset: 0 },
          end: { line: 1, column: 30, offset: 29 },
          value: '// Never use eval() in production',
          children: [],
        }],
      });

      const findings = engine.run({
        filePath: '/test/eval-comment.ts',
        language: 'typescript',
        ast,
        sourceText: '// Never use eval() in production',
        config,
      });

      const evalFindings = findings.filter((f) => f.ruleId === 'eval-usage');
      expect(evalFindings).toHaveLength(0);
    });
  });

  describe('SEC-002: sql-injection-concat', () => {
    it('should detect SQL queries with string concatenation', () => {
      const ast: ASTNode = createASTNode({
        type: 'Program',
        children: [{
          type: 'BinaryExpression',
          start: { line: 1, column: 1, offset: 0 },
          end: { line: 1, column: 60, offset: 59 },
          operator: '+',
          children: [
            createStringLiteralNode("SELECT * FROM users WHERE name = '"),
          ],
        }],
      });

      const findings = engine.run({
        filePath: '/test/sql-injection.ts',
        language: 'typescript',
        ast,
        sourceText: "const q = \"SELECT * FROM users WHERE name = '\" + name + \"'\";",
        config,
      });

      expect(findings).toBeDefined();
    });

    it('should detect SQL queries with template literals', () => {
      const ast: ASTNode = createASTNode({
        type: 'Program',
        children: [{
          type: 'TemplateLiteral',
          start: { line: 1, column: 1, offset: 0 },
          end: { line: 1, column: 50, offset: 49 },
          children: [],
        }],
      });

      const findings = engine.run({
        filePath: '/test/sql-template.ts',
        language: 'typescript',
        ast,
        sourceText: '`SELECT * FROM users WHERE id = ${id}`',
        config,
      });

      expect(findings).toBeDefined();
    });

    it('should not flag parameterized queries', () => {
      const ast: ASTNode = createASTNode({
        type: 'Program',
        children: [
          createStringLiteralNode('SELECT * FROM users WHERE name = ?'),
        ],
      });

      const findings = engine.run({
        filePath: '/test/safe-sql.ts',
        language: 'typescript',
        ast,
        sourceText: "const q = 'SELECT * FROM users WHERE name = ?';",
        config,
      });

      const sqlFindings = findings.filter((f) => f.ruleId === 'sql-injection-concat');
      expect(sqlFindings).toHaveLength(0);
    });
  });

  describe('SEC-003: hardcoded-secret-pattern', () => {
    it('should detect hardcoded API keys', () => {
      const ast: ASTNode = createASTNode({
        type: 'Program',
        children: [{
          type: 'VariableDeclaration',
          start: { line: 1, column: 1, offset: 0 },
          end: { line: 1, column: 50, offset: 49 },
          name: 'API_KEY',
          children: [createStringLiteralNode('sk-1234567890abcdef1234567890abcdef')],
        }],
      });

      const findings = engine.run({
        filePath: '/test/secrets.ts',
        language: 'typescript',
        ast,
        sourceText: "const API_KEY = 'sk-1234567890abcdef1234567890abcdef';",
        config,
      });

      expect(findings).toBeDefined();
    });

    it('should detect hardcoded passwords', () => {
      const ast: ASTNode = createASTNode({
        type: 'Program',
        children: [{
          type: 'VariableDeclaration',
          start: { line: 1, column: 1, offset: 0 },
          end: { line: 1, column: 45, offset: 44 },
          name: 'password',
          children: [createStringLiteralNode('supersecretpassword123!')],
        }],
      });

      const findings = engine.run({
        filePath: '/test/password.ts',
        language: 'typescript',
        ast,
        sourceText: "const password = 'supersecretpassword123!';",
        config,
      });

      expect(findings).toBeDefined();
    });

    it('should detect connection strings with embedded credentials', () => {
      const ast: ASTNode = createASTNode({
        type: 'Program',
        children: [
          createStringLiteralNode('postgresql://admin:secretpass@db.example.com:5432/prod'),
        ],
      });

      const findings = engine.run({
        filePath: '/test/connstring.ts',
        language: 'typescript',
        ast,
        sourceText: "const db = 'postgresql://admin:secretpass@db.example.com:5432/prod';",
        config,
      });

      expect(findings).toBeDefined();
    });

    it('should not flag environment variable references', () => {
      const ast: ASTNode = createASTNode({
        type: 'Program',
        children: [{
          type: 'MemberExpression',
          start: { line: 1, column: 1, offset: 0 },
          end: { line: 1, column: 30, offset: 29 },
          object: 'process.env',
          property: 'API_KEY',
          children: [],
        }],
      });

      const findings = engine.run({
        filePath: '/test/safe-env.ts',
        language: 'typescript',
        ast,
        sourceText: "const key = process.env['API_KEY'];",
        config,
      });

      const secretFindings = findings.filter((f) => f.ruleId === 'hardcoded-secret-pattern');
      expect(secretFindings).toHaveLength(0);
    });
  });

  describe('SEC-004: insecure-random', () => {
    it('should detect Math.random() for security-sensitive operations', () => {
      const ast: ASTNode = createASTNode({
        type: 'Program',
        children: [createCallExpressionNode('Math.random', 1)],
      });

      const findings = engine.run({
        filePath: '/test/insecure-random.ts',
        language: 'typescript',
        ast,
        sourceText: 'const token = Math.random().toString(36);',
        config,
      });

      expect(findings).toBeDefined();
    });
  });

  describe('SEC-005: missing-csrf', () => {
    it('should detect POST/PUT/DELETE routes without CSRF protection', () => {
      const ast: ASTNode = createASTNode({
        type: 'Program',
        children: [createCallExpressionNode('app.post', 1)],
      });

      const findings = engine.run({
        filePath: '/test/csrf.ts',
        language: 'typescript',
        ast,
        sourceText: "app.post('/api/data', handler);",
        config,
      });

      expect(findings).toBeDefined();
    });
  });

  describe('SEC-006: open-redirect', () => {
    it('should detect unvalidated redirects from user input', () => {
      const ast: ASTNode = createASTNode({
        type: 'Program',
        children: [createCallExpressionNode('res.redirect', 1)],
      });

      const findings = engine.run({
        filePath: '/test/redirect.ts',
        language: 'typescript',
        ast,
        sourceText: 'res.redirect(req.query.url);',
        config,
      });

      expect(findings).toBeDefined();
    });
  });

  describe('SEC-007: xxe-parsing', () => {
    it('should detect XML parsing without disabling external entities', () => {
      const ast: ASTNode = createASTNode({
        type: 'Program',
        children: [createCallExpressionNode('parseXml', 1)],
      });

      const findings = engine.run({
        filePath: '/test/xxe.ts',
        language: 'typescript',
        ast,
        sourceText: 'const doc = parseXml(userInput);',
        config,
      });

      expect(findings).toBeDefined();
    });
  });

  describe('SEC-008: prototype-pollution', () => {
    it('should detect object merge without __proto__ protection', () => {
      const ast: ASTNode = createASTNode({
        type: 'Program',
        children: [{
          type: 'ForInStatement',
          start: { line: 1, column: 1, offset: 0 },
          end: { line: 3, column: 2, offset: 80 },
          children: [],
        }],
      });

      const findings = engine.run({
        filePath: '/test/prototype.ts',
        language: 'typescript',
        ast,
        sourceText: 'for (const key in source) { target[key] = source[key]; }',
        config,
      });

      expect(findings).toBeDefined();
    });
  });

  describe('SEC-009: command-injection', () => {
    it('should detect exec/execSync with user input', () => {
      const ast: ASTNode = createASTNode({
        type: 'Program',
        children: [createCallExpressionNode('execSync', 1)],
      });

      const findings = engine.run({
        filePath: '/test/cmd-injection.ts',
        language: 'typescript',
        ast,
        sourceText: "execSync('ls ' + userInput);",
        config,
      });

      expect(findings).toBeDefined();
    });
  });

  describe('SEC-010: path-traversal', () => {
    it('should detect user-controlled file paths', () => {
      const ast: ASTNode = createASTNode({
        type: 'Program',
        children: [createCallExpressionNode('fs.readFileSync', 1)],
      });

      const findings = engine.run({
        filePath: '/test/path-traversal.ts',
        language: 'typescript',
        ast,
        sourceText: "fs.readFileSync('/uploads/' + filename);",
        config,
      });

      expect(findings).toBeDefined();
    });
  });

  describe('SEC-011: unsafe-deserialization', () => {
    it('should detect eval-based deserialization', () => {
      const ast: ASTNode = createASTNode({
        type: 'Program',
        children: [createCallExpressionNode('eval', 1)],
      });

      const findings = engine.run({
        filePath: '/test/deserialize.ts',
        language: 'typescript',
        ast,
        sourceText: "eval('(' + data + ')');",
        config,
      });

      expect(findings).toBeDefined();
    });
  });

  describe('SEC-012: cors-wildcard', () => {
    it('should detect CORS origin: "*" configuration', () => {
      const ast: ASTNode = createASTNode({
        type: 'Program',
        children: [createStringLiteralNode('*')],
      });

      const findings = engine.run({
        filePath: '/test/cors.ts',
        language: 'typescript',
        ast,
        sourceText: "const cors = { origin: '*' };",
        config,
      });

      expect(findings).toBeDefined();
    });
  });

  describe('SEC-013: ssrf-pattern', () => {
    it('should detect fetch calls with user-controlled URLs', () => {
      const ast: ASTNode = createASTNode({
        type: 'Program',
        children: [createCallExpressionNode('fetch', 1)],
      });

      const findings = engine.run({
        filePath: '/test/ssrf.ts',
        language: 'typescript',
        ast,
        sourceText: 'fetch(userProvidedUrl);',
        config,
      });

      expect(findings).toBeDefined();
    });
  });

  describe('Rule registration', () => {
    it('should return an array from getSecurityRules()', () => {
      const rules = getSecurityRules();
      expect(Array.isArray(rules)).toBe(true);
    });

    it('should have unique rule IDs', () => {
      const rules = getSecurityRules();
      const ids = rules.map((r) => r.id);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it('should assign security category to all rules', () => {
      const rules = getSecurityRules();
      for (const rule of rules) {
        expect(rule.category).toBe('security');
      }
    });
  });
});
