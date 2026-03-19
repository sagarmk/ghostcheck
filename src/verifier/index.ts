/**
 * Verifier module — public API for code verification.
 *
 * This module aggregates the verification pipeline components:
 * - Package verification (hallucinated import detection)
 * - npm registry verification (online HEAD-request checks)
 * - Rule engine (static analysis rule execution)
 * - Rule runner (file-level orchestration)
 * - Orchestrator (scan coordination)
 *
 * Consumers should import from here for the full verification API:
 *   import { PackageVerifier, NpmRegistryVerifier, RuleRunner } from './verifier/index.js';
 */

// Package verification (from pkg/)
export { PackageVerifier } from '../pkg/verifier.js';
export { TyposquatDetector } from '../pkg/typosquat.js';
export { BloomFilter } from '../pkg/bloom-filter.js';

// npm registry verification (online checks)
export { NpmRegistryVerifier } from './npm-registry.js';
export type { NpmRegistryResult, NpmRegistryOptions } from './npm-registry.js';

// Rule engine (from rules/)
export { RuleRegistry } from '../rules/registry.js';
export { RuleEngine } from '../rules/engine.js';

// Rule runner (from rules/)
export { RuleRunner, createRuleRunner, runRules, getBuiltinRules, getBuiltinRuleCount } from '../rules/rule-runner.js';
export type { RuleRunnerOptions, RunResult } from '../rules/rule-runner.js';
