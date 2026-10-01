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

A new npm package goes in `release-please-config.json` and in `.release-please-manifest.json`
at `0.0.0`, so its first release PR is `0.1.0`. npm trusted publishing needs the package to
exist, so publish that first version by hand (`npm publish` from the package, at the release
PR's commit) before merging the release PR. The Go module ignores the root's JavaScript and
release files (`exclude-paths`), so changes to them don't release it.
