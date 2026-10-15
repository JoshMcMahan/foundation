import { readFileSync } from 'node:fs'
import { dirname, join, normalize, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const vs = fileURLToPath(new URL('../../node_modules/monaco-editor/esm/vs/', import.meta.url))
const IMPORT = /(?:^|\n)\s*(?:import|export)\s+(?:[^'"]*?\sfrom\s*)?['"]([^'"]+)['"]/g

function imports(source: string): string[] {
  return [...source.matchAll(IMPORT)].map((match) => match[1] ?? '')
}

// Every module a file reaches through static imports, as paths under esm/vs.
function reached(entries: string[]): Set<string> {
  const seen = new Set<string>()
  const queue = [...entries]
  while (queue.length > 0) {
    const file = queue.pop() ?? ''
    if (seen.has(file)) {
      continue
    }
    seen.add(file)
    if (!file.endsWith('.js')) {
      continue
    }
    for (const spec of imports(readFileSync(join(vs, file), 'utf8'))) {
      if (spec.startsWith('.')) {
        queue.push(normalize(join(dirname(file), spec)))
      }
    }
  }
  return seen
}

test('the editor has every feature monaco-editor’s main entry has, less its languages', () => {
  const main = imports(readFileSync(join(vs, 'editor/editor.main.js'), 'utf8'))
    .map((spec) => relative(vs, join(vs, 'editor', spec)))
    // The languages are this package's choice, and the language-server client is for languages.
    .filter((file) => !file.startsWith('languages/') && !file.startsWith('../external/'))
  const ours = imports(readFileSync(new URL('./monacoFeatures.ts', import.meta.url), 'utf8'))
    .filter((spec) => spec.startsWith('monaco-editor/'))
    .map((spec) => `${spec.slice('monaco-editor/'.length)}.js`)
  const has = reached(ours)
  expect(main.filter((file) => !has.has(file))).toEqual([])
})
