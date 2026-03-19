/**
 * Test fixture: Phantom API Calls (AI-002)
 *
 * Contains calls to methods/APIs that don't exist on the referenced libraries.
 * These are common LLM hallucinations where the model invents plausible-sounding
 * methods that aren't part of the actual library API.
 *
 * Expected: Each phantom call should trigger AI-002 with severity 'warn'
 */

import express from 'express';
import fs from 'node:fs';
import path from 'node:path';

// Express phantom API calls
const app = express();
app.enableCors();                    // Not a real Express method
app.useMiddleware('auth');           // Not a real Express method (it's app.use)
app.addRoute('/api', () => {});      // Not a real Express method (it's app.get/post/etc)
app.setGlobalPrefix('/api/v1');      // This is NestJS, not Express

// Node.js fs phantom methods
fs.readFileAsync('/path/to/file');          // Not a real fs method
fs.ensureDir('/path/to/dir');               // This is fs-extra, not built-in fs
fs.writeFileAtomic('/path', 'data');        // Not a real fs method

// Node.js path phantom methods
path.ensureAbsolute('/relative/path');      // Not a real path method
path.normalizeUrl('http://example.com');    // Not a real path method

// Array phantom methods
const arr = [1, 2, 3];
arr.flatten();                               // Correct is .flat()
arr.contains(2);                             // Correct is .includes()
arr.unique();                                // Not a real Array method
arr.sortBy('name');                          // Not a real Array method
arr.groupBy((x: number) => x % 2);          // Not standard (Object.groupBy is separate)

// String phantom methods
const str = 'hello world';
str.capitalize();                            // Not a real String method
str.reverse();                               // Not a real String method
str.isEmpty();                               // Not a real String method

// Promise phantom methods
const promise = Promise.resolve(42);
Promise.delay(1000);                         // Not a real Promise method (Bluebird)
Promise.map([1, 2], (x: number) => x * 2);  // Not a real Promise method (Bluebird)

export { app, arr, str, promise };
