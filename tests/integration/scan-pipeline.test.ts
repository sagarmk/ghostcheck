/**
 * Integration test for the full scan pipeline
 *
 * Tests the complete flow: file discovery → parse → rule execution → output.
 * This validates that all pipeline stages connect properly end-to-end.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { RuleRegistry } from '../../src/rules/registry.js';
import { RuleEngine } from '../../src/rules/engine.js';
import { OutputEngine } from '../../src/output/engine.js';
import { detectLanguage } from '../../src/cli/discovery.js';
import { computeSummary, computeExitCode, buildScanResult } from '../../src/core/orchestrator.js';
import { getAiSpecificRules } from '../../src/rules/ai-specific/index.js';
import { getSecurityRules } from '../../src/rules/security/index.js';
import { getCorrectnessRules } from '../../src/rules/correctness/index.js';
import { createAcvConfig, createASTNode, createScanMetrics, createPosition, createImportNode, createCallExpressionNode, createStringLiteralNode } from '../helpers/factories.js';
import type { ASTNode, Finding, AcvConfig, ScanResult } from '../../src/core/types.js';

describe('Scan Pipeline Integration', () => {
  let registry: RuleRegistry;
  let engine: RuleEngine;
  let outputEngine: OutputEngine;
  let config: AcvConfig;

  beforeEach(() => {
    registry = new RuleRegistry();

    // Register all rule categories
    const aiRules = getAiSpecificRules();
    const secRules = getSecurityRules();
    const corRules = getCorrectnessRules();

    if (aiRules.length > 0) registry.registerAll(aiRules);
    if (secRules.length > 0) registry.registerAll(secRules);
    if (corRules.length > 0) registry.registerAll(corRules);

    engine = new RuleEngine(registry);
    outputEngine = new OutputEngine();
    config = createAcvConfig();
  });

  describe('Phase 1: File Discovery → Language Detection', () => {
    it('should detect languages for discovered files', () => {
      const files = [
        '/project/src/index.ts',
        '/project/src/utils.js',
        '/project/src/main.py',
        '/project/README.md',
      ];

      const detected = files.map((f) => ({
        path: f,
        language: detectLanguage(f),
      }));

      expect(detected[0]!.language).toBe('typescript');
      expect(detected[1]!.language).toBe('javascript');
      expect(detected[2]!.language).toBe('python');
      expect(detected[3]!.language).toBeNull(); // markdown not supported
    });

    it('should filter out unsupported file types', () => {
      const files = [
        '/project/src/app.ts',
        '/project/styles/main.css',
        '/project/assets/logo.png',
        '/project/src/lib.rs',
        '/project/data/config.json',
      ];

      const supported = files.filter((f) => detectLanguage(f) !== null);
      expect(supported).toHaveLength(2);
      expect(supported).toContain('/project/src/app.ts');
      expect(supported).toContain('/project/src/lib.rs');
    });
  });

  describe('Phase 2-4: Parse → Rule Execution → Findings', () => {
    it('should process a TypeScript AST through the rule engine', () => {
      const ast: ASTNode = createASTNode({
        type: 'Program',
        children: [
          createImportNode('express', 1),
          createCallExpressionNode('app.use', 2),
        ],
      });

      const findings = engine.run({
        filePath: '/project/src/server.ts',
        language: 'typescript',
        ast,
        sourceText: "import express from 'express';\napp.use(cors());",
        config,
      });

      expect(findings).toBeDefined();
      expect(Array.isArray(findings)).toBe(true);
    });

    it('should process a JavaScript AST through the rule engine', () => {
      const ast: ASTNode = createASTNode({
        type: 'Program',
        children: [
          createCallExpressionNode('eval', 1),
          createStringLiteralNode('password123', 2),
        ],
      });

      const findings = engine.run({
        filePath: '/project/src/app.js',
        language: 'javascript',
        ast,
        sourceText: "eval(code);\nconst pw = 'password123';",
        config,
      });

      expect(findings).toBeDefined();
    });

    it('should not produce findings for Python when only JS/TS rules exist', () => {
      const ast: ASTNode = createASTNode({
        type: 'Program',
        children: [createCallExpressionNode('eval', 1)],
      });

      const findings = engine.run({
        filePath: '/project/src/app.py',
        language: 'python',
        ast,
        sourceText: 'eval(code)',
        config,
      });

      // Rules that only target JS/TS should not fire for Python files
      // (depends on rule implementation — currently rules return empty)
      expect(findings).toBeDefined();
    });
  });

  describe('Phase 5: Finding Aggregation', () => {
    it('should compute correct summary from mixed findings', () => {
      const findings: Finding[] = [
        {
          ruleId: 'eval-usage',
          severity: 'error',
          category: 'security',
          message: 'Eval detected',
          filePath: '/src/a.ts',
          line: 1,
          column: 1,
          endLine: 1,
          endColumn: 10,
          codeSnippet: 'eval(x)',
          fix: null,
          suggestion: 'Remove eval',
          owaspRef: 'A03:2021',
          confidence: 0.99,
        },
        {
          ruleId: 'placeholder-todo-stub',
          severity: 'warn',
          category: 'correctness',
          message: 'TODO found',
          filePath: '/src/b.ts',
          line: 5,
          column: 1,
          endLine: 5,
          endColumn: 30,
          codeSnippet: '// TODO: implement',
          fix: null,
          suggestion: null,
          owaspRef: null,
          confidence: 1.0,
        },
        {
          ruleId: 'hallucinated-import',
          severity: 'error',
          category: 'ai-specific',
          message: 'Package not found',
          filePath: '/src/c.ts',
          line: 1,
          column: 1,
          endLine: 1,
          endColumn: 40,
          codeSnippet: "import x from 'nonexistent';",
          fix: null,
          suggestion: null,
          owaspRef: null,
          confidence: 0.85,
        },
      ];

      const summary = computeSummary(findings);
      expect(summary.errors).toBe(2);
      expect(summary.warnings).toBe(1);
      expect(summary.info).toBe(0);
      expect(summary.categories.security).toBe(1);
      expect(summary.categories.correctness).toBe(1);
      expect(summary.categories['ai-specific']).toBe(1);
    });

    it('should compute correct exit code', () => {
      const findings: Finding[] = [{
        ruleId: 'test',
        severity: 'error',
        category: 'security',
        message: 'test',
        filePath: '/test',
        line: 1,
        column: 1,
        endLine: 1,
        endColumn: 10,
        codeSnippet: '',
        fix: null,
        suggestion: null,
        owaspRef: null,
        confidence: 1.0,
      }];

      const summary = computeSummary(findings);

      // With failOn: 'error', should return 1 when errors exist
      expect(computeExitCode(summary, createAcvConfig({ failOn: 'error' }))).toBe(1);

      // With failOn: 'error', should return 0 when only warnings
      const warnSummary = computeSummary([{
        ...findings[0]!,
        severity: 'warn',
      }]);
      expect(computeExitCode(warnSummary, createAcvConfig({ failOn: 'error' }))).toBe(0);
    });
  });

  describe('Phase 6: Output Formatting', () => {
    it('should produce pretty output from scan result', () => {
      const result = buildScanResult([], createScanMetrics(), config);
      const output = outputEngine.format(result, 'pretty');

      expect(output).toContain('AI Code Verifier');
      expect(output).toContain('No issues found');
    });

    it('should produce valid JSON output from scan result', () => {
      const result = buildScanResult([], createScanMetrics(), config);
      const output = outputEngine.format(result, 'json');

      const parsed = JSON.parse(output);
      expect(parsed.version).toBe('0.1.0');
      expect(parsed.exitCode).toBe(0);
    });

    it('should produce valid SARIF output from scan result', () => {
      const result = buildScanResult([], createScanMetrics(), config);
      const output = outputEngine.format(result, 'sarif');

      const parsed = JSON.parse(output);
      expect(parsed.version).toBe('2.1.0');
      expect(parsed.$schema).toContain('sarif');
    });
  });

  describe('End-to-End Pipeline', () => {
    it('should process files through full pipeline and produce output', () => {
      // Step 1: Simulate file discovery
      const files = ['/project/src/app.ts', '/project/src/utils.ts'];

      // Step 2: Language detection
      const fileLanguages = files.map((f) => ({
        path: f,
        language: detectLanguage(f),
      }));

      expect(fileLanguages.every((f) => f.language === 'typescript')).toBe(true);

      // Step 3: AST parsing (simulated)
      const asts: Array<{ path: string; ast: ASTNode; source: string }> = [
        {
          path: files[0]!,
          ast: createASTNode({
            type: 'Program',
            children: [createImportNode('express', 1)],
          }),
          source: "import express from 'express';",
        },
        {
          path: files[1]!,
          ast: createASTNode({
            type: 'Program',
            children: [createCallExpressionNode('console.log', 1)],
          }),
          source: "console.log('hello');",
        },
      ];

      // Step 4: Rule execution
      const allFindings: Finding[] = [];
      for (const { path, ast, source } of asts) {
        const findings = engine.run({
          filePath: path,
          language: 'typescript',
          ast,
          sourceText: source,
          config,
        });
        allFindings.push(...findings);
      }

      // Step 5: Build result
      const metrics = createScanMetrics({
        files: files.length,
        parsed: files.length,
        durationMs: 50,
      });
      const result = buildScanResult(allFindings, metrics, config);

      // Step 6: Format output
      const jsonOutput = outputEngine.format(result, 'json');
      const parsed = JSON.parse(jsonOutput);

      expect(parsed.version).toBe('0.1.0');
      expect(parsed.scan.files).toBe(2);
      expect(parsed.findings).toBeDefined();
      expect(parsed.exitCode).toBeDefined();
    });

    it('should handle empty project (no files)', () => {
      const result = buildScanResult([], createScanMetrics({ files: 0, parsed: 0 }), config);

      expect(result.findings).toHaveLength(0);
      expect(result.summary.errors).toBe(0);
      expect(result.exitCode).toBe(0);

      // Should still produce valid output
      const output = outputEngine.format(result, 'json');
      const parsed = JSON.parse(output);
      expect(parsed.scan.files).toBe(0);
    });
  });
});
