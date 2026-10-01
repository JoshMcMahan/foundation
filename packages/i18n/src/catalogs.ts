import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'

/** A message catalog: nested objects whose leaves are ICU messages. */
export type Messages = { [key: string]: string | Messages }

/**
 * The locales in dir. A locale is either one file, <dir>/<locale>.json, or a
 * directory with one file per namespace, <dir>/<locale>/<namespace>.json.
 */
export function listLocales(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true })
    .flatMap((entry) => {
      if (entry.isFile() && entry.name.endsWith('.json')) return [entry.name.slice(0, -5)]
      if (entry.isDirectory()) return [entry.name]
      return []
    })
    .sort()
}

/** The files a locale's messages come from, for watching them. */
export function localeFiles(dir: string, locale: string): string[] {
  const file = path.join(dir, `${locale}.json`)
  if (existsSync(file)) return [file]
  const split = path.join(dir, locale)
  return readdirSync(split)
    .filter((name) => name.endsWith('.json'))
    .sort()
    .map((name) => path.join(split, name))
}

/** A locale's messages, from either layout; a split locale is keyed by namespace. */
export function readLocale(dir: string, locale: string): Messages {
  const file = path.join(dir, `${locale}.json`)
  if (existsSync(file) && statSync(file).isFile()) return parse(file) as Messages
  return Object.fromEntries(
    localeFiles(dir, locale).map((f) => [path.basename(f, '.json'), parse(f) as Messages]),
  )
}

/** Whether dir keeps each locale in one file per namespace. */
export function isSplit(dir: string, locale: string): boolean {
  return !existsSync(path.join(dir, `${locale}.json`))
}

function parse(file: string): unknown {
  try {
    return JSON.parse(readFileSync(file, 'utf8'))
  } catch (error) {
    throw new Error(`${file}: ${(error as Error).message}`)
  }
}

/**
 * Feature catalogs: each lists the namespaces only that feature needs, loaded
 * when it's shown. Everything else is in the common catalog.
 */
export type CatalogMap = Record<string, readonly string[]>

export const COMMON = 'common'

/** The namespaces of messages that belong in catalog. */
export function selectCatalog(messages: Messages, catalog: string, catalogs: CatalogMap): Messages {
  if (catalog !== COMMON) {
    const names = catalogs[catalog]
    if (!names) throw new Error(`unknown message catalog ${catalog}`)
    return Object.fromEntries(Object.entries(messages).filter(([ns]) => names.includes(ns)))
  }
  const featured = new Set(Object.values(catalogs).flat())
  return Object.fromEntries(Object.entries(messages).filter(([ns]) => !featured.has(ns)))
}

/** Every message, keyed by its dotted path. */
export function flatten(messages: Messages, prefix = ''): Map<string, string> {
  const out = new Map<string, string>()
  for (const [key, value] of Object.entries(messages)) {
    const at = prefix ? `${prefix}.${key}` : key
    if (typeof value === 'string') out.set(at, value)
    else for (const [k, v] of flatten(value, at)) out.set(k, v)
  }
  return out
}
