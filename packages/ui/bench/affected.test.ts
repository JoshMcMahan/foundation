import { describe, expect, it } from 'vitest'
import { affects } from './affected.ts'

const sources = [
  'packages/ui/bench/main.tsx',
  'packages/ui/src/graph/DependencyGraph.tsx',
  'packages/ui/dist/styles.css',
]

describe('affects', () => {
  it('holds for a change to a file in the bundle', () => {
    expect(affects(['README.md', 'packages/ui/src/graph/DependencyGraph.tsx'], sources)).toBe(true)
  })

  it('holds for a change to what the bundle is built from or run with', () => {
    expect(affects(['packages/ui/src/styles/theme.css'], sources)).toBe(true)
    expect(affects(['packages/ui/src/styles.css'], sources)).toBe(true)
    expect(affects(['packages/ui/bench/run.ts'], sources)).toBe(true)
    expect(affects(['packages/pnpm-lock.yaml'], sources)).toBe(true)
    expect(affects(['.github/workflows/bench.yml'], sources)).toBe(true)
  })

  it('does not hold for files the page never loads', () => {
    expect(
      affects(
        [
          'packages/ui/src/ai/components/ChatInput.tsx',
          'packages/ui/src/graph/GraphEditor.test.tsx',
          'packages/ui/src/stylesheet.ts',
          'packages/ui/CHANGELOG.md',
          'packages/ui/package.json',
        ],
        sources,
      ),
    ).toBe(false)
  })
})
