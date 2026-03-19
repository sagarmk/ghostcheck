/**
 * Test fixture: Mixed Issues
 *
 * Combines ALL issue types in a single file:
 * - Hallucinated imports (acv/hallucinated-package)
 * - Phantom API usage (acv/phantom-api)
 * - Unsafe patterns (acv/unsafe-pattern)
 *
 * Expected: Findings from all three rules in a single scan.
 */

// === Hallucinated imports ===
import { smartValidate } from 'ai-form-validator';
import { magicSort } from 'array-magic-utils';

// === Real imports (used for phantom API detection) ===
import fs from 'fs';
import crypto from 'crypto';

// === Hallucinated package import: phantom API on hallucinated module ===

// === Phantom API usage on real modules ===
async function processFile(filePath: string): Promise<string> {
  // fs.readFilePromise does not exist
  const content = await fs.readFilePromise(filePath);

  // crypto.generateHash does not exist
  const hash = crypto.generateHash('sha256', content);

  return hash;
}

// === Unsafe patterns ===

// eval() usage
function executeUserCode(code: string): unknown {
  return eval(code);
}

// innerHTML assignment
function renderHtml(element: Element, html: string): void {
  element.innerHTML = html;
}

// SQL concatenation
function findUser(db: any, userId: string): any {
  return db.query("SELECT * FROM users WHERE id = " + userId);
}

// Hardcoded API key
const api_key = 'sk-abcdefghijklmnopqrstuvwxyz123456';

// Disabled TLS
const agent = {
  rejectUnauthorized: false
};

// === Hallucinated global methods ===
function misc() {
  const parsed = JSON.tryParse('{}');
  const clamped = Math.clamp(5, 0, 10);
  return { parsed, clamped };
}

// Use all imports and functions
export {
  processFile,
  executeUserCode,
  renderHtml,
  findUser,
  api_key,
  agent,
  misc,
  smartValidate,
  magicSort,
};
