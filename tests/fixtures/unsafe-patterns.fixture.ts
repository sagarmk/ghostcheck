/**
 * Test fixture: Unsafe Patterns
 *
 * Contains common security antipatterns that AI code generators frequently
 * introduce. Each pattern should trigger acv/unsafe-pattern with severity 'warn'.
 */

// === eval() usage (CWE-95) ===
function dangerousEval(userInput: string): unknown {
  return eval(userInput);
}

// === new Function() usage (CWE-95) ===
function dangerousFunction(code: string): Function {
  return new Function('x', code);
}

// === innerHTML assignment (CWE-79, XSS) ===
function setContent(el: Element, html: string): void {
  el.innerHTML = html;
}

// === document.write (CWE-79) ===
function writeToPage(content: string): void {
  document.write(content);
}

// === SQL string concatenation (CWE-89) ===
function unsafeQuery(db: any, userId: string): any {
  const query = "SELECT * FROM users WHERE id = " + userId;
  return db.query(query);
}

// === SQL template literal injection (CWE-89) ===
function unsafeTemplateQuery(db: any, userId: string): any {
  return db.query(`SELECT * FROM users WHERE id = ${userId}`);
}

// === Hardcoded API key (CWE-798) ===
const api_key = 'sk-1234567890abcdef1234567890abcdef';

// === Hardcoded password (CWE-798) ===
const password = 'SuperSecretP@ss123!';

// === Hardcoded token (CWE-798) ===
const auth_token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.abcdefghijklmnop';

// === Private key in source (CWE-321) ===
const privateKey = `-----BEGIN PRIVATE KEY-----
MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC7
-----END PRIVATE KEY-----`;

// === Disabled TLS (CWE-295) ===
const httpsAgent = {
  rejectUnauthorized: false
};

// === NODE_TLS_REJECT_UNAUTHORIZED (CWE-295) ===
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

// === Generic SSL disable (CWE-295) ===
const sslConfig = {
  verify: false
};

// Export to make it valid TypeScript
export {
  dangerousEval,
  dangerousFunction,
  setContent,
  writeToPage,
  unsafeQuery,
  unsafeTemplateQuery,
  api_key,
  password,
  auth_token,
  privateKey,
  httpsAgent,
  sslConfig,
};
