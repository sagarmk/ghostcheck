/**
 * Rule execution engine — runs rules against parsed ASTs.
 *
 * For each file, the engine:
 *   1. Selects applicable rules (by language, config, category)
 *   2. Creates rule visitors via rule.create(context)
 *   3. Walks the AST with all visitors simultaneously
 *   4. Collects and returns findings
 */

import type {
  Rule,
  RuleContext,
  RuleVisitor,
  ASTNode,
  Finding,
  AcvConfig,
  Language,
  ActiveSeverity,
} from '../core/types.js';
import type { RuleRegistry } from './registry.js';
import { walkAst } from '../ast/visitor.js';

/**
 * Options for running rules against a file.
 */
export interface RuleEngineRunOptions {
  readonly filePath: string;
  readonly language: Language;
  readonly ast: ASTNode;
  readonly sourceText: string;
  readonly config: AcvConfig;
}

/**
 * Rule execution engine.
 */
export class RuleEngine {
  private readonly _registry: RuleRegistry;

  constructor(registry: RuleRegistry) {
    this._registry = registry;
  }

  /**
   * Run all applicable rules against a parsed file.
   */
  run(options: RuleEngineRunOptions): readonly Finding[] {
    const { filePath, language, ast, sourceText, config } = options;
    const findings: Finding[] = [];

    // Get applicable rules
    const enabledRules = this._registry.getEnabled(config);
    const applicableRules = enabledRules.filter((rule) => rule.languages.includes(language));

    if (applicableRules.length === 0) return [];

    // Create visitors for each rule
    const visitors: RuleVisitor[] = [];

    for (const rule of applicableRules) {
      const severity = this._registry.getEffectiveSeverity(rule, config);
      if (severity === 'off') continue;

      const context = this._createContext(
        rule,
        severity,
        filePath,
        language,
        sourceText,
        config,
        findings,
      );
      const visitor = rule.create(context);
      visitors.push(visitor);
    }

    // Walk the AST with all visitors
    walkAst(ast, visitors);

    return findings;
  }

  /**
   * Create a RuleContext for a specific rule execution.
   */
  private _createContext(
    rule: Rule,
    severity: ActiveSeverity,
    filePath: string,
    language: Language,
    sourceText: string,
    _config: AcvConfig,
    findings: Finding[],
  ): RuleContext {
    const ancestorStack: ASTNode[] = [];

    return {
      filePath,
      language,
      config: {
        enabled: true,
        severity,
        options: undefined,
      },

      report(partial): void {
        findings.push({
          ...partial,
          ruleId: rule.id,
          category: rule.category,
        });
      },

      getSourceText(node: ASTNode): string {
        const start = node.start.offset;
        const end = node.end.offset;
        return sourceText.slice(start, end);
      },

      getAncestors(): readonly ASTNode[] {
        return [...ancestorStack];
      },
    };
  }
}
