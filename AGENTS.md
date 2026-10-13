# foundation

Shared Go and npm packages for building web services. The repository is public.

- Code here is used by several applications: it names no company, product or application, holds no product logic, and has no secrets, hostnames or infrastructure details.
- Never name other products in code, docs, commits or PR text. Describe the behavior instead.
- FIPS 140-3: no cryptography outside the Go standard library `crypto/*`. Tests run with `GODEBUG=fips140=only`. The one exception is the `dev` module, a separate module for local development that is never linked into a service: its S3 emulator needs MD5.
- `problem` depends only on the Go standard library and `golang.org/x/text`, whose CLDR plural and number rules keep it in step with `Intl` on the TypeScript side. Integrations (huma, go-ruleguard) go in subpackages.
- The Go and TypeScript halves of a contract change in the same PR. Codes, rules and params are API contract: never rename one.
- Every shared message exists in every language in `packages/problem/src/messages/`. `go test ./problem` fails otherwise.
- A change to a `packages/ui` component updates its Storybook stories (`*.stories.tsx` beside it): a story for each new state, and a control for each new prop a host sets. Chat stories build their data with the factories in `src/ai/stories/harness.tsx`. A new stories file joins the smoke test (`src/stories.test.tsx`, or `src/ai/stories.test.tsx` for the chat). PR screenshots come from these stories.
- A PR that changes a UI component shows it: screenshots of each changed state in the PR description, and a short recording (under 30 seconds, with a visible pointer) as an `.mp4` for a multi-step interaction. Upload them with `--attach` on `gh pr create` or `gh pr edit` (gh 2.99+), never by committing them to a branch: reference each file in the body by its local path, such as `![Composer with a pasted card](./composer-card.png)`, and gh replaces the path with the uploaded asset's URL.
- Release-please excludes only directories from the root Go module, so a change to a root-level file (`README.md`, `Makefile`, this file) releases it. Document `dev` and the npm packages in their own READMEs.
- Comments explain why, not what. PR titles follow Conventional Commits; PRs target `canary`.

`make check` runs every linter and test.
