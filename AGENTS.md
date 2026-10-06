# foundation

Shared Go and npm packages for building web services. The repository is public.

- Code here is used by several applications: it names no company, product or application, holds no product logic, and has no secrets, hostnames or infrastructure details.
- Never name other products in code, docs, commits or PR text. Describe the behavior instead.
- FIPS 140-3: no cryptography outside the Go standard library `crypto/*`. Tests run with `GODEBUG=fips140=only`. The one exception is the `dev` module, a separate module for local development that is never linked into a service: its S3 emulator needs MD5.
- `problem` depends only on the Go standard library and `golang.org/x/text`, whose CLDR plural and number rules keep it in step with `Intl` on the TypeScript side. Integrations (huma, go-ruleguard) go in subpackages.
- The Go and TypeScript halves of a contract change in the same PR. Codes, rules and params are API contract: never rename one.
- Every shared message exists in every language in `packages/problem/src/messages/`. `go test ./problem` fails otherwise.
- Release-please excludes only directories from the root Go module, so a change to a root-level file (`README.md`, `Makefile`, this file) releases it. Document `dev` and the npm packages in their own READMEs.
- Comments explain why, not what. PR titles follow Conventional Commits; PRs target `canary`.

`make check` runs every linter and test.
