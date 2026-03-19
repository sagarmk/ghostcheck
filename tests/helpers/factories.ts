/**
 * Test factories — helpers to create test data with sensible defaults.
 *
 * These factories reduce boilerplate in tests and ensure consistency
 * across the test suite. Override any field by passing partial objects.
 */

import type {
  Finding,
  ScanResult,
  ScanSummary,
  ScanMetrics,
  ScanConfig,
  AcvConfig,
  ASTNode,
  Position,
  Rule,
  RuleContext,
  RuleConfig,
  Language,
  ActiveSeverity,
  RuleCategory,
  OutputFormat,
} from '../../src/core/types.js';

// =============================================================================
// Position & AST Factories
// =============================================================================

export function createPosition(overrides: Partial<Position> = {}): Position {
  return {
    line: 1,
    column: 1,
    offset: 0,
    ...overrides,
  };
}

export function createASTNode(overrides: Partial<ASTNode> = {}): ASTNode {
  return {
    type: 'Program',
    start: createPosition(),
    end: createPosition({ line: 1, column: 10, offset: 9 }),
    ...overrides,
  };
}

export function createImportNode(
  source: string,
  line = 1,
): ASTNode {
  const startOffset = 0;
  const endOffset = `import x from '${source}';`.length;
  return {
    type: 'ImportDeclaration',
    start: createPosition({ line, column: 1, offset: startOffset }),
    end: createPosition({ line, column: endOffset + 1, offset: endOffset }),
    source,
    children: [],
  };
}

export function createCallExpressionNode(
  callee: string,
  line = 1,
): ASTNode {
  const code = `${callee}()`;
  return {
    type: 'CallExpression',
    start: createPosition({ line, column: 1, offset: 0 }),
    end: createPosition({ line, column: code.length + 1, offset: code.length }),
    callee,
    children: [],
  };
}

export function createStringLiteralNode(
  value: string,
  line = 1,
): ASTNode {
  return {
    type: 'StringLiteral',
    start: createPosition({ line, column: 1, offset: 0 }),
    end: createPosition({ line, column: value.length + 3, offset: value.length + 2 }),
    value,
    children: [],
  };
}

// =============================================================================
// Finding Factory
// =============================================================================

export function createFinding(overrides: Partial<Finding> = {}): Finding {
  return {
    ruleId: 'test-rule',
    severity: 'error',
    category: 'security',
    message: 'Test finding message',
    filePath: '/test/file.ts',
    line: 1,
    column: 1,
    endLine: 1,
    endColumn: 10,
    codeSnippet: 'const x = 1;',
    fix: null,
    suggestion: null,
    owaspRef: null,
    confidence: 1.0,
    ...overrides,
  };
}

export function createFindingWithFix(overrides: Partial<Finding> = {}): Finding {
  return createFinding({
    fix: { from: 'eval(code)', to: 'safeEval(code)' },
    ...overrides,
  });
}

// =============================================================================
// Scan Result Factories
// =============================================================================

export function createScanSummary(overrides: Partial<ScanSummary> = {}): ScanSummary {
  return {
    errors: 0,
    warnings: 0,
    info: 0,
    fixable: 0,
    categories: {
      'ai-specific': 0,
      security: 0,
      correctness: 0,
    },
    ...overrides,
  };
}

export function createScanMetrics(overrides: Partial<ScanMetrics> = {}): ScanMetrics {
  return {
    files: 10,
    durationMs: 250,
    cached: 0,
    parsed: 10,
    skipped: 0,
    ...overrides,
  };
}

export function createScanConfig(overrides: Partial<ScanConfig> = {}): ScanConfig {
  return {
    failOn: 'error',
    rules: 35,
    languages: ['typescript', 'javascript'],
    ...overrides,
  };
}

export function createScanResult(overrides: Partial<ScanResult> = {}): ScanResult {
  const findings = overrides.findings ?? [];
  return {
    version: '0.1.0',
    timestamp: '2026-03-18T00:00:00.000Z',
    config: createScanConfig(),
    scan: createScanMetrics(),
    findings,
    summary: createScanSummary(),
    exitCode: 0,
    ...overrides,
  };
}

// =============================================================================
// Config Factory
// =============================================================================

export function createAcvConfig(overrides: Partial<AcvConfig> = {}): AcvConfig {
  return {
    rules: {},
    categories: {
      'ai-specific': true,
      security: true,
      correctness: true,
    },
    languages: [],
    ignore: [],
    failOn: 'error',
    maxWarnings: -1,
    cache: true,
    maxWorkers: 2,
    maxFileSize: '1mb',
    parseTimeout: 5000,
    format: 'pretty' as OutputFormat,
    hooks: {},
    ...overrides,
  };
}

// =============================================================================
// Rule Factory
// =============================================================================

export function createRule(overrides: Partial<Rule> = {}): Rule {
  return {
    id: 'test-rule',
    name: 'Test Rule',
    category: 'security' as RuleCategory,
    defaultSeverity: 'error' as ActiveSeverity,
    languages: ['typescript', 'javascript'] as Language[],
    meta: {
      description: 'A test rule',
      fixable: false,
    },
    create: () => ({}),
    ...overrides,
  };
}

// =============================================================================
// Rule Context Factory
// =============================================================================

export function createRuleContext(overrides: Partial<RuleContext> = {}): RuleContext {
  const findings: Finding[] = [];
  return {
    filePath: '/test/file.ts',
    language: 'typescript' as Language,
    config: {
      enabled: true,
      severity: 'error',
    } as RuleConfig,
    report: (partial) => {
      findings.push({
        ...partial,
        ruleId: 'test-rule',
        category: 'security',
      } as Finding);
    },
    getSourceText: () => '',
    getAncestors: () => [],
    ...overrides,
  };
}
