#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { add, check, writeIndex } from './check.js'
import { unused } from './unused.js'

const usage = `usage: parallelworks-i18n <command> [--dir <locales>] [--default <locale>]

  check        every locale has the default locale's keys, valid ICU messages
               and the same arguments; a split locale's index.ts is current
  index        rewrite the default locale's index.ts (one-file-per-namespace layout)
  add <file>   merge messages from a JSON file without changing existing ones;
               the file is one locale's tree, or trees keyed by locale
  unused       list the default locale's keys that no source file references

  --dir      locales directory (default: src/i18n/locales)
  --default  default locale (default: en)
  --src      for unused: a source directory to scan, repeatable (default: src)
  --keep     for unused: a namespace read by key elsewhere, such as error codes
             from a server, repeatable`

const args = process.argv.slice(2)
const flag = (name: string, fallback: string) => {
  const i = args.indexOf(`--${name}`)
  return (i >= 0 && args[i + 1]) || fallback
}
const flags = (name: string) =>
  args.flatMap((a, i) => {
    const value = args[i + 1]
    return a === `--${name}` && value ? [value] : []
  })
const dir = path.resolve(flag('dir', 'src/i18n/locales'))
const defaultLocale = flag('default', 'en')
const [command, file] = args.filter((a, i) => !a.startsWith('--') && !args[i - 1]?.startsWith('--'))

if (command === 'check') {
  const problems = check(dir, defaultLocale)
  for (const problem of problems) console.error(problem)
  if (problems.length > 0) process.exitCode = 1
  else console.log(`i18n: catalogs in ${path.relative(process.cwd(), dir) || '.'} are consistent`)
} else if (command === 'index') {
  writeIndex(dir, defaultLocale)
} else if (command === 'add' && file) {
  add(dir, defaultLocale, JSON.parse(readFileSync(file, 'utf8')))
} else if (command === 'unused') {
  const src = flags('src')
  const keys = unused({
    dir,
    defaultLocale,
    src: src.length > 0 ? src : ['src'],
    keep: flags('keep'),
  })
  for (const key of keys) console.error(key)
  if (keys.length > 0) {
    console.error(
      `${keys.length} unused key(s) in ${defaultLocale}: use them, or remove them from every locale`,
    )
    process.exitCode = 1
  } else {
    console.log('i18n: every message is used')
  }
} else {
  console.error(usage)
  process.exitCode = 2
}
