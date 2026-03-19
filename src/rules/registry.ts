/**
 * Rule registry — discovers and manages all available rules.
 *
 * Rules are registered at startup (built-in + plugins) and
 * filtered per-file based on language and configuration.
 */

import type { Rule, Language, RuleCategory, Severity, AcvConfig } from '../core/types.js';

/**
 * Registry of all available rules.
 */
export class RuleRegistry {
  private readonly _rules = new Map<string, Rule>();

  /**
   * Register a rule. Throws if a rule with the same ID already exists.
   */
  register(rule: Rule): void {
    if (this._rules.has(rule.id)) {
      throw new Error(`Duplicate rule ID: "${rule.id}"`);
    }
    this._rules.set(rule.id, rule);
  }

  /**
   * Register multiple rules at once.
   */
  registerAll(rules: readonly Rule[]): void {
    for (const rule of rules) {
      this.register(rule);
    }
  }

  /**
   * Get a rule by ID.
   */
  get(id: string): Rule | undefined {
    return this._rules.get(id);
  }

  /**
   * Get all registered rules.
   */
  getAll(): readonly Rule[] {
    return [...this._rules.values()];
  }

  /**
   * Get rules applicable to a specific language.
   */
  getForLanguage(language: Language): readonly Rule[] {
    return this.getAll().filter((rule) => rule.languages.includes(language));
  }

  /**
   * Get rules in a specific category.
   */
  getByCategory(category: RuleCategory): readonly Rule[] {
    return this.getAll().filter((rule) => rule.category === category);
  }

  /**
   * Get rules that are enabled in the given config.
   * Respects per-rule severity overrides and category toggles.
   */
  getEnabled(config: AcvConfig): readonly Rule[] {
    return this.getAll().filter((rule) => {
      // Check category toggle
      if (!config.categories[rule.category]) return false;

      // Check per-rule severity override
      const severity = config.rules[rule.id] as Severity | undefined;
      if (severity === 'off') return false;

      return true;
    });
  }

  /**
   * Get the effective severity for a rule, considering config overrides.
   */
  getEffectiveSeverity(rule: Rule, config: AcvConfig): Severity {
    const override = config.rules[rule.id] as Severity | undefined;
    return override ?? rule.defaultSeverity;
  }

  /**
   * Total number of registered rules.
   */
  get size(): number {
    return this._rules.size;
  }
}
