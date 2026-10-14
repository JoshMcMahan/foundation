import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { isDev } from './dev'

test('development checks run outside production', () => {
  expect(isDev()).toBe(true)
})

// The library build replaces import.meta.env with this package's own build mode, so a check
// guarded by it never reaches a host's development build.
test('no shipped source reads import.meta.env', () => {
  const offenders = (readdirSync(import.meta.dirname, { recursive: true }) as string[])
    .filter((file) => /\.tsx?$/.test(file) && !/\.(test|stories)\.tsx?$/.test(file))
    .filter((file) => file !== 'env.d.ts')
    .filter((file) =>
      readFileSync(join(import.meta.dirname, file), 'utf8').includes('import.meta.env'),
    )
  expect(offenders).toEqual([])
})
