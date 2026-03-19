/**
 * Rule: unsafe-pattern
 *
 * Regex-based detection of common AI-generated security antipatterns.
 * Scans source code line-by-line for dangerous patterns and reports
 * findings with exact locations and remediation guidance.
 *
 * Rule ID: acv/unsafe-pattern
 * Severity: warn
 * Category: security
 *
 * Patterns detected:
 *   1. eval() / new Function() usage
 *   2. innerHTML assignment without sanitization
 *   3. SQL string concatenation patterns
 *   4. Hardcoded secrets (API keys, passwords, tokens)
 *   5. Disabled TLS verification
 */

import type {
  Rule,
  RuleContext,
  RuleVisitor,
  ASTNode,
  ActiveSeverity,
} from '../../core/types.js';

// =============================================================================
// Pattern definitions
// =============================================================================

interface UnsafePattern {
  /** Unique identifier within this rule */
  readonly id: string;
  /** Regex pattern to match against source lines */
  readonly pattern: RegExp;
  /** Human-readable description of the issue */
  readonly message: string;
  /** Suggested fix or alternative */
  readonly suggestion: string;
  /** OWASP Top 10 reference */
  readonly owaspRef: string | null;
  /** CWE identifier */
  readonly cweId: string;
  /** Confidence score for this pattern */
  readonly confidence: number;
  /** Patterns that indicate this is a false positive (e.g., in comments, tests) */
  readonly falsePositivePatterns?: readonly RegExp[];
  /** File path patterns that suppress this rule (reduces confidence to 0) */
  readonly skipPathPatterns?: readonly RegExp[];
}

// =============================================================================
// Path-based suppression patterns
// =============================================================================

/**
 * File paths matching these patterns are likely test, fixture, locale, seed,
 * or mock data — findings in them are almost always false positives for
 * hardcoded-secret rules.
 */
const SECRET_SKIP_PATH_PATTERNS: readonly RegExp[] = [
  /\/test\//i,
  /\/tests\//i,
  /\/__tests__\//i,
  /\/spec\//i,
  /\.test\.[tj]sx?$/i,
  /\.spec\.[tj]sx?$/i,
  /\/locales?\//i,
  /\/i18n\//i,
  /\/translations?\//i,
  /\/fixtures?\//i,
  /\/mocks?\//i,
  /\/__mocks__\//i,
  /\.fixture\./i,
  /\.mock\./i,
  /\/seeds?\//i,
  /\/seed[-_]?data\//i,
  /\/data\/static\//i,
  /\/factories?\//i,
  /\/fake[rs]?\//i,
  /\/stubs?\//i,
  /\/e2e\//i,
  /\/cypress\//i,
  /\/playwright\//i,
  /\.stories\.[tj]sx?$/i,
];

