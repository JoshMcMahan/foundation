import { describe, expect, it } from 'vitest'
import { languageForPath, tokenizeDiffLines } from './diffHighlight'

describe('languageForPath', () => {
  it.each([
    ['src/a.ts', 'typescript'],
    ['src/App.tsx', 'tsx'],
    ['cmd/main.go', 'go'],
    ['script.py', 'python'],
    ['config.yaml', 'yaml'],
    ['config.yml', 'yaml'],
    ['Dockerfile', 'dockerfile'],
    ['run.sh', 'shellscript'],
    ['notes.txt', null],
    ['LICENSE', null],
    [undefined, null],
    ['.gitignore', null],
  ])('%s -> %s', (path, expected) => {
    expect(languageForPath(path as string | undefined)).toBe(expected)
  })
})

describe('tokenizeDiffLines', () => {
  it('tokenizes lines with colors and stays line-aligned', async () => {
    const lines = ['const a = 1', 'let b = "two"']
    const tokens = await tokenizeDiffLines(lines, 'typescript', false)
    expect(tokens).not.toBeNull()
    expect(tokens).toHaveLength(2)
    expect(tokens?.[0]?.map((t) => t.content).join('')).toBe(lines[0])
    expect(tokens?.[1]?.map((t) => t.content).join('')).toBe(lines[1])
    expect(tokens?.[0]?.some((t) => t.color)).toBe(true)
  })

  it('returns null for an unknown language instead of guessing', async () => {
    expect(await tokenizeDiffLines(['x'], 'not-a-language', false)).toBeNull()
  })
})
