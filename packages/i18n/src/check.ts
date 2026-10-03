import { mkdirSync, readFileSync, rmdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { type MessageFormatElement, parse, TYPE } from '@formatjs/icu-messageformat-parser'
import {
  flatten,
  isSplit,
  listLocales,
  localeFiles,
  type Messages,
  readLocale,
} from './catalogs.js'

/**
 * What's wrong with dir's catalogs, one line each: a key missing from or
 * extra to a locale, a message that isn't valid ICU, a translation that uses
 * different arguments or tags than the default locale's, or a stale index.
 */
export function check(dir: string, defaultLocale: string): string[] {
  const problems: string[] = []
  const reference = flatten(readLocale(dir, defaultLocale))
  const referenceArgs = new Map<string, string[]>()
  for (const [key, message] of reference) {
    const args = argumentsOf(message)
    if (typeof args === 'string') problems.push(`${defaultLocale}: ${key}: ${args}`)
    else referenceArgs.set(key, args)
  }
  for (const locale of listLocales(dir)) {
    if (locale === defaultLocale) continue
    const messages = flatten(readLocale(dir, locale))
    for (const key of reference.keys()) {
      if (!messages.has(key)) problems.push(`${locale}: missing ${key}`)
    }
    for (const [key, message] of messages) {
      if (!reference.has(key)) {
        problems.push(`${locale}: ${key} is not in ${defaultLocale}`)
        continue
      }
      const args = argumentsOf(message)
      const want = referenceArgs.get(key)
      if (typeof args === 'string') problems.push(`${locale}: ${key}: ${args}`)
      else if (want && args.join() !== want.join()) {
        problems.push(
          `${locale}: ${key} uses {${args.join(', ')}}, ${defaultLocale} uses {${want.join(', ')}}`,
        )
      }
    }
  }
  if (isSplit(dir, defaultLocale)) {
    const file = indexFile(dir, defaultLocale)
    let current = ''
    try {
      current = readFileSync(file, 'utf8')
    } catch {
      // A missing index is reported below like a stale one.
    }
    if (current !== indexSource(dir, defaultLocale)) {
      problems.push(
        `${path.relative(process.cwd(), file)} is out of date: run parallelworks-i18n index`,
      )
    }
  }
  return problems
}

/** The sorted argument and tag names of an ICU message, or why it doesn't parse. */
export function argumentsOf(message: string): string[] | string {
  let ast: MessageFormatElement[]
  try {
    ast = parse(message)
  } catch (error) {
    return `not valid ICU: ${(error as Error).message}`
  }
  const names = new Set<string>()
  const walk = (elements: MessageFormatElement[]) => {
    for (const el of elements) {
      if (el.type === TYPE.tag) {
        names.add(`<${el.value}>`)
        walk(el.children)
      } else if (el.type === TYPE.select || el.type === TYPE.plural) {
        names.add(el.value)
        for (const option of Object.values(el.options)) walk(option.value)
      } else if (
        el.type === TYPE.argument ||
        el.type === TYPE.number ||
        el.type === TYPE.date ||
        el.type === TYPE.time
      ) {
        names.add(el.value)
      }
    }
  }
  walk(ast)
  return [...names].sort()
}

/**
 * For a locale kept as one file per namespace, a TypeScript module importing
 * every namespace, so `typeof import('<dir>/<locale>')` types the messages.
 */
export function indexSource(dir: string, locale: string): string {
  const names = localeFiles(dir, locale).map((f) => path.basename(f, '.json'))
  const imports = names.map((n) => `import ${n} from './${n}.json'`).join('\n')
  return `${imports}\n\nexport default {\n${names.map((n) => `  ${n},`).join('\n')}\n}\n`
}

function indexFile(dir: string, locale: string): string {
  return path.join(dir, locale, 'index.ts')
}

export function writeIndex(dir: string, locale: string): void {
  if (isSplit(dir, locale)) writeFileSync(indexFile(dir, locale), indexSource(dir, locale))
}

/**
 * Merges additions into dir's catalogs without changing an existing message.
 * additions is one locale's tree for defaultLocale, or trees keyed by locale.
 * Safe to run from several processes at once.
 */
export function add(dir: string, defaultLocale: string, additions: Messages): void {
  const locales = listLocales(dir)
  const keys = Object.keys(additions)
  const byLocale =
    keys.length > 0 && keys.every((k) => locales.includes(k))
      ? (additions as Record<string, Messages>)
      : { [defaultLocale]: additions }
  const lock = path.join(dir, '.add.lock')
  for (let i = 0; ; i++) {
    try {
      mkdirSync(lock)
      break
    } catch {
      if (i > 200) throw new Error(`${lock} is held: remove it if no other add is running`)
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 25)
    }
  }
  try {
    // Merge everything before writing anything, so a conflict changes no file.
    const writes = Object.entries(byLocale).flatMap(([locale, tree]) => merged(dir, locale, tree))
    for (const [file, value] of writes) writeJSON(file, value)
    for (const locale of Object.keys(byLocale)) writeIndex(dir, locale)
  } finally {
    rmdirSync(lock)
  }
}

function merged(dir: string, locale: string, tree: Messages): [string, Messages][] {
  if (!isSplit(dir, locale)) {
    const file = path.join(dir, `${locale}.json`)
    return [[file, merge(readJSON(file), tree, locale)]]
  }
  return Object.entries(tree).map(([ns, value]) => {
    if (typeof value === 'string')
      throw new Error(`${locale}: ${ns}: a namespace must be an object`)
    // The name becomes both a file name and an identifier in the index, and
    // must not reach outside the locale's directory.
    if (!/^[A-Za-z_$][\w$]*$/.test(ns))
      throw new Error(`${locale}: ${JSON.stringify(ns)} is not a namespace name`)
    const file = path.join(dir, locale, `${ns}.json`)
    let existing: Messages = {}
    try {
      existing = readJSON(file)
    } catch {
      // A new namespace.
    }
    return [file, merge(existing, value, `${locale}.${ns}`)]
  })
}

function merge(into: Messages, from: Messages, at: string): Messages {
  for (const [key, value] of Object.entries(from)) {
    const existing = into[key]
    const where = at ? `${at}.${key}` : key
    if (existing === undefined) into[key] = value
    else if (typeof existing === 'object' && typeof value === 'object')
      merge(existing, value, where)
    else if (existing !== value)
      throw new Error(`${where} already exists as ${JSON.stringify(existing)}`)
  }
  return into
}

function readJSON(file: string): Messages {
  return JSON.parse(readFileSync(file, 'utf8')) as Messages
}

function writeJSON(file: string, value: Messages): void {
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`)
}
