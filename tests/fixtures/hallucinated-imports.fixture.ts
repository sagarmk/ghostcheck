/**
 * Test fixture: Hallucinated Imports
 *
 * Contains intentionally non-existent package imports that an LLM might
 * hallucinate — packages that sound plausible but don't exist on npm.
 *
 * Expected: Each bare import of a non-existent package should trigger
 * acv/hallucinated-package with severity 'error'.
 */

// === Hallucinated packages — should all trigger findings ===

// Completely made-up packages
import { createForm } from 'react-magic-form';
import { validate } from 'super-validator';
import { aiHelper } from 'ai-helper-utils';

// Made-up scoped packages
import { transform } from '@babel/ai-transforms';
import { compile } from '@webpack/smart-compiler';

// Typos of real packages — should trigger with "Did you mean?" suggestion
import lodash from 'lodahs';       // lodash misspelled (distance 2)
import expressDep from 'expresss';  // express misspelled (distance 1)
import reactDep from 'raect';       // react misspelled (distance 2)

// More plausible-sounding hallucinated packages
import { formatCurrency } from 'intl-currency-formatter';
import { createPool } from 'pg-pool-manager';
import { useAsyncState } from 'react-async-state-manager';

// Use the imports to avoid unused-import warnings
export function processData(data: unknown): unknown {
  const form = createForm();
  const valid = validate(data);
  const help = aiHelper(data);
  const t = transform(data);
  const c = compile(data);
  const curr = formatCurrency(100);
  const pool = createPool();
  const state = useAsyncState();
  void lodash;
  void expressDep;
  void reactDep;
  return { form, valid, help, t, c, curr, pool, state };
}
