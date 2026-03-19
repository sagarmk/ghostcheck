/**
 * Rule: phantom-api-usage
 *
 * Detects usage of non-existent APIs on known objects — a common pattern
 * where AI models hallucinate plausible-sounding method names that don't
 * actually exist in the standard library.
 *
 * Rule ID: acv/phantom-api
 * Severity: warn
 * Category: ai-specific
 *
 * Checks:
 *   1. Node.js built-in API misuse — e.g., fs.readFilePromise (doesn't exist)
 *   2. Common hallucinated method patterns on standard JS objects
 *
 * Uses a curated map of known Node.js module exports and regex patterns
 * for common hallucinated methods.
 */

import type {
  Rule,
  RuleContext,
  RuleVisitor,
  ASTNode,
  ActiveSeverity,
} from '../../core/types.js';

// =============================================================================
// Curated Node.js module exports
// =============================================================================

/**
 * Map of Node.js built-in module names to their known exports.
 * This is intentionally curated (not exhaustive) to focus on the most
 * commonly misused APIs.
 */
const NODE_API_MAP: Readonly<Record<string, ReadonlySet<string>>> = {
  fs: new Set([
    'access', 'accessSync', 'appendFile', 'appendFileSync', 'chmod',
    'chmodSync', 'chown', 'chownSync', 'close', 'closeSync', 'constants',
    'copyFile', 'copyFileSync', 'cp', 'cpSync', 'createReadStream',
    'createWriteStream', 'exists', 'existsSync', 'fchmod', 'fchmodSync',
    'fchown', 'fchownSync', 'fdatasync', 'fdatasyncSync', 'fstat',
    'fstatSync', 'fsync', 'fsyncSync', 'ftruncate', 'ftruncateSync',
    'futimes', 'futimesSync', 'lchmod', 'lchmodSync', 'lchown',
    'lchownSync', 'link', 'linkSync', 'lstat', 'lstatSync', 'lutimes',
    'lutimesSync', 'mkdir', 'mkdirSync', 'mkdtemp', 'mkdtempSync',
    'open', 'openSync', 'opendir', 'opendirSync', 'read', 'readSync',
    'readdir', 'readdirSync', 'readFile', 'readFileSync', 'readlink',
    'readlinkSync', 'realpath', 'realpathSync', 'rename', 'renameSync',
    'rm', 'rmSync', 'rmdir', 'rmdirSync', 'stat', 'statSync', 'statfs',
    'statfsSync', 'symlink', 'symlinkSync', 'truncate', 'truncateSync',
    'unlink', 'unlinkSync', 'unwatchFile', 'utimes', 'utimesSync',
    'watch', 'watchFile', 'write', 'writeSync', 'writeFile',
    'writeFileSync', 'writev', 'writevSync', 'readv', 'readvSync',
    'Dirent', 'Stats', 'ReadStream', 'WriteStream', 'Dir',
    'promises', 'FileHandle',
  ]),

  path: new Set([
    'basename', 'delimiter', 'dirname', 'extname', 'format', 'isAbsolute',
    'join', 'normalize', 'parse', 'posix', 'relative', 'resolve', 'sep',
    'toNamespacedPath', 'win32',
  ]),

  crypto: new Set([
    'Certificate', 'Cipher', 'Decipher', 'DiffieHellman',
    'DiffieHellmanGroup', 'ECDH', 'Hash', 'Hmac', 'KeyObject', 'Sign',
    'Verify', 'X509Certificate', 'checkPrime', 'checkPrimeSync',
    'constants', 'createCipheriv', 'createDecipheriv',
    'createDiffieHellman', 'createDiffieHellmanGroup', 'createECDH',
    'createHash', 'createHmac', 'createPrivateKey', 'createPublicKey',
    'createSecretKey', 'createSign', 'createVerify', 'diffieHellman',
    'generateKey', 'generateKeyPair', 'generateKeyPairSync',
    'generateKeySync', 'generatePrime', 'generatePrimeSync', 'getCiphers',
    'getCurves', 'getDiffieHellman', 'getFips', 'getHashes',
    'getRandomValues', 'hash', 'hkdf', 'hkdfSync', 'pbkdf2',
    'pbkdf2Sync', 'privateDecrypt', 'privateEncrypt', 'publicDecrypt',
    'publicEncrypt', 'randomBytes', 'randomFill', 'randomFillSync',
    'randomInt', 'randomUUID', 'scrypt', 'scryptSync', 'secureHeapUsed',
    'setEngine', 'setFips', 'sign', 'subtle', 'timingSafeEqual',
    'verify', 'webcrypto',
  ]),

  http: new Set([
    'Agent', 'ClientRequest', 'IncomingMessage', 'METHODS', 'OutgoingMessage',
    'STATUS_CODES', 'Server', 'ServerResponse', 'createServer', 'get',
    'globalAgent', 'maxHeaderSize', 'request', 'validateHeaderName',
    'validateHeaderValue', 'setMaxIdleHTTPParsers',
  ]),

  https: new Set([
    'Agent', 'Server', 'createServer', 'get', 'globalAgent', 'request',
  ]),

  url: new Set([
    'URL', 'URLSearchParams', 'domainToASCII', 'domainToUnicode',
    'fileURLToPath', 'format', 'pathToFileURL', 'resolve', 'parse',
    'urlToHttpOptions',
  ]),

  os: new Set([
    'EOL', 'arch', 'availableParallelism', 'constants', 'cpus', 'devNull',
    'endianness', 'freemem', 'getPriority', 'homedir', 'hostname',
    'loadavg', 'machine', 'networkInterfaces', 'platform', 'release',
    'setPriority', 'tmpdir', 'totalmem', 'type', 'uptime', 'userInfo',
    'version',
  ]),

  util: new Set([
    'TextDecoder', 'TextEncoder', 'callbackify', 'debuglog', 'deprecate',
    'format', 'formatWithOptions', 'getSystemErrorName',
    'getSystemErrorMap', 'inherits', 'inspect', 'isDeepStrictEqual',
    'parseArgs', 'parseEnv', 'promisify', 'stripVTControlCharacters',
    'styleText', 'toUSVString', 'transferableAbortController',
    'transferableAbortSignal', 'types', 'MIMEType', 'MIMEParams',
  ]),

  events: new Set([
    'EventEmitter', 'captureRejectionSymbol', 'captureRejections',
    'defaultMaxListeners', 'errorMonitor', 'getEventListeners',
    'getMaxListeners', 'listenerCount', 'on', 'once',
    'setMaxListeners', 'addAbortListener',
  ]),

  child_process: new Set([
    'ChildProcess', 'exec', 'execFile', 'execFileSync', 'execSync',
    'fork', 'spawn', 'spawnSync',
  ]),

  buffer: new Set([
    'Buffer', 'Blob', 'File', 'SlowBuffer', 'atob', 'btoa', 'constants',
    'isAscii', 'isUtf8', 'kMaxLength', 'kStringMaxLength',
    'resolveObjectURL', 'transcode',
  ]),

  stream: new Set([
    'Duplex', 'PassThrough', 'Readable', 'Stream', 'Transform',
    'Writable', 'addAbortSignal', 'finished', 'isErrored', 'isReadable',
    'pipeline', 'compose', 'promises',
  ]),

  net: new Set([
    'BlockList', 'Server', 'Socket', 'SocketAddress', 'connect',
    'createConnection', 'createServer', 'getDefaultAutoSelectFamily',
    'getDefaultAutoSelectFamilyAttemptTimeout', 'isIP', 'isIPv4',
    'isIPv6', 'setDefaultAutoSelectFamily',
    'setDefaultAutoSelectFamilyAttemptTimeout',
  ]),

  dns: new Set([
    'ADDRCONFIG', 'ALL', 'Resolver', 'V4MAPPED', 'getServers', 'lookup',
    'lookupService', 'promises', 'resolve', 'resolve4', 'resolve6',
    'resolveAny', 'resolveCaa', 'resolveCname', 'resolveMx',
    'resolveNaptr', 'resolveNs', 'resolvePtr', 'resolveSoa',
    'resolveSrv', 'resolveTxt', 'reverse', 'setDefaultResultOrder',
    'setServers',
  ]),

  zlib: new Set([
    'BrotliCompress', 'BrotliDecompress', 'Deflate', 'DeflateRaw',
    'Gunzip', 'Gzip', 'Inflate', 'InflateRaw', 'Unzip',
    'brotliCompress', 'brotliCompressSync', 'brotliDecompress',
    'brotliDecompressSync', 'constants', 'createBrotliCompress',
    'createBrotliDecompress', 'createDeflate', 'createDeflateRaw',
    'createGunzip', 'createGzip', 'createInflate', 'createInflateRaw',
    'createUnzip', 'deflate', 'deflateRaw', 'deflateRawSync',
    'deflateSync', 'gunzip', 'gunzipSync', 'gzip', 'gzipSync',
    'inflate', 'inflateRaw', 'inflateRawSync', 'inflateSync',
    'unzip', 'unzipSync',
  ]),

  querystring: new Set([
    'decode', 'encode', 'escape', 'parse', 'stringify', 'unescape',
  ]),

  readline: new Set([
    'Interface', 'clearLine', 'clearScreenDown', 'createInterface',
    'cursorTo', 'moveCursor', 'promises',
  ]),

  assert: new Set([
    'AssertionError', 'CallTracker', 'deepEqual', 'deepStrictEqual',
    'doesNotMatch', 'doesNotReject', 'doesNotThrow', 'equal', 'fail',
    'ifError', 'match', 'notDeepEqual', 'notDeepStrictEqual',
    'notEqual', 'notStrictEqual', 'ok', 'rejects', 'strict',
    'strictEqual', 'throws',
  ]),

  process: new Set([
    'abort', 'allowedNodeEnvironmentFlags', 'arch', 'argv', 'argv0',
    'channel', 'chdir', 'config', 'connected', 'constrainedMemory',
    'cpuUsage', 'cwd', 'debugPort', 'disconnect', 'dlopen',
    'emitWarning', 'env', 'execArgv', 'execPath', 'exit', 'exitCode',
    'features', 'getActiveResourcesInfo', 'getegid', 'geteuid',
    'getgid', 'getgroups', 'getuid', 'hasUncaughtExceptionCaptureCallback',
    'hrtime', 'kill', 'mainModule', 'memoryUsage', 'nextTick',
    'noDeprecation', 'pid', 'platform', 'ppid', 'release',
    'report', 'resourceUsage', 'send', 'setSourceMapsEnabled',
    'setUncaughtExceptionCaptureCallback', 'setegid', 'seteuid',
    'setgid', 'setgroups', 'setuid', 'sourceMapsEnabled',
    'stderr', 'stdin', 'stdout', 'throwDeprecation', 'title',
    'traceDeprecation', 'umask', 'uptime', 'version', 'versions',
  ]),
};

