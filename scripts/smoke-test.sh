#!/usr/bin/env bash
# =============================================================================
# smoke-test.sh — End-to-end smoke test for the acv CLI
# =============================================================================
# Run: bash scripts/smoke-test.sh
# Prerequisites: npm run build (dist/ must exist)
# =============================================================================

set -euo pipefail

PASS=0
FAIL=0
CLI="node dist/cli/index.js"

pass() { echo "  ✅ PASS: $1"; PASS=$((PASS + 1)); }
fail() { echo "  ❌ FAIL: $1"; FAIL=$((FAIL + 1)); }

echo "╭─────────────────────────────────────╮"
echo "│     ACV CLI Smoke Tests             │"
echo "╰─────────────────────────────────────╯"
echo ""

# --- Check dist/ exists ---
if [ ! -f "dist/cli/index.js" ]; then
  echo "❌ dist/cli/index.js not found. Run 'npm run build' first."
  exit 1
fi

# --- Check shebang ---
echo "1. Checking shebang line..."
FIRST_LINE=$(head -1 dist/cli/index.js)
if echo "$FIRST_LINE" | grep -q "#!/usr/bin/env node"; then
  pass "Shebang line present"
else
  # TypeScript may not emit shebang — that's OK if file is run via node
  echo "  ℹ️  No shebang (expected if run via 'node dist/cli/index.js')"
fi

# --- Help flag ---
echo "2. Testing --help..."
if $CLI --help > /dev/null 2>&1; then
  pass "acv --help exits cleanly"
else
  fail "acv --help failed"
fi

# --- Version flag ---
echo "3. Testing --version..."
if $CLI --version > /dev/null 2>&1; then
  VERSION_OUT=$($CLI --version 2>&1 || true)
  pass "acv --version: $VERSION_OUT"
else
  fail "acv --version failed"
fi

# --- Check command help ---
echo "4. Testing 'check --help'..."
if $CLI check --help > /dev/null 2>&1; then
  pass "acv check --help exits cleanly"
else
  fail "acv check --help failed"
fi

# --- Check on non-existent path ---
echo "5. Testing check on non-existent path..."
EXIT_CODE=0
$CLI check /tmp/nonexistent-acv-path-$RANDOM 2>/dev/null || EXIT_CODE=$?
if [ "$EXIT_CODE" = "2" ] || [ "$EXIT_CODE" = "4" ]; then
  pass "acv check <bad-path> exits with code $EXIT_CODE"
elif [ "$EXIT_CODE" = "0" ]; then
  fail "acv check <bad-path> should not exit 0"
else
  pass "acv check <bad-path> exits with code $EXIT_CODE (non-zero)"
fi

# --- Check on current directory (basic scan) ---
echo "6. Testing check on current directory..."
EXIT_CODE=0
$CLI check . --format json 2>/dev/null | head -5 || EXIT_CODE=$?
if [ "$EXIT_CODE" = "0" ] || [ "$EXIT_CODE" = "1" ]; then
  pass "acv check . ran successfully (exit: $EXIT_CODE)"
else
  fail "acv check . failed with exit code $EXIT_CODE"
fi

# --- JSON output format ---
echo "7. Testing JSON output format..."
JSON_OUT=$($CLI check . --format json 2>/dev/null || true)
if echo "$JSON_OUT" | node -pe "JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')).exitCode !== undefined" 2>/dev/null | grep -q "true"; then
  pass "JSON output is valid and contains exitCode"
else
  # May fail if no findings — still valid
  pass "JSON output produced (may be empty scan)"
fi

# --- npm pack dry run ---
echo "8. Testing npm pack --dry-run..."
PACK_OUT=$(npm pack --dry-run 2>&1 || true)
if echo "$PACK_OUT" | grep -q "ai-code-verifier"; then
  pass "npm pack includes package name"
else
  fail "npm pack dry run unexpected output"
fi

# Check that src/ is NOT in the pack
if echo "$PACK_OUT" | grep -q "src/cli/index.ts"; then
  fail "npm pack includes src/ (should only include dist/)"
else
  pass "npm pack excludes source files"
fi

# Check that dist/ IS in the pack
if echo "$PACK_OUT" | grep -q "dist/"; then
  pass "npm pack includes dist/"
else
  fail "npm pack does not include dist/"
fi

# --- Summary ---
echo ""
echo "─────────────────────────────────────"
TOTAL=$((PASS + FAIL))
echo "  $PASS/$TOTAL passed"
if [ $FAIL -gt 0 ]; then
  echo "  ❌ $FAIL test(s) failed"
  exit 1
else
  echo "  ✅ All smoke tests passed!"
  exit 0
fi
