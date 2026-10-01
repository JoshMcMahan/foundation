# foundation developer tasks. Run `make help` for a list.

SHELL := /bin/bash
.DEFAULT_GOAL := help

# Development tools are pinned in tools/go.mod and run with `go tool`.
GOTOOL := go tool -modfile=tools/go.mod
# The npm packages' workspace is packages/, so the Go module at the root only sees Go.
PNPM := cd packages && pnpm

.PHONY: help
help: ## Show this help
	@awk 'BEGIN {FS = ":.*##"} /^[a-zA-Z_-]+:.*##/ {printf "  \033[36m%-10s\033[0m %s\n", $$1, $$2}' $(MAKEFILE_LIST)

.PHONY: check
check: lint test ## Run all linters and tests

.PHONY: lint
lint: ## Lint Go and TypeScript
	$(GOTOOL) golangci-lint run ./...
	$(PNPM) lint
	$(PNPM) typecheck

.PHONY: test
test: ## Run Go and TypeScript tests
	go test -race -shuffle=on ./...
	$(PNPM) test

.PHONY: build
build: ## Build the npm packages
	$(PNPM) build
