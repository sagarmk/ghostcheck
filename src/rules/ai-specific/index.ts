/**
 * AI-specific rules — detect hallucinations and AI code smells.
 *
 * Rules:
 *   - acv/hallucinated-package — detects imports of non-existent npm packages
 *   - acv/phantom-api — detects usage of non-existent APIs on known objects
 *   - outdated-api-usage (planned)
 *   - cargo-cult-pattern (planned)
 *   - over-commented-obvious-code (planned)
 *   - inconsistent-naming-convention (planned)
 */

import type { Rule } from '../../core/types.js';
import { hallucinatedPackageRule } from '../definitions/hallucinated-package.js';
import { phantomApiUsageRule } from '../definitions/phantom-api-usage.js';

/**
 * All AI-specific rules.
 * Each rule is implemented in its own file under definitions/.
 */
export function getAiSpecificRules(): Rule[] {
  return [
    hallucinatedPackageRule,
    phantomApiUsageRule,
  ];
}