/**
 * Common hallucinated API suggestions — maps wrong API to correct one.
 */
const COMMON_HALLUCINATIONS: Readonly<Record<string, ReadonlyMap<string, string>>> = {
  fs: new Map([
    ['readFilePromise', 'fs.promises.readFile'],
    ['writeFilePromise', 'fs.promises.writeFile'],
    ['readFileAsync', 'fs.promises.readFile'],
    ['writeFileAsync', 'fs.promises.writeFile'],
    ['removeFile', 'fs.unlink or fs.rm'],
    ['deleteFile', 'fs.unlink or fs.rm'],
    ['removeDir', 'fs.rmdir or fs.rm'],
    ['deleteDir', 'fs.rmdir or fs.rm'],
    ['fileExists', 'fs.existsSync or fs.access'],
    ['isFile', 'fs.stat().isFile()'],
    ['isDirectory', 'fs.stat().isDirectory()'],
    ['listFiles', 'fs.readdir'],
    ['listDir', 'fs.readdir'],
    ['getStats', 'fs.stat'],
    ['createDir', 'fs.mkdir'],
    ['makeDir', 'fs.mkdir'],
    ['readJSON', 'JSON.parse(fs.readFileSync(...))'],
    ['writeJSON', 'fs.writeFileSync(path, JSON.stringify(...))'],
    ['copy', 'fs.copyFile'],
    ['move', 'fs.rename'],
  ]),

  crypto: new Map([
    ['generateHash', 'crypto.createHash'],
    ['hashString', 'crypto.createHash(alg).update(str).digest()'],
    ['encrypt', 'crypto.createCipheriv'],
    ['decrypt', 'crypto.createDecipheriv'],
    ['generateToken', 'crypto.randomBytes or crypto.randomUUID'],
    ['generateSalt', 'crypto.randomBytes'],
    ['hashPassword', 'crypto.scrypt or crypto.pbkdf2'],
    ['verifyPassword', 'crypto.scrypt or crypto.timingSafeEqual'],
    ['randomString', 'crypto.randomBytes(n).toString("hex")'],
    ['sha256', 'crypto.createHash("sha256")'],
    ['md5', 'crypto.createHash("md5")'],
  ]),

  path: new Map([
    ['getExtension', 'path.extname'],
    ['getFilename', 'path.basename'],
    ['getDirectory', 'path.dirname'],
    ['combine', 'path.join'],
    ['concat', 'path.join'],
    ['exists', 'fs.existsSync (path has no exists)'],
    ['isFile', 'fs.stat (path has no isFile)'],
    ['isDir', 'fs.stat (path has no isDir)'],
    ['getAbsolute', 'path.resolve'],
    ['toAbsolute', 'path.resolve'],
  ]),

  http: new Map([
    ['listen', 'http.createServer().listen'],
    ['fetch', 'global fetch() or node-fetch'],
    ['post', 'http.request with method POST'],
    ['put', 'http.request with method PUT'],
    ['delete', 'http.request with method DELETE'],
    ['patch', 'http.request with method PATCH'],
  ]),

  url: new Map([
    ['create', 'new URL()'],
    ['build', 'new URL() or url.format'],
    ['encode', 'encodeURIComponent'],
    ['decode', 'decodeURIComponent'],
    ['isValid', 'new URL() in try/catch'],
    ['isAbsolute', 'new URL() in try/catch'],
  ]),

  util: new Map([
    ['isPromise', 'util.types.isPromise'],
    ['isAsync', 'util.types.isAsyncFunction'],
    ['isObject', 'typeof x === "object"'],
    ['isString', 'typeof x === "string"'],
    ['isNumber', 'typeof x === "number"'],
    ['isArray', 'Array.isArray'],
    ['isFunction', 'typeof x === "function"'],
    ['isNull', 'x === null'],
    ['isUndefined', 'x === undefined'],
    ['isRegExp', 'x instanceof RegExp or util.types.isRegExp'],
    ['isDate', 'x instanceof Date or util.types.isDate'],
    ['isBuffer', 'Buffer.isBuffer'],
    ['isError', 'x instanceof Error or util.types.isNativeError'],
    ['toArray', 'Array.from'],
    ['extend', 'Object.assign or spread operator'],
    ['merge', 'Object.assign or spread operator'],
  ]),

  os: new Map<string, string>(),
};

