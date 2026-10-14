// Prints whether a change reaches the benchmark page, so CI measures only a PR that can move it.
//
//   git diff --name-only <base> <head> | node bench/affected.ts bench/dist/sources.json
//
// The sources are what the page's bundle holds, written by its build. Paths are from the repository.
import { readFileSync } from 'node:fs'

/**
 * What the page depends on beyond its bundle: the stylesheets `dist` is built from, the benchmark
 * itself, every installed package and the workflow that runs it.
 */
const ALWAYS = [
  'packages/ui/src/styles.css',
  'packages/ui/src/styles/',
  'packages/ui/bench/',
  'packages/package.json',
  'packages/pnpm-lock.yaml',
  '.github/workflows/bench.yml',
]

/** Whether any changed file is one the page is built from. */
export function affects(changed: string[], sources: string[]): boolean {
  const bundled = new Set(sources)
  return changed.some(
    (file) =>
      bundled.has(file) ||
      ALWAYS.some((path) => file === path || (path.endsWith('/') && file.startsWith(path))),
  )
}

if (import.meta.main) {
  const [file] = process.argv.slice(2)
  if (!file) throw new Error('usage: node bench/affected.ts <sources.json> < changed files')
  const sources: string[] = JSON.parse(readFileSync(file, 'utf8'))
  const changed = readFileSync(0, 'utf8').split('\n').filter(Boolean)
  console.log(affects(changed, sources))
}
