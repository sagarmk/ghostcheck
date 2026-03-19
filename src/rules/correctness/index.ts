/**
 * Correctness rules — detect logic bugs and code quality issues.
 *
 * Rules:
 *   - dead-code-after-return
 *   - unreachable-branch
 *   - empty-catch-block
 *   - placeholder-todo-stub
 *   - unused-import
 *   - type-coercion-risk
 *   - missing-null-check
 *   - incomplete-error-handling
 */

import type { Rule } from '../../core/types.js';

/**
 * All correctness rules.
 * Each rule will be implemented in its own file and imported here.
 */
export function getCorrectnessRules(): Rule[] {
  // TODO: Import and return individual rule implementations
  return [];
}
