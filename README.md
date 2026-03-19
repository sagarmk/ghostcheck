<p align="center">
  <img src="assets/banner.png" alt="GhostCheck — Code Vulnerability Scanner" width="600">
</p>

<p align="center"><b>Your AI writes code. This catches what it gets wrong.</b></p>

<p align="center">
  <a href="https://www.npmjs.com/package/ghostcheck"><img src="https://img.shields.io/npm/v/ghostcheck?color=blue&label=npm" alt="npm version"></a>
  <a href="https://www.npmjs.com/package/ghostcheck"><img src="https://img.shields.io/npm/dm/ghostcheck?color=green" alt="npm downloads"></a>
  <a href="https://github.com/sagarmk/ghostcheck/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-brightgreen" alt="license"></a>
  <a href="https://github.com/sagarmk/ghostcheck"><img src="https://img.shields.io/github/stars/sagarmk/ghostcheck?style=social" alt="GitHub stars"></a>
</p>

Hallucinated packages. Phantom APIs. Insecure patterns. All caught before you commit — offline, zero-config, under 2 seconds.

---

## Quick Start

```bash
npx ghostcheck
```

That's it. No signup, no API keys, no config files.

---

## What It Catches

```
$ npx ghostcheck

  src/lib/api.ts
    3:1  error  Package 'supabase-realtime-helpers' does not exist on npm
                Did you mean: @supabase/realtime-js                    [hallucinated-import]

    8:5  warn   fs.readFilePromise() does not exist
                Use fs.promises.readFile instead                       [phantom-api]

  src/utils/auth.ts
   14:5  error  Hardcoded API key detected (sk-proj-...)
                Move to process.env.OPENAI_API_KEY                     [unsafe-pattern]

  src/db/queries.ts
    9:3  warn   SQL string concatenation with user input
                Use parameterized queries instead                      [unsafe-pattern]

  4 files scanned in 0.8s
  2 errors  2 warnings
```

### The 3 Rules

| Rule | What it catches | How |
|---|---|---|
| **hallucinated-import** | npm packages your AI invented that don't exist | Cross-references imports against npm registry + typo detection |
| **phantom-api** | Methods that don't exist on real libraries (`fs.readFilePromise`, `JSON.tryParse`) | Pattern database of ~50 common AI hallucinations |
| **unsafe-pattern** | eval, innerHTML, SQL concat, hardcoded secrets, disabled TLS | Regex + AST matching with low false-positive tuning |

---

## Why This Exists

ESLint checks style. Semgrep checks patterns. Snyk checks CVEs.

**Nobody checks whether the packages your AI invented actually exist.** 66% of developers report bugs from AI-generated code that "looks right" but doesn't work. These aren't style issues — they're phantom APIs, hallucinated dependencies, and security patterns memorized from training data.

ghostcheck catches this entire category.

---

## Install

```bash
npx ghostcheck              # zero-install, always latest
npm install -g ghostcheck    # global
npm install -D ghostcheck    # per-project
```

## Usage

```bash
ghostcheck check .                    # scan current directory
ghostcheck check src/ --format json   # JSON output for CI
ghostcheck check --staged             # only git-staged files
ghostcheck hook install               # git pre-commit hook
ghostcheck ci                         # CI mode (SARIF + annotations)
```

## CI/CD

```yaml
# .github/workflows/ghostcheck.yml
name: ghostcheck
on: [push, pull_request]
jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npx ghostcheck ci
```

## Config

Zero-config by default. Customize with `.ghostcheckrc`:

```json
{
  "rules": {
    "hallucinated-import": "error",
    "phantom-api": "warn",
    "unsafe-pattern": "error"
  },
  "ignore": ["tests/", "vendor/"],
  "failOn": "error"
}
```

---

## How It Works

```
  ghostcheck check .
        │
        ▼
  ┌─────────────┐     ┌──────────────┐     ┌─────────────┐
  │ File         │     │ AST Parse    │     │ Rule Engine  │
  │ Discovery    │────▶│ (SWC/regex)  │────▶│ (3 rules)   │
  │ .gitignore   │     │ Extract      │     │ Check each   │
  │ aware        │     │ imports +    │     │ finding vs   │
  │              │     │ API calls    │     │ registry +   │
  └─────────────┘     └──────────────┘     │ patterns     │
                                           └──────┬──────┘
                                                  │
                                           ┌──────▼──────┐
                                           │ Output      │
                                           │ Pretty/JSON │
                                           │ SARIF/JUnit │
                                           └─────────────┘
```

Offline-first. Parallel file processing. Content-hash caching (second run is instant).

---

## Contributing

```bash
git clone https://github.com/sagarmk/ghostcheck.git
cd ghostcheck
npm install && npm test
```

## License

MIT
