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

release-please keeps a release PR open for the Go module (`chore: release x.y.z`) and
for each npm package (`chore(<package>): release x.y.z`), built from merged PR titles.
Merging one tags the Go module, or bumps the package's version, which publishes it to
npm. Don't bump versions or push tags by hand.
