/**
 * Test fixture: Outdated API Usage (AI-003)
 *
 * Contains usage of deprecated or removed APIs from popular libraries.
 * LLMs trained on older data frequently suggest APIs that have been
 * superseded by newer alternatives.
 *
 * Expected: Each deprecated usage should trigger AI-003 with severity 'warn'
 */

import { readFile } from 'node:fs';
import { createServer } from 'node:http';
import { parse } from 'node:url';

// Deprecated Node.js APIs
// url.parse() — deprecated in favor of new URL()
function parseUrl(urlStr: string): unknown {
  return parse(urlStr); // Deprecated: use new URL() instead
}

// fs.exists() — deprecated in favor of fs.access() or fs.stat()
function checkFileExists(path: string): void {
  const fs = require('node:fs');
  fs.exists(path, (exists: boolean) => {  // Deprecated
    console.log(exists);
  });
}

// Buffer constructor — deprecated in favor of Buffer.from/alloc/allocUnsafe
function createBuffer(data: string): Buffer {
  return new Buffer(data); // Deprecated: use Buffer.from(data) instead
}

// Deprecated crypto methods
function hashData(data: string): unknown {
  const crypto = require('node:crypto');
  return crypto.createCipher('aes-256-cbc', 'key'); // Deprecated: use createCipheriv
}

// Deprecated console methods in some runtimes
function logStuff(): void {
  // Using older Node.js patterns
  const util = require('node:util');
  util.print('hello');   // Deprecated: use console.log
  util.puts('world');    // Deprecated: use console.log
  util.debug('debug');   // Deprecated: use console.error
}

// React deprecated APIs (for future multi-language support)
// componentWillMount → use componentDidMount or useEffect
// componentWillReceiveProps → use getDerivedStateFromProps or useEffect
// findDOMNode → use refs instead

// Express deprecated middleware
function setupExpress(): void {
  const express = require('express');
  const app = express();
  app.configure(() => {});  // Deprecated since Express 4
  void app;
}

// Mongoose deprecated methods
function mongooseQuery(): void {
  const mongoose = require('mongoose');
  mongoose.connect('mongodb://localhost/test', { useNewUrlParser: true }); // useNewUrlParser no longer needed
  void mongoose;
}

export {
  parseUrl,
  checkFileExists,
  createBuffer,
  hashData,
  logStuff,
  setupExpress,
  mongooseQuery,
  readFile,
  createServer,
};
