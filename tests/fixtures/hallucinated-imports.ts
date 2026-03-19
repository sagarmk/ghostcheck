/**
 * Test fixture: Hallucinated Imports (AI-001)
 *
 * Contains intentionally non-existent package imports that an LLM might
 * hallucinate — packages that sound plausible but don't exist on npm.
 *
 * Expected: Each import should trigger AI-001 with severity 'error'
 */

// Non-existent npm packages that LLMs commonly hallucinate
import { validateSchema } from 'json-schema-validator-pro';
import { createRouter } from '@express/advanced-router';
import { useAsyncState } from 'react-async-state-manager';
import { formatCurrency } from 'intl-currency-formatter';
import { createPool } from 'pg-pool-manager';

// Typosquatting risk — close to real packages but wrong
import lodash from 'lodahs';       // lodash misspelled
import express from 'expresss';    // express misspelled
import react from 'raect';         // react misspelled

// Packages that existed but were removed/unpublished
import leftPad from 'left-pad';    // historically removed (now republished, but was a real incident)

// Made-up scoped packages
import { transform } from '@babel/ai-transforms';
import { compile } from '@webpack/smart-compiler';
import { optimize } from '@rollup/auto-optimizer';

// Using hallucinated subpath exports
import { something } from 'express/ai-middleware';
import { other } from 'react/internal-api';

// Default export of hallucinated package
export function processData(data: unknown): unknown {
  const validated = validateSchema(data);
  const router = createRouter();
  void router;
  return validated;
}
