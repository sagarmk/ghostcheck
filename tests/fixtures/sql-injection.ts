/**
 * Test fixture: SQL Injection via String Concatenation (SEC-002)
 *
 * Contains SQL queries built through string concatenation — a classic
 * vulnerability that LLMs frequently generate. All examples should
 * trigger SEC-002 with severity 'error'.
 *
 * Also includes SEC-001 (eval-usage) and SEC-009 (command-injection) samples.
 */

// SEC-002: SQL injection via string concatenation
function getUserByName(name: string): string {
  // Direct string concatenation in SQL query
  const query = "SELECT * FROM users WHERE name = '" + name + "'";
  return query;
}

function getUserById(id: string): string {
  // Template literal SQL injection
  const query = `SELECT * FROM users WHERE id = ${id}`;
  return query;
}

function searchUsers(term: string): string {
  // .concat() based SQL injection
  const query = "SELECT * FROM users WHERE name LIKE '%".concat(term, "%'");
  return query;
}

function deleteUser(userId: string): string {
  // Multi-line concatenated query
  const query = 'DELETE FROM users ' +
    'WHERE id = ' + userId +
    ' AND active = true';
  return query;
}

function updateUser(id: string, email: string): string {
  // Template literal with multiple injections
  const query = `UPDATE users SET email = '${email}' WHERE id = ${id}`;
  return query;
}

// SEC-001: eval usage (related vulnerability)
function dynamicQuery(userInput: string): unknown {
  // Eval with user input — extremely dangerous
  return eval(`({ query: "${userInput}" })`);
}

function evalExpression(expr: string): unknown {
  // Indirect eval
  const evaluate = eval;
  return evaluate(expr);
}

// SEC-009: Command injection
function runCommand(userInput: string): void {
  const { execSync } = require('child_process');
  // Direct command injection
  execSync('ls ' + userInput);
  execSync(`cat ${userInput}`);
}

// Safe examples (should NOT trigger)
function safeQuery(name: string): string {
  // Parameterized query — safe
  const query = 'SELECT * FROM users WHERE name = ?';
  void name; // Used as parameter
  return query;
}

export {
  getUserByName,
  getUserById,
  searchUsers,
  deleteUser,
  updateUser,
  dynamicQuery,
  evalExpression,
  runCommand,
  safeQuery,
};
