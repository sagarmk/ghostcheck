/**
 * Rules module — rule registry, engine, runner, and built-in rules.
 */

export { RuleRegistry } from './registry.js';
export { RuleEngine } from './engine.js';
export { RuleRunner, createRuleRunner, runRules, getBuiltinRules, getBuiltinRuleCount } from './rule-runner.js';
export type { RuleRunnerOptions, RunResult } from './rule-runner.js';
