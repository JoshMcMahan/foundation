# foundation developer tasks. Run `make help` for a list.

SHELL := /bin/bash
.DEFAULT_GOAL := help

# Development tools are pinned in tools/go.mod and run with `go tool`.
GOTOOL := go tool -modfile=tools/go.mod

.PHONY: help
help: ## Show this help
	@awk 'BEGIN {FS = ":.*##"} /^[a-zA-Z_-]+:.*##/ {printf "  \033[36m%-10s\033[0m %s\n", $$1, $$2}' $(MAKEFILE_LIST)

.PHONY: check
check: lint test ## Run all linters and tests

.PHONY: lint
lint: ## Lint Go and TypeScript
	$(GOTOOL) golangci-lint run ./...
	pnpm lint
	pnpm typecheck

.PHONY: test
test: ## Run Go and TypeScript tests
	go test -race -shuffle=on ./...
	pnpm test

.PHONY: build
build: ## Build the npm packages
	pnpm build