// =============================================================================
// Common hallucinated global/prototype methods
// =============================================================================

interface HallucinatedPattern {
  readonly pattern: RegExp;
  readonly message: string;
  readonly suggestion: string;
}

const HALLUCINATED_METHODS: readonly HallucinatedPattern[] = [
  {
    pattern: /\bArray\.flatDeep\s*\(/g,
    message: 'Array.flatDeep() does not exist.',
    suggestion: 'Use Array.flat(Infinity) for deep flattening',
  },
  {
    pattern: /\.toCapitalize\s*\(/g,
    message: '.toCapitalize() is not a standard string method.',
    suggestion: 'Use str.charAt(0).toUpperCase() + str.slice(1)',
  },
  {
    pattern: /\.capitalize\s*\(\s*\)/g,
    message: '.capitalize() is not a standard JavaScript string method.',
    suggestion: 'Use str.charAt(0).toUpperCase() + str.slice(1)',
  },
  {
    pattern: /\bString\.prototype\.contains\s*[=(]/g,
    message: 'String.prototype.contains() does not exist in JavaScript.',
    suggestion: 'Use String.prototype.includes() instead',
  },
  {
    pattern: /\.contains\s*\(\s*['"`]/g,
    message: '.contains() is not a standard string method in JavaScript.',
    suggestion: 'Use .includes() instead',
  },
  {
    pattern: /\bArray\.prototype\.flatMap\s*=|\.flatDeep\s*\(/g,
    message: 'Array.flatDeep() does not exist.',
    suggestion: 'Use Array.flat(Infinity) or Array.flatMap()',
  },
  {
    pattern: /\.isNullOrUndefined\s*\(/g,
    message: '.isNullOrUndefined() is not a standard method.',
    suggestion: 'Use value == null (loose equality checks both null and undefined)',
  },
  {
    pattern: /\.isNullOrEmpty\s*\(/g,
    message: '.isNullOrEmpty() is not a standard JavaScript method.',
    suggestion: 'Use !value (falsy check) or value == null || value === ""',
  },
  {
    pattern: /\bObject\.values\s*\(\s*\)\.flat\s*\(\s*\)/g,
    message: 'This pattern is valid but consider if Object.values() receives the right argument.',
    suggestion: 'Ensure Object.values(obj) receives an object argument',
  },
  {
    pattern: /\.toCamelCase\s*\(/g,
    message: '.toCamelCase() is not a standard string method.',
    suggestion: 'Use a library like lodash/camelCase or implement manually',
  },
  {
    pattern: /\.toSnakeCase\s*\(/g,
    message: '.toSnakeCase() is not a standard string method.',
    suggestion: 'Use a library like lodash/snakeCase or implement manually',
  },
  {
    pattern: /\.toKebabCase\s*\(/g,
    message: '.toKebabCase() is not a standard string method.',
    suggestion: 'Use a library like lodash/kebabCase or implement manually',
  },
  {
    pattern: /\bJSON\.tryParse\s*\(/g,
    message: 'JSON.tryParse() does not exist.',
    suggestion: 'Wrap JSON.parse() in a try/catch block',
  },
  {
    pattern: /\bJSON\.safeParse\s*\(/g,
    message: 'JSON.safeParse() does not exist in standard JavaScript.',
    suggestion: 'Wrap JSON.parse() in try/catch, or use a library like zod with .safeParse()',
  },
  {
    pattern: /\bPromise\.delay\s*\(/g,
    message: 'Promise.delay() does not exist in standard JavaScript.',
    suggestion: 'Use new Promise(resolve => setTimeout(resolve, ms))',
  },
  {
    pattern: /\bPromise\.sleep\s*\(/g,
    message: 'Promise.sleep() does not exist in standard JavaScript.',
    suggestion: 'Use new Promise(resolve => setTimeout(resolve, ms))',
  },
  {
    pattern: /\bPromise\.wait\s*\(/g,
    message: 'Promise.wait() does not exist in standard JavaScript.',
    suggestion: 'Use new Promise(resolve => setTimeout(resolve, ms))',
  },
  {
    pattern: /\bPromise\.map\s*\(/g,
    message: 'Promise.map() does not exist in standard JavaScript.',
    suggestion: 'Use Promise.all(array.map(fn)) or the p-map package',
  },
  {
    pattern: /\bPromise\.each\s*\(/g,
    message: 'Promise.each() does not exist in standard JavaScript.',
    suggestion: 'Use a for...of loop with await, or Array.reduce with promises',
  },
  {
    pattern: /\bPromise\.props\s*\(/g,
    message: 'Promise.props() does not exist in standard JavaScript.',
    suggestion: 'Use Promise.all() with Object.entries() or the p-props package',
  },
  {
    pattern: /\bObject\.isEmpty\s*\(/g,
    message: 'Object.isEmpty() does not exist.',
    suggestion: 'Use Object.keys(obj).length === 0',
  },
  {
    pattern: /\bArray\.isEmpty\s*\(/g,
    message: 'Array.isEmpty() does not exist.',
    suggestion: 'Use array.length === 0',
  },
  {
    pattern: /\.trimAll\s*\(/g,
    message: '.trimAll() is not a standard string method.',
    suggestion: 'Use .replace(/\\s+/g, " ").trim() to normalize whitespace',
  },
  {
    pattern: /\bNumber\.isFloat\s*\(/g,
    message: 'Number.isFloat() does not exist.',
    suggestion: 'Use !Number.isInteger(n) && Number.isFinite(n)',
  },
  {
    pattern: /\bMath\.clamp\s*\(/g,
    message: 'Math.clamp() does not exist in standard JavaScript.',
    suggestion: 'Use Math.min(Math.max(value, min), max)',
  },
  {
    pattern: /\bMath\.lerp\s*\(/g,
    message: 'Math.lerp() does not exist in standard JavaScript.',
    suggestion: 'Implement as: a + (b - a) * t',
  },
];

// =============================================================================
// Helpers
// =============================================================================

/**
 * Regex to extract module import bindings from source code.
 * Captures: import name and module specifier.
 */
const IMPORT_PATTERNS = [
  // import fs from 'fs'
  /import\s+(\w+)\s+from\s+['"](\w+)['"]/g,
  // import * as fs from 'fs'
  /import\s+\*\s+as\s+(\w+)\s+from\s+['"](\w+)['"]/g,
  // const fs = require('fs')
  /(?:const|let|var)\s+(\w+)\s*=\s*require\s*\(\s*['"](\w+)['"]\s*\)/g,
  // import { something } from 'node:fs' → handle node: prefix
  /import\s+(\w+)\s+from\s+['"]node:(\w+)['"]/g,
  /import\s+\*\s+as\s+(\w+)\s+from\s+['"]node:(\w+)['"]/g,
  /(?:const|let|var)\s+(\w+)\s*=\s*require\s*\(\s*['"]node:(\w+)['"]\s*\)/g,
];

/**
 * Look up a hallucination suggestion for a given module and method.
 * Returns the suggested replacement or null.
 */
function lookupHallucinationSuggestion(moduleName: string, method: string): string | null {
  const moduleMap: ReadonlyMap<string, string> | undefined = (
    COMMON_HALLUCINATIONS as Record<string, ReadonlyMap<string, string>>
  )[moduleName];
  if (moduleMap && moduleMap.has(method)) {
    return moduleMap.get(method) ?? null;
  }
  return null;
}

/**
 * Build a map of local variable names to their source module name.
 * e.g., { fs: 'fs', crypto: 'crypto', myPath: 'path' }
 */
function buildModuleBindings(source: string): Map<string, string> {
  const bindings = new Map<string, string>();

  for (const pattern of IMPORT_PATTERNS) {
    // Reset regex state
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = pattern.exec(source)) !== null) {
      const varName = match[1];
      const moduleName = match[2];
      if (varName && moduleName && NODE_API_MAP[moduleName]) {
        bindings.set(varName, moduleName);
      }
    }
  }

  return bindings;
}

/**
 * Find member access patterns (varName.method) in source.
 */
const MEMBER_ACCESS_PATTERN = /(\w+)\.(\w+)\s*(?:\(|$)/gm;

/**
 * Get the source line text at a given 1-based line number.
 */
function getLineText(source: string, lineNum: number): string {
  const lines = source.split('\n');
  const idx = lineNum - 1;
  if (idx >= 0 && idx < lines.length) {
    return lines[idx] ?? '';
  }
  return '';
}

/**
 * Get the 1-based line number and column for a character offset.
 */
function getLineAndColumn(
  source: string,
  offset: number,
): { line: number; column: number } {
  let line = 1;
  let lastNewline = -1;

  for (let i = 0; i < offset && i < source.length; i++) {
    if (source[i] === '\n') {
      line++;
      lastNewline = i;
    }
  }

  return { line, column: offset - lastNewline };
}

/**
 * Check if a line is inside a comment (simple heuristic).
 */
function isInComment(line: string, col: number): boolean {
  const trimmed = line.trim();
  // JSDoc/block comment continuation line (starts with *)
  if (trimmed.startsWith('*') || trimmed.startsWith('/*') || trimmed.startsWith('<!--')) return true;
  // Full-line comment
  if (trimmed.startsWith('//')) return true;

  const beforeCol = line.substring(0, col);
  // Single-line comment before the match position
  if (beforeCol.includes('//')) return true;
  // Inside block comment (simplified check)
  if (beforeCol.includes('/*') && !beforeCol.includes('*/')) return true;
  return false;
}

/**
 * Check if a line is a string literal used for messages, descriptions, or
 * suggestions — common in rule definition files where the rule's own
 * description strings mention the phantom APIs it detects.
 */
function isDescriptionString(line: string): boolean {
  const trimmed = line.trim();
  // Object property assignments that are clearly metadata strings
  return (
    /^\s*(?:message|description|suggestion|suggestedFix|bad|good)\s*[:=]/i.test(trimmed) ||
    /^\s*['"`].*(?:does not exist|is not a|usage detected|hallucinate|phantom|plausible)/i.test(trimmed) ||
    // String concatenation in rule metadata
    /^\s*['"`].*(?:method names|AI code generator|known Node\.js)/i.test(trimmed) ||
    // Template literal or string with description-like content
    /^\s*['"`].*(?:Use\s|Replace with\s|Check\s.*documentation)/i.test(trimmed)
  );
}

// =============================================================================
// Rule definition
// =============================================================================

export const phantomApiUsageRule: Rule = {
  id: 'acv/phantom-api',
  name: 'Phantom API Usage',
  category: 'ai-specific',
  defaultSeverity: 'warn',
  languages: ['javascript', 'typescript'],
  meta: {
    description:
      'Detects usage of non-existent APIs on known Node.js modules and ' +
      'common JavaScript objects. AI code generators sometimes hallucinate ' +
      'method names that sound plausible but do not exist.',
    fixable: false,
    confidence: 0.85,
    falsePositiveRate: 0.1,
    examples: [
      {
        description: 'Non-existent fs method',
        bad: "const data = await fs.readFilePromise('file.txt');",
        good: "const data = await fs.promises.readFile('file.txt');",
      },
      {
        description: 'Non-existent crypto method',
        bad: "const hash = crypto.generateHash('sha256', data);",
        good: "const hash = crypto.createHash('sha256').update(data).digest('hex');",
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

      // Build module bindings from imports
      const bindings = buildModuleBindings(source);

      // Check Node.js API usage
      MEMBER_ACCESS_PATTERN.lastIndex = 0;
      let memberMatch: RegExpExecArray | null;

      while ((memberMatch = MEMBER_ACCESS_PATTERN.exec(source)) !== null) {
        const varName = memberMatch[1];
        const method = memberMatch[2];
        if (!varName || !method) continue;

        const moduleName = bindings.get(varName);
        if (!moduleName) continue;

        const knownExports = NODE_API_MAP[moduleName];
        if (!knownExports) continue;

        // Skip if it's a known export
        if (knownExports.has(method)) continue;

        const { line, column } = getLineAndColumn(source, memberMatch.index);
        const lineText = getLineText(source, line);

        // Skip if inside a comment
        if (isInComment(lineText, column - 1)) continue;

        // Skip if the line is a description/message string (self-referencing rule definitions)
        if (isDescriptionString(lineText)) continue;

        // Check if there's a known hallucination suggestion
        const suggestionText = lookupHallucinationSuggestion(moduleName, method);

        const message = suggestionText
          ? `"${varName}.${method}" does not exist on the "${moduleName}" module. Use ${suggestionText} instead.`
          : `"${varName}.${method}" does not exist on the "${moduleName}" module.`;

        context.report({
          severity,
          ruleName: 'Phantom API Usage',
          message,
          filePath: context.filePath,
          line,
          column,
          endLine: line,
          endColumn: column + varName.length + 1 + method.length,
          codeSnippet: lineText.trim(),
          fix: suggestionText
            ? { from: `${varName}.${method}`, to: suggestionText }
            : null,
          suggestedFix: suggestionText
            ? `Replace with ${suggestionText}`
            : `Check Node.js "${moduleName}" documentation for available methods`,
          suggestion: suggestionText ?? `No "${method}" export found on "${moduleName}" module`,
          owaspRef: null,
          confidence: suggestionText ? 0.95 : 0.8,
          meta: {
            replacement: suggestionText ?? undefined,
          },
        });
      }

      // Check common hallucinated method patterns
      for (const hp of HALLUCINATED_METHODS) {
        hp.pattern.lastIndex = 0;
        let patternMatch: RegExpExecArray | null;

        while ((patternMatch = hp.pattern.exec(source)) !== null) {
          const { line, column } = getLineAndColumn(source, patternMatch.index);
          const lineText = getLineText(source, line);

          // Skip if inside a comment
          if (isInComment(lineText, column - 1)) continue;

          // Skip if the line is a description/message string (self-referencing rule definitions)
          if (isDescriptionString(lineText)) continue;

          context.report({
            severity,
            ruleName: 'Phantom API Usage',
            message: hp.message,
            filePath: context.filePath,
            line,
            column,
            endLine: line,
            endColumn: column + patternMatch[0].length,
            codeSnippet: lineText.trim(),
            fix: null,
            suggestedFix: hp.suggestion,
            suggestion: hp.suggestion,
            owaspRef: null,
            confidence: 0.9,
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
