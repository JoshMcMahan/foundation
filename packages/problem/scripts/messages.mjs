// Copies the shared messages from the Go problem package, their single
// source, into src/messages as this package's catalogs.
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const here = import.meta.dirname
const from = join(here, '../../../problem/messages')
const to = join(here, '../src/messages')
mkdirSync(to, { recursive: true })
for (const file of readdirSync(from).filter((f) => f.endsWith('.json'))) {
  const apiErrors = JSON.parse(readFileSync(join(from, file), 'utf8'))
  writeFileSync(join(to, file), `${JSON.stringify({ apiErrors }, null, 2)}\n`)
}
