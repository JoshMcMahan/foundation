import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { i18n } from './vite.js'

let dir = ''
beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'i18n-vite-'))
  for (const [locale, title] of [
    ['en', 'Home'],
    ['es', 'Inicio'],
  ] as const) {
    mkdirSync(path.join(dir, locale))
    writeFileSync(path.join(dir, locale, 'nav.json'), JSON.stringify({ title }))
    writeFileSync(path.join(dir, locale, 'admin.json'), JSON.stringify({ title: `${title} admin` }))
  }
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

type Hook = (this: unknown, ...args: unknown[]) => unknown

function setup() {
  const plugin = i18n({ dir, defaultLocale: 'en', catalogs: { admin: ['admin'] } })
  ;(plugin.configResolved as Hook).call({}, { root: '/' })
  const watched: string[] = []
  const ctx = {
    addWatchFile: (f: string) => watched.push(f),
    error: (m: string) => {
      throw new Error(m)
    },
  }
  const resolve = (id: string) => (plugin.resolveId as Hook).call(ctx, id)
  const load = (id: string) => (plugin.load as Hook).call(ctx, id) as string | undefined
  return { resolve, load, watched }
}

describe('i18n vite plugin', () => {
  it('resolves only its virtual modules', () => {
    const { resolve } = setup()
    expect(resolve('virtual:i18n')).toBe('\0virtual:i18n')
    expect(resolve('virtual:i18n/es/admin')).toBe('\0virtual:i18n/es/admin')
    expect(resolve('react')).toBeUndefined()
  })

  it('exports the locales and a lazy loader for each locale and catalog', () => {
    const code = setup().load('\0virtual:i18n') ?? ''
    expect(code).toContain('export const locales = ["en","es"]')
    expect(code).toContain('import defaultMessages from "virtual:i18n/en/common"')
    expect(code).toContain(
      '"es": {"common": () => import("virtual:i18n/es/common"),"admin": () => import("virtual:i18n/es/admin")}',
    )
  })

  it('splits a locale into the common catalog and feature catalogs', () => {
    const { load, watched } = setup()
    expect(load('\0virtual:i18n/es/common')).toBe('export default {"nav":{"title":"Inicio"}}')
    expect(load('\0virtual:i18n/es/admin')).toBe(
      'export default {"admin":{"title":"Inicio admin"}}',
    )
    expect(watched).toContain(path.join(dir, 'es', 'nav.json'))
  })

  it('rejects an unknown locale or catalog', () => {
    expect(() => setup().load('\0virtual:i18n/fr/common')).toThrow(
      /unknown message catalog fr\/common/,
    )
  })
})
