# Contributing to @parallelworks/ui

This file is deliberately not `README.md`: npm force-includes `README*` in every
tarball regardless of the `files` allowlist, so anything written there reaches
consumers. `verify:pack` fails if a file outside the allowlist lands in the
tarball.

## Development

From `packages/`:

```bash
pnpm -F @parallelworks/ui test
pnpm -F @parallelworks/ui typecheck
pnpm -F @parallelworks/ui build
pnpm -F @parallelworks/ui lint:package   # publint
pnpm -F @parallelworks/ui verify:pack    # installs the packed tarball into a fixture
pnpm -F @parallelworks/ui storybook      # the component workshop on :6006
```

Workspace consumers import `src/` directly; the published package swaps to the
compiled `dist/` output through `publishConfig`.

## Workshop

- **Stories stay colocated** with their components (`src/**/*.stories.tsx`).
  Title prefixes keep the sidebar legible: `UI/…` for the core surfaces,
  `Chat/…` for `./ai`.
- **Stories render the compiled CSS** (`dist/styles.css`), so a missing utility
  or a broken cascade layer shows up there before a consumer hits it. If a story
  looks unstyled, fix the package css build, not the story.
- **Mock data comes from parameterized factories**: `src/ai/stories/harness.tsx`
  builds conversations, parts and adapters with knobs that stories expose as
  controls. Chat stories that need provider state wrap themselves in `StoryChat`
  so they stay self-sufficient under `composeStories`.
- **Every story renders in a test**: `src/stories.test.tsx` and
  `src/ai/stories.test.tsx` compose and render each one.

## Workflow engine

Tests and stories that exercise the form and graph use
`@parallelworks/workflow-parser`'s engine (a dev dependency). `src/test/engine.ts`
leaves expressions unevaluated so form tests need no WebAssembly.
