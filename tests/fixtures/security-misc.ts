/**
 * Test fixture: Miscellaneous Security Issues
 *
 * Covers SEC-004 through SEC-013:
 *   SEC-004: insecure-random
 *   SEC-005: missing-csrf
 *   SEC-006: open-redirect
 *   SEC-007: xxe-parsing
 *   SEC-008: prototype-pollution
 *   SEC-009: command-injection (additional samples)
 *   SEC-010: path-traversal
 *   SEC-011: unsafe-deserialization
 *   SEC-012: cors-wildcard
 *   SEC-013: ssrf-pattern
 */

// SEC-004: Insecure random number generation
function generateToken(): string {
  // Math.random() is not cryptographically secure
  return Math.random().toString(36).substring(2);
}

function generateSessionId(): string {
  // Predictable ID generation
  return 'session_' + Math.floor(Math.random() * 1000000);
}

// SEC-006: Open redirect vulnerability
function handleRedirect(req: { query: { url?: string } }, res: { redirect: (url: string) => void }): void {
  // Unvalidated redirect from user input
  const redirectUrl = req.query.url;
  if (redirectUrl) {
    res.redirect(redirectUrl);
  }
}

// SEC-008: Prototype pollution
function mergeDeep(target: Record<string, unknown>, source: Record<string, unknown>): Record<string, unknown> {
  for (const key in source) {
    // No __proto__ / constructor / prototype check!
    if (typeof source[key] === 'object' && source[key] !== null) {
      target[key] = mergeDeep(
        (target[key] as Record<string, unknown>) || {},
        source[key] as Record<string, unknown>,
      );
    } else {
      target[key] = source[key];
    }
  }
  return target;
}

// SEC-010: Path traversal
function readUserFile(filename: string): string {
  const fs = require('node:fs');
  // User-controlled path without sanitization
  return fs.readFileSync('/uploads/' + filename, 'utf-8');
}

function serveFile(req: { params: { path: string } }): string {
  const fs = require('node:fs');
  const path = require('node:path');
  // Path traversal via path.join with user input
  const filePath = path.join('/public', req.params.path);
  return fs.readFileSync(filePath, 'utf-8');
}

// SEC-011: Unsafe deserialization
function deserializeData(data: string): unknown {
  // Using eval for deserialization
  return eval('(' + data + ')');
}

// SEC-012: CORS wildcard
function setupCors(): Record<string, unknown> {
  return {
    origin: '*',  // Allows ALL origins — insecure
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
  };
}

// SEC-013: SSRF pattern
async function fetchUrl(userProvidedUrl: string): Promise<unknown> {
  // User-controlled URL — SSRF risk
  const response = await fetch(userProvidedUrl);
  return response.json();
}

async function proxyRequest(req: { body: { target: string } }): Promise<unknown> {
  // Proxy to user-controlled target
  const response = await fetch(req.body.target);
  return response.text();
}

export {
  generateToken,
  generateSessionId,
  handleRedirect,
  mergeDeep,
  readUserFile,
  serveFile,
  deserializeData,
  setupCors,
  fetchUrl,
  proxyRequest,
};
