import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { flatten } from './catalogs.js'
import { collectUsage, emptyUsage, findUnused, unused } from './unused.js'

const leaves = (messages: Parameters<typeof flatten>[0]) => [...flatten(messages).keys()]

const usageOf = (source: string, fileName = 'file.tsx') => {
  const u = collectUsage(source, fileName)
  return {
    usedKeys: [...u.usedKeys].sort(),
    usedPrefixes: [...u.usedPrefixes].sort(),
    unscopedKeys: [...u.unscopedKeys].sort(),
  }
}

describe('collectUsage', () => {
  it('joins a useTranslations namespace with the relative key', () => {
    expect(
      usageOf(`const t = useTranslations('runs'); t('title'); t('table.header')`).usedKeys,
    ).toEqual(['runs.table.header', 'runs.title'])
  })

  it('resolves t.rich and t.has the same as t', () => {
    expect(
      usageOf(`const t = useTranslations('modal'); t.rich('body'); t.has('footer')`).usedKeys,
    ).toEqual(['modal.body', 'modal.footer'])
  })

  it('treats useTranslations() as the root scope', () => {
    expect(usageOf(`const t = useTranslations(); t('page.x')`).usedKeys).toEqual(['page.x'])
  })

  it('resolves getTranslations and an awaited one', () => {
    expect(usageOf(`const t = await getTranslations('meta'); t('title')`).usedKeys).toEqual([
      'meta.title',
    ])
  })

  it('marks the static prefix of a template key as a used subtree', () => {
    expect(usageOf("const t = useTranslations('jobs'); t(`states.${s}`)").usedPrefixes).toEqual([
      'jobs.states',
    ])
  })

  it('marks the whole namespace used for a fully dynamic key', () => {
    expect(usageOf(`const t = useTranslations('tabs'); t(tab.key)`).usedPrefixes).toEqual(['tabs'])
  })

  it("resolves a TFunction<'ns'> parameter from its type annotation", () => {
    expect(usageOf(`const build = (t: TFunction<'navigation'>) => t('clusters')`).usedKeys).toEqual(
      ['navigation.clusters'],
    )
  })

  it('unions namespaces when a name is bound to different scopes', () => {
    expect(
      usageOf(`const a = (t: TFunction<'navigation'>) => t('home')
       function b() { const t = useTranslations('runs'); return t('home') }`).usedKeys,
    ).toEqual(['navigation.home', 'runs.home'])
  })

  it('records an untyped translator parameter as an unscoped key', () => {
    const { usedKeys, unscopedKeys } = usageOf(`function label(t) { return t('browserDefault') }`)
    expect(usedKeys).toEqual([])
    expect(unscopedKeys).toEqual(['browserDefault'])
  })

  it("resolves inline useTranslations('ns').rich('key') and useTranslations('ns')('key')", () => {
    expect(
      usageOf(`useTranslations('welcome').rich('banner', {}); useTranslations('x')('y')`).usedKeys,
    ).toEqual(['welcome.banner', 'x.y'])
  })

  it('treats t.raw(key) as a used subtree', () => {
    const { usedKeys, usedPrefixes } = usageOf(
      `const t = useTranslations('jobs'); const all = t.raw('states')`,
    )
    expect(usedKeys).toEqual(['jobs.states'])
    expect(usedPrefixes).toEqual(['jobs.states'])
  })

  it('treats a namespace read off useMessages() as a used subtree', () => {
    expect(usageOf(`const { clusterForm } = useMessages()`).usedPrefixes).toEqual(['clusterForm'])
    expect(usageOf(`const m = useMessages(); use(m.clusterForm.aws)`).usedPrefixes).toEqual([
      'clusterForm',
    ])
    expect(usageOf(`use(useMessages().clusterForm)`).usedPrefixes).toEqual(['clusterForm'])
  })

  it('follows optional calls and members', () => {
    expect(usageOf(`const t = useTranslations('a'); t?.('b'); t.rich?.('c')`).usedKeys).toEqual([
      'a.b',
      'a.c',
    ])
  })

  it('parses .ts files with angle-bracket casts', () => {
    expect(
      usageOf(`const t = useTranslations('a'); const n = <number>x; t('b')`, 'file.ts').usedKeys,
    ).toEqual(['a.b'])
  })
})

describe('findUnused', () => {
  const keys = leaves({
    runs: { title: 'x', unused: 'y' },
    jobs: { states: { RUNNING: 'r', DONE: 'd' } },
    languageSettings: { browserDefault: 'b' },
    tabs: { overview: 'o' },
  })

  it('reports only keys with no use, covering prefix, full-key literal or unscoped match', () => {
    const usage = emptyUsage()
    usage.usedKeys.add('runs.title')
    usage.usedPrefixes.add('jobs.states')
    usage.literals.add('tabs.overview')
    usage.unscopedKeys.add('browserDefault')
    expect(findUnused(keys, usage)).toEqual(['runs.unused'])
  })

  it('never reports a kept namespace', () => {
    const withErrors = leaves({ apiErrors: { product_disabled: 'p' }, runs: { unused: 'y' } })
    expect(findUnused(withErrors, emptyUsage(), ['apiErrors'])).toEqual(['runs.unused'])
  })

  it('does not let a literal of an ancestor path cover its descendants', () => {
    const usage = emptyUsage()
    usage.literals.add('jobs.states')
    expect(findUnused(keys, usage)).toEqual(
      expect.arrayContaining(['jobs.states.RUNNING', 'jobs.states.DONE']),
    )
  })
})

describe('unused', () => {
  it('reads the default locale and scans .ts and .tsx outside node_modules and the locales', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'i18n-unused-'))
    const locales = path.join(root, 'src', 'locales')
    mkdirSync(locales, { recursive: true })
    writeFileSync(
      path.join(locales, 'en.json'),
      JSON.stringify({ a: { used: 'x', gone: 'y', vendor: 'z' } }),
    )
    // A route directory may be named build.
    mkdirSync(path.join(root, 'src', 'build'))
    writeFileSync(
      path.join(root, 'src', 'build', 'A.tsx'),
      `export function A() { const t = useTranslations('a'); return t('used') }`,
    )
    mkdirSync(path.join(root, 'src', 'node_modules'))
    writeFileSync(path.join(root, 'src', 'node_modules', 'v.ts'), `useTranslations('a')('vendor')`)
    writeFileSync(path.join(root, 'src', 'types.d.ts'), `declare const k = 'a.gone'`)

    expect(unused({ dir: locales, defaultLocale: 'en', src: [path.join(root, 'src')] })).toEqual([
      'a.gone',
      'a.vendor',
    ])
  })
})
