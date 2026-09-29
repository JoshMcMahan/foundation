# Contributing to foundation

- Every change goes through a pull request against `canary`. PR titles follow
  [Conventional Commits](https://www.conventionalcommits.org) (`feat(problem): ...`,
  `fix(problem): ...`); PRs are squash-merged, so the title becomes the commit.
- `make check` must pass: golangci-lint, Biome, TypeScript, and the Go and TypeScript tests.

## Adding a shared rule or code

1. Define it in `problem/types.go` and add it to `Rules`, or to `StatusCodes`
   and `CodeForStatus` for a status code.
2. Add its message to every catalog in `packages/problem/src/messages/`, and its
   code to `SharedCode` in `packages/problem/src/index.ts`.
3. If huma reports it, classify its message in `problem/humaproblem`.

`go test ./problem` fails until every catalog has the message.

## Releasing

- npm: bump `version` in the package's `package.json` in a `chore(<package>): release x.y.z`
  PR. Merging it publishes every package whose version is not yet on npm.
- Go: tag the merge commit `vX.Y.Z` and push the tag.
