#!/usr/bin/env bash
# =============================================================================
# verify-package.sh — Validate package.json is correctly configured for npm
# =============================================================================
# Run: bash scripts/verify-package.sh
# Exit code: 0 if valid, 1 if issues found
# =============================================================================

set -euo pipefail

ERRORS=0
WARNINGS=0
PKG="package.json"

error() { echo "  ❌ ERROR: $1"; ERRORS=$((ERRORS + 1)); }
warn()  { echo "  ⚠️  WARN:  $1"; WARNINGS=$((WARNINGS + 1)); }
ok()    { echo "  ✅ $1"; }

echo "╭─────────────────────────────────────────────╮"
echo "│  Package.json Verification for npm Publish  │"
echo "╰─────────────────────────────────────────────╯"
echo ""

if [ ! -f "$PKG" ]; then
  error "package.json not found"
  exit 1
fi

# --- Required fields ---
echo "Checking required fields..."

NAME=$(node -pe "require('./$PKG').name || ''")
if [ -z "$NAME" ]; then
  error "'name' field is missing"
else
  ok "name: $NAME"
fi

VERSION=$(node -pe "require('./$PKG').version || ''")
if [ -z "$VERSION" ]; then
  error "'version' field is missing"
else
  ok "version: $VERSION"
fi

DESCRIPTION=$(node -pe "require('./$PKG').description || ''")
if [ -z "$DESCRIPTION" ]; then
  warn "'description' field is missing (recommended for npm discoverability)"
else
  ok "description: present"
fi

LICENSE=$(node -pe "require('./$PKG').license || ''")
if [ -z "$LICENSE" ]; then
  warn "'license' field is missing"
else
  ok "license: $LICENSE"
fi

# --- bin field ---
echo ""
echo "Checking bin configuration..."

BIN_ACV=$(node -pe "try { require('./$PKG').bin.acv || '' } catch(e) { '' }")
if [ -z "$BIN_ACV" ]; then
  error "'bin.acv' field is missing"
else
  ok "bin.acv: $BIN_ACV"
  if [ ! -f "$BIN_ACV" ] && [ -f "dist/cli/index.js" ]; then
    warn "bin target '$BIN_ACV' not found (run 'npm run build' first)"
  elif [ -f "$BIN_ACV" ]; then
    ok "bin target exists"
  fi
fi

# Check for ai-code-verifier bin entry (for npx ai-code-verifier)
BIN_ACV_FULL=$(node -pe "try { require('./$PKG').bin['ai-code-verifier'] || '' } catch(e) { '' }")
if [ -z "$BIN_ACV_FULL" ]; then
  warn "'bin[\"ai-code-verifier\"]' not set — 'npx ai-code-verifier' will still work (npm falls back to package name)"
fi

# --- files field ---
echo ""
echo "Checking files configuration..."

FILES=$(node -pe "JSON.stringify(require('./$PKG').files || [])")
if [ "$FILES" = "[]" ]; then
  error "'files' field is missing — all files will be published!"
else
  ok "files: $FILES"
  # Check dist/ is included
  echo "$FILES" | grep -q '"dist/' && ok "dist/ included in files" || error "dist/ not in files field"
  echo "$FILES" | grep -q 'README' && ok "README.md included in files" || warn "README.md not in files field"
fi

# --- main and types ---
echo ""
echo "Checking module entry points..."

MAIN=$(node -pe "require('./$PKG').main || ''")
if [ -z "$MAIN" ]; then
  error "'main' field is missing"
else
  ok "main: $MAIN"
fi

TYPES=$(node -pe "require('./$PKG').types || ''")
if [ -z "$TYPES" ]; then
  warn "'types' field is missing (recommended for TypeScript consumers)"
else
  ok "types: $TYPES"
fi

# --- engines ---
echo ""
echo "Checking engines..."

ENGINES_NODE=$(node -pe "try { require('./$PKG').engines.node || '' } catch(e) { '' }")
if [ -z "$ENGINES_NODE" ]; then
  warn "'engines.node' field is missing (recommended: >=18)"
else
  ok "engines.node: $ENGINES_NODE"
fi

# --- keywords ---
echo ""
echo "Checking keywords..."

KEYWORDS_COUNT=$(node -pe "(require('./$PKG').keywords || []).length")
if [ "$KEYWORDS_COUNT" = "0" ]; then
  warn "No keywords — add keywords for npm discoverability"
else
  ok "keywords: $KEYWORDS_COUNT entries"
fi

# Required keywords check
for kw in "ai" "code-verification" "security" "linter"; do
  HAS_KW=$(node -pe "(require('./$PKG').keywords || []).includes('$kw')")
  if [ "$HAS_KW" = "true" ]; then
    ok "  keyword '$kw' present"
  else
    warn "  keyword '$kw' missing (recommended)"
  fi
done

# --- prepublishOnly ---
echo ""
echo "Checking scripts..."

PREPUBLISH=$(node -pe "try { require('./$PKG').scripts.prepublishOnly || '' } catch(e) { '' }")
if [ -z "$PREPUBLISH" ]; then
  error "'prepublishOnly' script is missing"
else
  ok "prepublishOnly: $PREPUBLISH"
  # Check it includes build, test, and typecheck
  echo "$PREPUBLISH" | grep -q "build" && ok "  includes build" || warn "  prepublishOnly should include build"
  echo "$PREPUBLISH" | grep -q "test" && ok "  includes test" || warn "  prepublishOnly should include test"
  echo "$PREPUBLISH" | grep -q "typecheck" && ok "  includes typecheck" || warn "  prepublishOnly should include typecheck"
fi

# --- .npmignore ---
echo ""
echo "Checking .npmignore..."

if [ -f ".npmignore" ]; then
  ok ".npmignore exists"
  LINES=$(wc -l < .npmignore | tr -d ' ')
  ok "  $LINES lines"
else
  warn ".npmignore not found — relying on 'files' field only"
fi

# --- Summary ---
echo ""
echo "─────────────────────────────────────────────"
if [ $ERRORS -gt 0 ]; then
  echo "  ❌ $ERRORS error(s), $WARNINGS warning(s)"
  echo "  Package is NOT ready for publishing."
  exit 1
elif [ $WARNINGS -gt 0 ]; then
  echo "  ⚠️  0 errors, $WARNINGS warning(s)"
  echo "  Package can be published but has recommendations."
  exit 0
else
  echo "  ✅ All checks passed — package is ready for publishing!"
  exit 0
fi
