import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  applyTheme,
  contrastRatio,
  DEFAULT_PRESET,
  deriveTheme,
  isDarkColor,
  THEME_PRESETS,
  THEME_TOKENS,
  type ThemeVariables,
} from './index'

const themeCss = readFileSync(
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../styles/theme.css'),
  'utf8',
)

describe('the theme contract', () => {
  it('derives exactly the closed token set', () => {
    for (const preset of THEME_PRESETS) {
      const vars = deriveTheme(preset.seed)
      expect(Object.keys(vars).sort()).toEqual([...THEME_TOKENS].sort())
    }
  })

  it('only defines contract tokens in theme.css', () => {
    const defined = [...themeCss.matchAll(/^\s*(--theme-[\w-]+):/gm)].map((m) => m[1])
    expect(defined.length).toBeGreaterThan(0)
    for (const token of defined) {
      expect(THEME_TOKENS).toContain(token)
    }
  })

  it('gives sidebar tokens no :root defaults so host fallbacks stay in effect', () => {
    expect(themeCss).not.toMatch(/^\s*--theme-sidebar-/m)
    expect(themeCss).not.toMatch(/^\s*--theme-bg:/m)
  })
})

describe('deriveTheme', () => {
  const seeds = [
    { name: 'light', accent: '#06354f', background: '#ffffff' },
    { name: 'off-white', accent: '#0d6efd', background: '#f3f4f6' },
    { name: 'dark', accent: '#2f81f7', background: '#0d1117' },
    { name: 'purple-dark', accent: '#c4a7e7', background: '#191724' },
  ]

  it.each(seeds)('keeps text readable on $name backgrounds', (seed) => {
    const vars = deriveTheme(seed)
    expect(contrastRatio(vars['--theme-app'], vars['--theme-app-bg'])).toBeGreaterThanOrEqual(7)
    expect(contrastRatio(vars['--theme-link'], vars['--theme-app-bg'])).toBeGreaterThanOrEqual(4.5)
    expect(
      contrastRatio(vars['--theme-element-text'], vars['--theme-element']),
    ).toBeGreaterThanOrEqual(3)
    expect(
      contrastRatio(vars['--theme-sidebar-text'], vars['--theme-sidebar-hover']),
    ).toBeGreaterThanOrEqual(3)
  })

  it.each(seeds)('keeps status hues readable on $name backgrounds', (seed) => {
    const vars = deriveTheme(seed)
    for (const token of [
      '--theme-success',
      '--theme-error',
      '--theme-warning',
      '--theme-info',
    ] as const) {
      expect(contrastRatio(vars[token], vars['--theme-app-bg'])).toBeGreaterThanOrEqual(3)
    }
  })

  it('lifts panels above dark backgrounds and keeps them light on light ones', () => {
    const dark = deriveTheme({ accent: '#2f81f7', background: '#0d1117' })
    expect(isDarkColor(dark['--theme-panel-bg'])).toBe(true)
    expect(dark['--theme-panel-bg']).not.toBe(dark['--theme-app-bg'])

    const light = deriveTheme({ accent: '#06354f', background: '#f3f4f6' })
    expect(isDarkColor(light['--theme-panel-bg'])).toBe(false)
  })

  it('honors an explicit sidebar surface seed', () => {
    const vars = deriveTheme({
      interface: { accent: '#06354f', background: '#ffffff' },
      sidebar: { accent: '#06354f', background: '#06354f' },
    })
    expect(vars['--theme-bg']).toBe('#06354f')
    expect(contrastRatio(vars['--theme-sidebar-text'], vars['--theme-bg'])).toBeGreaterThanOrEqual(
      4.5,
    )
  })

  it('softens foregrounds at lower contrast', () => {
    const normal = deriveTheme({ accent: '#06354f', background: '#ffffff' })
    const soft = deriveTheme({
      accent: '#06354f',
      background: '#ffffff',
      contrast: 0.6,
    })
    expect(contrastRatio(soft['--theme-app'], soft['--theme-app-bg'])).toBeLessThan(
      contrastRatio(normal['--theme-app'], normal['--theme-app-bg']),
    )
  })

  it('rejects malformed seed colors', () => {
    expect(() => deriveTheme({ accent: 'blue', background: '#ffffff' })).toThrow()
  })
})

describe('applyTheme', () => {
  it('sets every provided variable on the element', () => {
    const set = new Map<string, string>()
    const el = {
      style: { setProperty: (k: string, v: string) => set.set(k, v) },
    } as unknown as HTMLElement
    const vars = deriveTheme(DEFAULT_PRESET.seed)
    applyTheme(el, vars)
    expect(set.size).toBe(THEME_TOKENS.length)
    expect(set.get('--theme-element')).toBe((vars as ThemeVariables)['--theme-element'])
  })
})
