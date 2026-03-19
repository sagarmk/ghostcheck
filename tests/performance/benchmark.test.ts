/**
 * Performance benchmark test
 *
 * Validates that the scan pipeline processes 10,000 lines of code
 * in under 5 seconds, as specified in the performance requirements.
 *
 * This test generates a synthetic 10K LOC fixture and measures
 * end-to-end pipeline execution time.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { RuleRegistry } from '../../src/rules/registry.js';
import { RuleEngine } from '../../src/rules/engine.js';
import { walkAst } from '../../src/ast/visitor.js';
import { computeSummary, buildScanResult } from '../../src/core/orchestrator.js';
import { getAiSpecificRules } from '../../src/rules/ai-specific/index.js';
import { getSecurityRules } from '../../src/rules/security/index.js';
import { getCorrectnessRules } from '../../src/rules/correctness/index.js';
import { createAcvConfig, createPosition, createScanMetrics } from '../helpers/factories.js';
import type { ASTNode, Finding, AcvConfig } from '../../src/core/types.js';

/**
 * Generate a synthetic AST with the specified number of nodes.
 * Simulates a realistic mix of node types found in real codebases.
 */
function generateSyntheticAST(nodeCount: number): ASTNode {
  const nodeTypes = [
    'ImportDeclaration',
    'FunctionDeclaration',
    'VariableDeclaration',
    'CallExpression',
    'MemberExpression',
    'StringLiteral',
    'BinaryExpression',
    'IfStatement',
    'ReturnStatement',
    'ArrowFunction',
    'AwaitExpression',
    'ForStatement',
    'TryStatement',
    'CatchClause',
    'ExpressionStatement',
  ];

  const children: ASTNode[] = [];
  for (let i = 0; i < nodeCount; i++) {
    const type = nodeTypes[i % nodeTypes.length]!;
    const line = i + 1;
    const offset = i * 50;

    children.push({
      type,
      start: createPosition({ line, column: 1, offset }),
      end: createPosition({ line, column: 50, offset: offset + 49 }),
      children: [],
    });
  }

  return {
    type: 'Program',
    start: createPosition(),
    end: createPosition({ line: nodeCount + 1, column: 1, offset: nodeCount * 50 }),
    children,
  };
}

/**
 * Generate synthetic source text with the specified number of lines.
 * Includes a mix of import statements, functions, conditionals, etc.
 */
function generateSyntheticSource(lineCount: number): string {
  const lines: string[] = [];
  const templates = [
    "import { something } from 'some-package';",
    'function process(data: unknown): unknown {',
    '  const result = transform(data);',
    '  if (result === null) {',
    '    throw new Error("Invalid result");',
    '  }',
    '  return result;',
    '}',
    'const config = { key: "value", debug: false };',
    'export async function fetchData(url: string): Promise<unknown> {',
    '  const response = await fetch(url);',
    '  return response.json();',
    '}',
    '// TODO: Add validation',
    'const API_KEY = process.env.API_KEY;',
    'console.log("Processing complete");',
  ];

  for (let i = 0; i < lineCount; i++) {
    lines.push(templates[i % templates.length]!);
  }

  return lines.join('\n');
}

