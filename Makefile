# =============================================================================
# AI Code Verifier (acv) — Makefile
# =============================================================================

.PHONY: all install build test typecheck lint check clean pack verify help

# Default target
all: install build test

# Install dependencies
install:
	npm ci

# Build TypeScript → dist/
build:
	npm run build

# Run tests
test:
	npm test

# Run tests with coverage
test-coverage:
	npm run test:coverage

# Type check without emitting
typecheck:
	npm run typecheck

# Lint source files
lint:
	npm run lint

# Lint and auto-fix
lint-fix:
	npm run lint:fix

# Format source files
format:
	npm run format

# Full quality check (what CI runs)
check: typecheck lint test build
	@echo "✅ All quality checks passed"

# Clean build artifacts
clean:
	rm -rf dist/ coverage/ .nyc_output/ *.tsbuildinfo .eslintcache *.tgz

# Pack for npm (dry run — show what would be published)
pack:
	npm pack --dry-run

# Pack for real (creates .tgz)
pack-real:
	npm pack

# Verify the package is ready for publishing
verify: check
	@echo "Verifying package configuration..."
	@bash scripts/verify-package.sh
	@echo "✅ Package is ready for publishing"

# Smoke test: build and test the bin entry
smoke: build
	@echo "Testing bin entry..."
	@node dist/cli/index.js --help > /dev/null 2>&1 && echo "✅ acv --help works" || echo "❌ acv --help failed"
	@node dist/cli/index.js check --help > /dev/null 2>&1 && echo "✅ acv check --help works" || echo "❌ acv check --help failed"

# Help
help:
	@echo "Available targets:"
	@echo "  all           Install, build, and test (default)"
	@echo "  install       Install npm dependencies"
	@echo "  build         Build TypeScript to dist/"
	@echo "  test          Run test suite"
	@echo "  test-coverage Run tests with coverage report"
	@echo "  typecheck     Run TypeScript type checker"
	@echo "  lint          Run ESLint"
	@echo "  lint-fix      Run ESLint with auto-fix"
	@echo "  format        Format with Prettier"
	@echo "  check         Full CI quality check (typecheck + lint + test + build)"
	@echo "  clean         Remove build artifacts"
	@echo "  pack          Show what npm pack would include (dry run)"
	@echo "  pack-real     Create .tgz package"
	@echo "  verify        Full verification for npm publishing"
	@echo "  smoke         Smoke test the built CLI"
	@echo "  help          Show this help"
