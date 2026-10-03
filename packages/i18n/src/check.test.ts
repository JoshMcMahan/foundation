import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { add, argumentsOf, check, writeIndex } from './check.js'

let dir = ''
afterEach(() => rmSync(dir, { recursive: true, force: true }))

function single(files: Record<string, unknown>) {
  dir = mkdtempSync(path.join(tmpdir(), 'i18n-'))
  for (const [locale, messages] of Object.entries(files)) {
    writeFileSync(path.join(dir, `${locale}.json`), JSON.stringify(messages))
  }
}

function split(files: Record<string, Record<string, unknown>>) {
  dir = mkdtempSync(path.join(tmpdir(), 'i18n-'))
  for (const [locale, namespaces] of Object.entries(files)) {
    mkdirSync(path.join(dir, locale))
    for (const [ns, messages] of Object.entries(namespaces)) {
      writeFileSync(path.join(dir, locale, `${ns}.json`), JSON.stringify(messages))
    }
  }
}

describe('argumentsOf', () => {
  it('collects arguments, plural and select names, and tags', () => {
    expect(argumentsOf('{count, plural, one {# {kind}} other {<b>#</b>}} by {name}')).toEqual([
      '<b>',
      'count',
      'kind',
      'name',
    ])
  })
  it('reports a message that is not valid ICU', () => {
    expect(argumentsOf('Hello {name')).toMatch(/not valid ICU/)
  })
})

describe('check', () => {
  it('passes consistent catalogs', () => {
    single({ en: { a: { hi: 'Hi {name}' } }, es: { a: { hi: 'Hola {name}' } } })
    expect(check(dir, 'en')).toEqual([])
  })
  it('reports missing and extra keys', () => {
    single({ en: { a: 'A', b: 'B' }, es: { a: 'A', c: 'C' } })
    expect(check(dir, 'en')).toEqual(['es: missing b', 'es: c is not in en'])
  })
  it('reports a translation with different arguments or tags', () => {
    single({
      en: { a: 'Hi {name}', b: 'See <link>docs</link>' },
      es: { a: 'Hola {nombre}', b: 'Ver docs' },
    })
    expect(check(dir, 'en')).toEqual([
      'es: a uses {nombre}, en uses {name}',
      'es: b uses {}, en uses {<link>}',
    ])
  })
  it('reports invalid ICU in any locale', () => {
    single({ en: { a: 'Hi {name' }, es: { a: 'Hola {name}' } })
    expect(check(dir, 'en')[0]).toMatch(/^en: a: not valid ICU/)
  })
  it('requires a current index for the one-file-per-namespace layout', () => {
    split({
      en: { nav: { home: 'Home' }, apiErrors: { x: 'X' } },
      es: { nav: { home: 'Inicio' }, apiErrors: { x: 'X' } },
    })
    expect(check(dir, 'en')[0]).toMatch(/index.ts is out of date/)
    writeIndex(dir, 'en')
    expect(check(dir, 'en')).toEqual([])
    expect(readFileSync(path.join(dir, 'en', 'index.ts'), 'utf8')).toContain(
      "import apiErrors from './apiErrors.json'",
    )
  })
})

describe('add', () => {
  it('merges new messages into the default locale', () => {
    single({ en: { a: { x: 'X' } } })
    add(dir, 'en', { a: { y: 'Y' }, b: 'B' })
    expect(JSON.parse(readFileSync(path.join(dir, 'en.json'), 'utf8'))).toEqual({
      a: { x: 'X', y: 'Y' },
      b: 'B',
    })
  })
  it('refuses to change a message and writes nothing', () => {
    single({ en: { a: 'A' }, es: { a: 'A' } })
    expect(() => add(dir, 'en', { es: { b: 'B' }, en: { a: 'Changed' } })).toThrow(
      /en\.a already exists/,
    )
    expect(JSON.parse(readFileSync(path.join(dir, 'es.json'), 'utf8'))).toEqual({ a: 'A' })
  })
  it('adds a namespace to every locale given and refreshes the index', () => {
    split({ en: { nav: { home: 'Home' } }, es: { nav: { home: 'Inicio' } } })
    writeIndex(dir, 'en')
    add(dir, 'en', {
      en: { billing: { title: 'Billing' } },
      es: { billing: { title: 'Facturación' } },
    })
    expect(check(dir, 'en')).toEqual([])
  })
  it.each(['../../escape', 'a/b', 'a\\b', '..', ''])('refuses the namespace %j', (ns) => {
    split({ en: { nav: { home: 'Home' } } })
    expect(() => add(dir, 'en', { en: { [ns]: { x: 'X' } } })).toThrow(/is not a namespace name/)
  })
})