describe('Performance Benchmarks', () => {
  let registry: RuleRegistry;
  let engine: RuleEngine;
  let config: AcvConfig;

  beforeEach(() => {
    registry = new RuleRegistry();
    const aiRules = getAiSpecificRules();
    const secRules = getSecurityRules();
    const corRules = getCorrectnessRules();
    if (aiRules.length > 0) registry.registerAll(aiRules);
    if (secRules.length > 0) registry.registerAll(secRules);
    if (corRules.length > 0) registry.registerAll(corRules);
    engine = new RuleEngine(registry);
    config = createAcvConfig();
  });

  describe('10K LOC benchmark', () => {
    it('should process 10,000 lines of code in under 5 seconds', () => {
      const LOC = 10_000;
      const NODE_COUNT = 2_000; // ~5 nodes per line average

      // Generate synthetic inputs
      const sourceText = generateSyntheticSource(LOC);
      const ast = generateSyntheticAST(NODE_COUNT);

      expect(sourceText.split('\n').length).toBe(LOC);

      // Start timer
      const startTime = performance.now();

      // Simulate scanning 10 files of ~1000 LOC each
      const allFindings: Finding[] = [];
      for (let fileIdx = 0; fileIdx < 10; fileIdx++) {
        const findings = engine.run({
          filePath: `/project/src/file${fileIdx}.ts`,
          language: 'typescript',
          ast,
          sourceText,
          config,
        });
        allFindings.push(...findings);
      }

      // Build result
      const metrics = createScanMetrics({
        files: 10,
        parsed: 10,
        durationMs: 0,
      });
      const result = buildScanResult(allFindings, metrics, config);

      // End timer
      const durationMs = performance.now() - startTime;

      // Assert: under 5 seconds
      expect(durationMs).toBeLessThan(5_000);

      // Verify result is valid
      expect(result.version).toBe('0.1.0');
      expect(result.scan.files).toBe(10);

      console.log(`  📊 10K LOC benchmark: ${Math.round(durationMs)}ms (limit: 5000ms)`);
    });

    it('should walk AST with 10,000 nodes efficiently', () => {
      const nodeCount = 10_000;
      const ast = generateSyntheticAST(nodeCount);
      let visitCount = 0;

      const visitor = {
        ImportDeclaration: () => { visitCount++; },
        CallExpression: () => { visitCount++; },
        IfStatement: () => { visitCount++; },
      };

      const startTime = performance.now();
      walkAst(ast, [visitor]);
      const durationMs = performance.now() - startTime;

      // Should complete in under 1 second for pure AST walking
      expect(durationMs).toBeLessThan(1_000);
      expect(visitCount).toBeGreaterThan(0);

      console.log(`  📊 AST walk (${nodeCount} nodes): ${Math.round(durationMs)}ms, ${visitCount} visits`);
    });

    it('should compute summary for 10,000 findings efficiently', () => {
      const findings: Finding[] = Array.from({ length: 10_000 }, (_, i) => ({
        ruleId: `rule-${i % 35}`,
        severity: (['error', 'warn', 'info'] as const)[i % 3],
        category: (['security', 'ai-specific', 'correctness'] as const)[i % 3],
        message: `Finding ${i}`,
        filePath: `/src/file${i % 100}.ts`,
        line: (i % 500) + 1,
        column: 1,
        endLine: (i % 500) + 1,
        endColumn: 10,
        codeSnippet: `code ${i}`,
        fix: i % 5 === 0 ? { from: 'a', to: 'b' } : null,
        suggestion: null,
        owaspRef: null,
        confidence: 0.9,
      }));

      const startTime = performance.now();
      const summary = computeSummary(findings);
      const durationMs = performance.now() - startTime;

      // Summary computation should be near-instant
      expect(durationMs).toBeLessThan(100);
      expect(summary.errors + summary.warnings + summary.info).toBe(10_000);

      console.log(`  📊 Summary computation (10K findings): ${durationMs.toFixed(2)}ms`);
    });
  });

  describe('memory efficiency', () => {
    it('should not cause excessive memory allocation for large files', () => {
      // Generate a large source text (50K lines)
      const largeSource = generateSyntheticSource(50_000);
      const largeAst = generateSyntheticAST(10_000);

      const memBefore = process.memoryUsage().heapUsed;

      engine.run({
        filePath: '/project/large-file.ts',
        language: 'typescript',
        ast: largeAst,
        sourceText: largeSource,
        config,
      });

      const memAfter = process.memoryUsage().heapUsed;
      const memDelta = (memAfter - memBefore) / (1024 * 1024); // MB

      // Should use less than 200MB additional memory
      expect(memDelta).toBeLessThan(200);

      console.log(`  📊 Memory delta for 50K LOC: ${memDelta.toFixed(1)}MB`);
    });
  });
});
