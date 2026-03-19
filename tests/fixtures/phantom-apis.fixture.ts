/**
 * Test fixture: Phantom API Usage
 *
 * Contains usage of non-existent Node.js APIs that AI models commonly
 * hallucinate — methods that sound plausible but don't exist.
 *
 * Expected: Each phantom API call should trigger acv/phantom-api with severity 'warn'.
 */

import fs from 'fs';
import crypto from 'crypto';
import path from 'path';

// === Non-existent fs methods ===
async function readData() {
  // fs.readFilePromise does not exist → should suggest fs.promises.readFile
  const data = await fs.readFilePromise('config.json');

  // fs.writeFileAsync does not exist → should suggest fs.promises.writeFile
  await fs.writeFileAsync('output.json', data);

  // fs.deleteFile does not exist → should suggest fs.unlink or fs.rm
  await fs.deleteFile('temp.json');

  return data;
}

// === Non-existent crypto methods ===
function hashData(input: string) {
  // crypto.generateHash does not exist → should suggest crypto.createHash
  const hash = crypto.generateHash('sha256', input);

  // crypto.hashPassword does not exist → should suggest crypto.scrypt or crypto.pbkdf2
  const hashed = crypto.hashPassword(input);

  return { hash, hashed };
}

// === Non-existent path methods ===
function pathOps(filePath: string) {
  // path.getExtension does not exist → should suggest path.extname
  const ext = path.getExtension(filePath);

  // path.getFilename does not exist → should suggest path.basename
  const name = path.getFilename(filePath);

  // path.combine does not exist → should suggest path.join
  const combined = path.combine('/home', 'user', 'file.txt');

  return { ext, name, combined };
}

// === Hallucinated global/prototype methods ===
function badGlobals() {
  // JSON.tryParse does not exist
  const parsed = JSON.tryParse('{"key": "value"}');

  // Promise.delay does not exist
  const delayed = Promise.delay(1000);

  // Math.clamp does not exist
  const clamped = Math.clamp(5, 0, 10);

  // Array.flatDeep does not exist → should suggest Array.flat(Infinity)
  const flat = Array.flatDeep([1, [2, [3]]]);

  return { parsed, delayed, clamped, flat };
}

export { readData, hashData, pathOps, badGlobals };
