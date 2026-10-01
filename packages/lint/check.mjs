// Runs ui-text.grit over the fixtures: every line of bad.tsx marked
// `expect` gets exactly one diagnostic, and good.tsx gets none.
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const here = import.meta.dirname
const dir = mkdtempSync(join(tmpdir(), 'ui-text-'))
writeFileSync(
  join(dir, 'biome.json'),
  JSON.stringify({
    plugins: [join(here, 'ui-text.grit')],
    linter: { rules: { preset: 'none' } },
    files: { includes: [join(here, 'fixtures', '**')] },
  }),
)

function lint(file) {
  const res = spawnSync(
    'biome',
    [
      'lint',
      '--config-path',
      dir,
      '--reporter=json',
      '--max-diagnostics=none',
      join(here, 'fixtures', file),
    ],
    { encoding: 'utf8' },
  )
  const out = res.stdout.slice(res.stdout.indexOf('{'))
  const report = JSON.parse(out)
  return report.diagnostics
    .filter((d) => d.category === 'plugin')
    .map((d) => d.location.start?.line ?? d.location.span?.start?.line)
}

let failed = false
const bad = readFileSync(join(here, 'fixtures', 'bad.tsx'), 'utf8').split('\n')
const expected = bad.flatMap((line, i) =>
  /\bexpect\b/.test(line) && !line.startsWith('//') ? [i + 1] : [],
)
const got = lint('bad.tsx')
for (const line of expected) {
  const n = got.filter((l) => l === line).length
  if (n !== 1) {
    console.error(`bad.tsx:${line}: ${n} diagnostics, want 1: ${bad[line - 1].trim()}`)
    failed = true
  }
}
for (const line of got.filter((l) => !expected.includes(l))) {
  console.error(`bad.tsx:${line}: unexpected diagnostic`)
  failed = true
}
const good = lint('good.tsx')
if (good.length > 0) {
  console.error(`good.tsx: unexpected diagnostics on lines ${good.join(', ')}`)
  failed = true
}
if (failed) process.exit(1)
console.log(`ui-text.grit: ${expected.length} expected diagnostics, none in good.tsx`)
