/**
 * Security rules — detect vulnerabilities and unsafe patterns.
 *
 * Rules:
 *   - acv/unsafe-pattern — regex-based detection of security antipatterns
 *   - hardcoded-secret-pattern (planned — covered partially by unsafe-pattern)
 *   - eval-usage (planned — covered partially by unsafe-pattern)
 *   - sql-injection-concat (planned — covered partially by unsafe-pattern)
 *   - insecure-random (planned)
 *   - ssrf-pattern (planned)
 *   - path-traversal (planned)
 *   - prototype-pollution (planned)
 *   - xxe-parsing (planned)
 *   - open-redirect (planned)
 */

import type { Rule } from '../../core/types.js';
import { unsafePatternRule } from '../definitions/unsafe-pattern.js';

/**
 * All security rules.
 * Each rule is implemented in its own file under definitions/.
 */
export function getSecurityRules(): Rule[] {
  return [
    unsafePatternRule,
  ];
}
