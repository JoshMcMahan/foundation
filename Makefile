# foundation developer tasks. Run `make help` for a list.

SHELL := /bin/bash
.DEFAULT_GOAL := help

# Development tools are pinned in tools/go.mod and run with `go tool`.
GOTOOL := go tool -modfile=tools/go.mod
# The npm packages' workspace is packages/, so the Go module at the root only sees Go.
PNPM := cd packages && pnpm
# Keep local tests in the same mode as CI, even if go.mod's default changes.
export GODEBUG := fips140=only

.PHONY: help
help: ## Show this help
	@awk 'BEGIN {FS = ":.*##"} /^[a-zA-Z_-]+:.*##/ {printf "  \033[36m%-16s\033[0m %s\n", $$1, $$2}' $(MAKEFILE_LIST)

.PHONY: check
check: check-go check-js test-ci ## Run all linters and tests

.PHONY: check-go
check-go: tidy-check lint-go vulncheck test-go ## Run all Go checks

# The TypeScript commands each generate catalogs; sequence those writes while
# allowing the Go checks to run alongside them with make -j.
.PHONY: check-js
check-js: lint-js ## Run all TypeScript checks
	$(MAKE) test-js
	$(MAKE) verify-build

.PHONY: lint
lint: lint-go vulncheck lint-js ## Lint Go and TypeScript

.PHONY: tidy-check
tidy-check: ## Verify both Go modules are tidy
	go mod tidy -diff
	cd tools && go mod tidy -diff

.PHONY: lint-go
lint-go: ## Lint Go
	$(GOTOOL) golangci-lint run ./...

.PHONY: vulncheck
vulncheck: ## Check Go dependencies for vulnerabilities
	$(GOTOOL) govulncheck ./...

.PHONY: lint-js
lint-js: ## Lint and typecheck TypeScript
	$(PNPM) lint
	$(PNPM) typecheck

.PHONY: test
test: test-go test-js test-ci ## Run Go, TypeScript and CI tests

.PHONY: test-go
test-go: ## Run Go tests with race detection and coverage
	go test -race -shuffle=on -cover ./...

.PHONY: test-js
test-js: ## Run TypeScript tests
	$(PNPM) test

.PHONY: test-ci
test-ci: ## Test CI change detection
	node --test .github/scripts/changes.test.mjs

.PHONY: build
build: ## Build the npm packages
	$(PNPM) build

.PHONY: verify-build
verify-build: build ## Build and verify the published npm packages
	$(PNPM) -r --if-present lint:package
	$(PNPM) -F @parallelworks/ui verify:pack