const UNSAFE_PATTERNS: readonly UnsafePattern[] = [
  // ───────────────────────────────────────────────────────────────────────────
  // 1. eval() / new Function() usage
  // ───────────────────────────────────────────────────────────────────────────
  {
    id: 'eval-usage',
    pattern: /\beval\s*\(/g,
    message: 'eval() usage detected. eval() executes arbitrary code and is a major security risk.',
    suggestion: 'Use JSON.parse() for data, Function constructor with strict sandboxing, or refactor to avoid dynamic code execution entirely.',
    owaspRef: 'A03:2021-Injection',
    cweId: 'CWE-95',
    confidence: 0.95,
    falsePositivePatterns: [
      /['"]eval['"]/,  // String containing 'eval'
      /\.\$eval\s*\(/,  // Puppeteer/Playwright page.$eval()
      /\.\$\$eval\s*\(/,  // Puppeteer page.$$eval()
      /['"].*eval\(\).*['"]/,  // eval() mentioned in a string (rule descriptions)
      /message.*eval/i,  // error messages mentioning eval
      /usage detected/i,  // Rule description strings (e.g., "eval() usage detected")
      /is a major security risk/i,  // Rule description strings
      /description.*eval/i,  // Description strings mentioning eval
      /suggestion.*eval/i,  // Suggestion strings mentioning eval
    ],
  },
  {
    id: 'new-function',
    pattern: /\bnew\s+Function\s*\(/g,
    message: 'new Function() usage detected. Like eval(), it creates code from strings and enables code injection.',
    suggestion: 'Avoid dynamic function creation from strings. Use closures, higher-order functions, or template-based approaches instead.',
    owaspRef: 'A03:2021-Injection',
    cweId: 'CWE-95',
    confidence: 0.9,
  },

  // ───────────────────────────────────────────────────────────────────────────
  // 2. innerHTML assignment without sanitization
  // ───────────────────────────────────────────────────────────────────────────
  {
    id: 'innerhtml-assignment',
    pattern: /\.innerHTML\s*[+]?=/g,
    message: 'Direct innerHTML assignment detected. This can lead to Cross-Site Scripting (XSS) if the content is not sanitized.',
    suggestion: 'Use textContent for text, or sanitize with DOMPurify/sanitize-html before setting innerHTML. Consider using a framework\'s safe rendering (React JSX, Vue templates).',
    owaspRef: 'A03:2021-Injection',
    cweId: 'CWE-79',
    confidence: 0.85,
    falsePositivePatterns: [
      /DOMPurify\.sanitize/,
      /sanitizeHtml/,
      /sanitize\s*\(/,
      /xss\s*\(/,
    ],
  },
  {
    id: 'outerhtml-assignment',
    pattern: /\.outerHTML\s*[+]?=/g,
    message: 'Direct outerHTML assignment detected. This has the same XSS risks as innerHTML.',
    suggestion: 'Use safe DOM manipulation methods or sanitize content before assignment.',
    owaspRef: 'A03:2021-Injection',
    cweId: 'CWE-79',
    confidence: 0.85,
  },
  {
    id: 'document-write',
    pattern: /\bdocument\.write\s*\(/g,
    message: 'document.write() usage detected. This can enable XSS and disrupts page rendering.',
    suggestion: 'Use DOM manipulation methods (createElement, appendChild) or a templating framework instead.',
    owaspRef: 'A03:2021-Injection',
    cweId: 'CWE-79',
    confidence: 0.8,
  },

  // ───────────────────────────────────────────────────────────────────────────
  // 3. SQL string concatenation patterns
  // ───────────────────────────────────────────────────────────────────────────
  {
    id: 'sql-concat-plus',
    pattern: /(?:SELECT|INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|TRUNCATE|EXEC)\s+.*\+\s*(?:\w+|\()/gi,
    message: 'SQL string concatenation detected. Concatenating user input into SQL queries enables SQL injection.',
    suggestion: 'Use parameterized queries (prepared statements) instead: db.query("SELECT * FROM users WHERE id = ?", [userId])',
    owaspRef: 'A03:2021-Injection',
    cweId: 'CWE-89',
    confidence: 0.8,
  },
  {
    id: 'sql-template-literal',
    pattern: /`\s*(?:SELECT|INSERT\s+INTO|UPDATE|DELETE\s+FROM|DROP|ALTER|TRUNCATE)\s+.*\$\{/gi,
    message: 'SQL query with template literal interpolation detected. Embedding variables directly in SQL strings enables injection.',
    suggestion: 'Use parameterized queries instead of template literals for SQL: db.query("SELECT * FROM users WHERE id = $1", [userId])',
    owaspRef: 'A03:2021-Injection',
    cweId: 'CWE-89',
    confidence: 0.85,
    falsePositivePatterns: [
      /Failed to/i,
      /Error:/i,
      /console\./,
      /throw\s+new/,
      /message/i,
      /log(?:Error|Warn|Info|Debug)?\s*\(/i,
    ],
  },

  // ───────────────────────────────────────────────────────────────────────────
  // 4. Hardcoded secrets
  // ───────────────────────────────────────────────────────────────────────────
  {
    id: 'hardcoded-api-key',
    pattern: /(?:api[_-]?key|apikey)\s*[:=]\s*['"`][A-Za-z0-9_\-./+]{8,}['"`]/gi,
    message: 'Hardcoded API key detected. API keys should never be committed to source code.',
    suggestion: 'Move the API key to environment variables (process.env.API_KEY) or a secrets manager. Use .env files with dotenv for local development.',
    owaspRef: 'A02:2021-Cryptographic Failures',
    cweId: 'CWE-798',
    confidence: 0.85,
    skipPathPatterns: SECRET_SKIP_PATH_PATTERNS,
    falsePositivePatterns: [
      /process\.env/,
      /example/i,
      /placeholder/i,
      /your[_-]?api[_-]?key/i,
      /xxx+/i,
      /\.\.\.+/,
      /mock|stub|fake|fixture|factory/i,
      /seed|sample|demo|dummy/i,
      /describe\s*\(/,
      /it\s*\(/,
      /expect\s*\(/,
    ],
  },
  {
    id: 'hardcoded-password',
    pattern: /(?:password|passwd|pwd)\s*[:=]\s*['"`][^'"`\s]{4,}['"`]/gi,
    message: 'Hardcoded password detected. Passwords should never appear in source code.',
    suggestion: 'Use environment variables, a secrets manager (AWS Secrets Manager, HashiCorp Vault), or prompt for credentials at runtime.',
    owaspRef: 'A02:2021-Cryptographic Failures',
    cweId: 'CWE-798',
    confidence: 0.8,
    skipPathPatterns: SECRET_SKIP_PATH_PATTERNS,
    falsePositivePatterns: [
      /process\.env/,
      /example/i,
      /placeholder/i,
      /your[_-]?password/i,
      /xxx+/i,
      /\.\.\.+/,
      /password123/i,
      /\*{3,}/,
      /`[^`]*\$\{/,  // Template literals with interpolation = dynamic, not hardcoded
      /Date\.now\(\)/,  // Dynamic values
      /Math\.random\(\)/,  // Dynamic values
      /['"]Password['"]\s*:/,  // Translation/locale key-value pairs (e.g., "Password": "Heslo")
      /i18n|translate|locale|intl/i,  // Internationalization context
      /\.json['"]\s*$/,  // JSON file references
      /describe\s*\(/,  // Test describe blocks
      /it\s*\(/,  // Test it() blocks
      /expect\s*\(/,  // Test assertions
      /assert/i,  // Test assertions
      /mock|stub|fake|fixture|factory/i,  // Test/mock data indicators
      /seed|sample|demo|dummy/i,  // Seed/demo data indicators
      /defaultPassword|initialPassword|resetPassword/i,  // Password field names (not values)
      /\.setAttribute\s*\(\s*['"]type['"]\s*,\s*['"]password['"]/,  // DOM type="password"
      /type\s*[:=]\s*['"]password['"]/,  // Input type password
      /input.*password|password.*input/i,  // Password input references
      /label|placeholder|hint|title|aria/i,  // UI label/hint context
      /validation|validator|schema|required/i,  // Validation context
    ],
  },
  {
    id: 'hardcoded-token',
    pattern: /(?:secret|token|auth[_-]?token|access[_-]?token|bearer)\s*[:=]\s*['"`][A-Za-z0-9_\-./+=]{8,}['"`]/gi,
    message: 'Hardcoded secret/token detected. Tokens and secrets should never be committed to source code.',
    suggestion: 'Store secrets in environment variables or a dedicated secrets manager. Use .env files with dotenv for local development.',
    owaspRef: 'A02:2021-Cryptographic Failures',
    cweId: 'CWE-798',
    confidence: 0.8,
    skipPathPatterns: SECRET_SKIP_PATH_PATTERNS,
    falsePositivePatterns: [
      /process\.env/,
      /example/i,
      /placeholder/i,
      /your[_-]?token/i,
      /xxx+/i,
      /\.\.\.+/,
      /mock|stub|fake|fixture|factory/i,
      /seed|sample|demo|dummy/i,
      /describe\s*\(/,
      /it\s*\(/,
      /expect\s*\(/,
    ],
  },
  {
    id: 'hardcoded-private-key',
    pattern: /-----BEGIN\s+(?:RSA\s+)?PRIVATE\s+KEY-----/g,
    message: 'Private key detected in source code. Private keys must never be committed to version control.',
    suggestion: 'Store private keys in a secure key management system. Use file references or environment variables to load keys at runtime.',
    owaspRef: 'A02:2021-Cryptographic Failures',
    cweId: 'CWE-321',
    confidence: 0.98,
  },

  // ───────────────────────────────────────────────────────────────────────────
  // 5. Disabled TLS verification
  // ───────────────────────────────────────────────────────────────────────────
  {
    id: 'reject-unauthorized-false',
    pattern: /rejectUnauthorized\s*:\s*false/g,
    message: 'TLS certificate verification is disabled (rejectUnauthorized: false). This makes HTTPS connections vulnerable to man-in-the-middle attacks.',
    suggestion: 'Remove rejectUnauthorized: false. If you need to work with self-signed certificates in development, use the NODE_EXTRA_CA_CERTS environment variable instead.',
    owaspRef: 'A02:2021-Cryptographic Failures',
    cweId: 'CWE-295',
    confidence: 0.95,
  },
  {
    id: 'tls-reject-env',
    pattern: /NODE_TLS_REJECT_UNAUTHORIZED\s*[=:]\s*['"`]?0['"`]?/g,
    message: 'TLS certificate verification is being disabled globally via NODE_TLS_REJECT_UNAUTHORIZED=0. This affects ALL HTTPS connections in the process.',
    suggestion: 'Never disable TLS verification globally. For self-signed certs, use NODE_EXTRA_CA_CERTS to add specific CA certificates.',
    owaspRef: 'A02:2021-Cryptographic Failures',
    cweId: 'CWE-295',
    confidence: 0.98,
  },
  {
    id: 'insecure-ssl',
    pattern: /(?:verify|checkServerIdentity|secure)\s*:\s*false/g,
    message: 'SSL/TLS verification appears to be disabled. This makes connections vulnerable to interception.',
    suggestion: 'Ensure SSL/TLS verification is enabled. Configure proper certificates instead of disabling verification.',
    owaspRef: 'A02:2021-Cryptographic Failures',
    cweId: 'CWE-295',
    confidence: 0.7,
  },
];

// =============================================================================
// Helpers
// =============================================================================

/**
 * Check if a source line is inside a comment.
 */
function isCommentLine(line: string): boolean {
  const trimmed = line.trim();
  return (
    trimmed.startsWith('//') ||
    trimmed.startsWith('*') ||
    trimmed.startsWith('/*') ||
    trimmed.startsWith('<!--')
  );
}

/**
 * Check if a line is a metadata/description/example string in a rule definition.
 * These lines contain the patterns they describe but are NOT actual code.
 *
 * Matches lines like:
 *   message: 'eval() usage detected...',
 *   suggestion: 'Use JSON.parse() instead...',
 *   bad: "const result = eval(userInput);",
 *   good: "const result = JSON.parse(userInput);",
 *   description: 'Detects SQL injection...',
 *   /pattern/,  // Regex literal in an array (falsePositivePatterns etc.)
 */
function isMetadataString(line: string): boolean {
  const trimmed = line.trim();
  return (
    /^\s*(?:message|suggestion|suggestedFix|description|bad|good|owaspRef)\s*[:=]\s*['"`]/i.test(trimmed) ||
    /^\s*\/.*\/[gimsuy]*\s*,?\s*(?:\/\/.*)?$/.test(trimmed)  // Regex literal line (e.g., /pattern/, or /pattern/g,)
  );
}

/**
 * Check if a line matches any false-positive patterns.
 */
function matchesFalsePositive(
  line: string,
  patterns: readonly RegExp[] | undefined,
): boolean {
  if (!patterns || patterns.length === 0) return false;
  return patterns.some((p) => p.test(line));
}

/**
 * Get the context window around a match — the surrounding lines.
 */
function getCodeSnippet(
  lines: readonly string[],
  lineIdx: number,
): string {
  if (lineIdx >= 0 && lineIdx < lines.length) {
    return (lines[lineIdx] ?? '').trim();
  }
  return '';
}

// =============================================================================
// Rule definition
// =============================================================================

export const unsafePatternRule: Rule = {
  id: 'acv/unsafe-pattern',
  name: 'Unsafe Pattern',
  category: 'security',
  defaultSeverity: 'warn',
  languages: ['javascript', 'typescript'],
  meta: {
    description:
      'Detects common security antipatterns frequently introduced by AI code generators: ' +
      'eval/Function injection, innerHTML XSS, SQL injection via concatenation, ' +
      'hardcoded secrets, and disabled TLS verification.',
    fixable: false,
    confidence: 0.85,
    falsePositiveRate: 0.12,
    examples: [
      {
        description: 'eval() usage',
        bad: 'const result = eval(userInput);',
        good: 'const result = JSON.parse(userInput);',
      },
      {
        description: 'SQL injection via concatenation',
        bad: "db.query('SELECT * FROM users WHERE id = ' + userId);",
        good: "db.query('SELECT * FROM users WHERE id = ?', [userId]);",
      },
      {
        description: 'Hardcoded API key',
        bad: "const apiKey = 'sk-1234567890abcdef';",
        good: "const apiKey = process.env.API_KEY;",
      },
    ],
  },

  create(context: RuleContext): RuleVisitor {
    const severity = context.config.severity as ActiveSeverity;
    let scanned = false;

    function scanSource(node: ASTNode): void {
      if (scanned) return;
      scanned = true;

      const source = context.getSourceText(node);
      if (!source || source.length === 0) return;

      const lines = source.split('\n');

      for (const unsafePattern of UNSAFE_PATTERNS) {
        // Skip this pattern entirely if the file path matches skipPathPatterns
        if (
          unsafePattern.skipPathPatterns &&
          unsafePattern.skipPathPatterns.some((p) => p.test(context.filePath))
        ) {
          continue;
        }

        // Reset regex state for global patterns
        unsafePattern.pattern.lastIndex = 0;

        let match: RegExpExecArray | null;

        while ((match = unsafePattern.pattern.exec(source)) !== null) {
          // Compute line/column from character offset
          const offset = match.index;
          let line = 1;
          let lastNewline = -1;

          for (let i = 0; i < offset && i < source.length; i++) {
            if (source[i] === '\n') {
              line++;
              lastNewline = i;
            }
          }

          const column = offset - lastNewline;
          const lineIdx = line - 1;
          const lineText = lines[lineIdx] ?? '';

          // Skip if the line is a comment
          if (isCommentLine(lineText)) continue;

          // Skip if the line is a metadata/description string (rule definitions, configs)
          if (isMetadataString(lineText)) continue;

          // Skip if the line matches false-positive patterns
          if (matchesFalsePositive(lineText, unsafePattern.falsePositivePatterns)) continue;

          // Skip if it looks like a test/mock/example context
          const lowerLine = lineText.toLowerCase();
          if (
            lowerLine.includes('// eslint-disable') ||
            lowerLine.includes('// nosec') ||
            lowerLine.includes('// nolint') ||
            lowerLine.includes('// safe:') ||
            lowerLine.includes('// ghostcheck-ignore') ||
            lowerLine.includes('// ghostcheck-disable')
          ) continue;

          // Skip if previous line has ghostcheck-disable-next-line
          if (lineIdx > 0) {
            const prevLine = (lines[lineIdx - 1] ?? '').toLowerCase();
            if (prevLine.includes('// ghostcheck-disable-next-line')) continue;
          }

          const matchLen = match[0].length;

          context.report({
            severity,
            ruleName: 'Unsafe Pattern',
            message: unsafePattern.message,
            filePath: context.filePath,
            line,
            column,
            endLine: line,
            endColumn: column + matchLen,
            codeSnippet: getCodeSnippet(lines, lineIdx),
            fix: null,
            suggestedFix: unsafePattern.suggestion,
            suggestion: unsafePattern.suggestion,
            owaspRef: unsafePattern.owaspRef,
            confidence: unsafePattern.confidence,
            meta: {
              cweId: unsafePattern.cweId,
              patternId: unsafePattern.id,
            },
          });
        }
      }
    }

    return {
      Program: scanSource,
      Module: scanSource,
    };
  },
};
