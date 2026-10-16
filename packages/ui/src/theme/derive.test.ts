import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { deltaE, JND, oklch, parseColor, toHex } from './color'
import {
  apcaContrast,
  contrastRatio,
  isDarkColor,
  measure,
  over,
  type Shown,
  shownValue,
} from './contrast'
import { CATEGORY_COUNT, CONTROL_ON, PLACEHOLDER_ON } from './derive'
import {
  applyTheme,
  CODE_STYLES,
  DEFAULT_THEME,
  deriveTheme,
  generateTheme,
  type Scheme,
  SIDEBAR_TOKENS,
  schemeFor,
  THEME_PRESETS,
  THEME_TOKENS,
  type ThemeToken,
  type ThemeVariables,
  themeStylesheet,
} from './index'

const themeCssPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../styles/theme.css',
)
const themeCss = readFileSync(themeCssPath, 'utf8')

const shownOf = (vars: Partial<ThemeVariables>, token: ThemeToken): Shown => {
  const value = vars[token] as string
  const rgba = /^rgba\((\d+), (\d+), (\d+), ([\d.]+)\)$/.exec(value)
  if (rgba) {
    throw new Error(`${token} is translucent; composite it first`)
  }
  const shown = shownValue(value)
  if (!shown) {
    throw new Error(`${token} is not a color: ${value}`)
  }
  return shown
}

describe('the theme contract', () => {
  it('derives exactly the closed token set, in both modes of every preset', () => {
    for (const preset of THEME_PRESETS) {
      for (const mode of ['light', 'dark'] as const) {
        const vars = deriveTheme(schemeFor(preset.theme, mode))
        expect(Object.keys(vars).sort()).toEqual([...THEME_TOKENS].sort())
      }
    }
  })

  it('only defines contract tokens in theme.css', () => {
    const defined = [...themeCss.matchAll(/^\s*(--theme-[\w-]+):/gm)].map((m) => m[1])
    expect(defined.length).toBeGreaterThan(0)
    for (const token of defined) {
      expect(THEME_TOKENS).toContain(token)
    }
  })

  it('reads no token the generator does not make', () => {
    // A misspelled or retired token silently inherits whatever color is around it.
    const src = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
    const files = readdirSync(src, { recursive: true, encoding: 'utf8' }).filter(
      (f) => /\.(tsx?|css)$/.test(f) && !/\.(test|stories)\.tsx?$/.test(f),
    )
    const unknown = new Set<string>()
    for (const file of files) {
      // Prefixes such as `--theme-code-${name}` are skipped; the contract test covers what they make.
      for (const [token] of readFileSync(path.join(src, file), 'utf8').matchAll(
        /--theme-[a-z0-9-]*[a-z0-9](?![\w-])/g,
      )) {
        if (!(THEME_TOKENS as readonly string[]).includes(token)) {
          unknown.add(`${file}: ${token}`)
        }
      }
    }
    expect([...unknown]).toEqual([])
  })

  it('gives sidebar tokens no defaults in theme.css, so host fallbacks stay in effect', () => {
    expect(themeCss).not.toMatch(/^\s*--theme-sidebar-/m)
  })

  it('ships the default theme as theme.css defaults, both modes, sRGB and display-p3', () => {
    const generated = themeStylesheet(
      ':root',
      { light: schemeFor(DEFAULT_THEME, 'light'), dark: schemeFor(DEFAULT_THEME, 'dark') },
      { omit: SIDEBAR_TOKENS },
    )
    const block = /\/\* generated:start[^\n]*\*\/\n([\s\S]*?)\/\* generated:end \*\//.exec(themeCss)
    if (process.env['UPDATE_THEME_CSS'] && block) {
      writeFileSync(themeCssPath, themeCss.replace(block[1] as string, generated))
      return
    }
    // Run with UPDATE_THEME_CSS=1 to rewrite it after changing the generator or the default theme.
    expect(block?.[1]).toBe(generated)
  })
})

// Bases across the range: white, off-white, tinted, warm, mid-dark, the darkest, and hued darks.
const BASES = [
  '#ffffff',
  '#f3f4f6',
  '#faf8ff',
  '#fdf6e3',
  '#3a3a3a',
  '#000000',
  '#0d1117',
  '#191724',
  '#1e2b20',
]
// Accents from navy to near-white, pale, neon and yellow.
const ACCENTS = ['#06354f', '#0d6efd', '#fafafa', '#ffeb3b', '#ff00ff', '#c4a7e7', '#00a86b']
const CONTRASTS = [0, 30, 100]
const GRID = BASES.flatMap((base) =>
  ACCENTS.flatMap((accent) => CONTRASTS.map((contrast) => ({ base, accent, contrast }))),
)

const TEXT_ON: ThemeToken[] = [
  '--theme-app-bg',
  '--theme-panel-bg',
  '--theme-panel-hover',
  '--theme-muted-panel-bg',
  '--theme-hover',
  '--theme-input-bg',
  '--theme-accent-subtle',
]
const CODE_ON: ThemeToken[] = ['--theme-code-bg', '--theme-panel-bg', '--theme-app-bg']

const STATUSES = ['success', 'error', 'warning', 'info', 'favorite'] as const
// The surfaces a status's icon, dot, border or words sit on.
const STATUS_ON: ThemeToken[] = [
  '--theme-app-bg',
  '--theme-panel-bg',
  '--theme-panel-hover',
  '--theme-muted-panel-bg',
  '--theme-hover',
  '--theme-input-bg',
]
const WHITE = shownValue('#ffffff') as Shown

/** A translucent token as it shows over an opaque one, composited in the fill's gamut. */
function composited(vars: Partial<ThemeVariables>, fill: ThemeToken, under: ThemeToken): Shown {
  const value = vars[fill] as string
  const m =
    /^rgba\((\d+), (\d+), (\d+), ([\d.]+)\)$/.exec(value) ??
    /^color\(display-p3 ([\d.]+) ([\d.]+) ([\d.]+) \/ ([\d.]+)\)$/.exec(value)
  const backdrop = parseColor(vars[under] as string)
  if (!m || !backdrop) {
    throw new Error(`${fill} over ${under} can't be composited: ${value}`)
  }
  const gamut = value.startsWith('color(') ? 'p3' : 'srgb'
  const rgb = [m[1], m[2], m[3]].map((v) => Number(v) / (gamut === 'p3' ? 1 : 255))
  const shown = over({ rgb: rgb as Shown['rgb'], gamut }, Number(m[4]), backdrop)
  // An sRGB screen blends 8-bit channels, as the generator measures it.
  const eight = (v: number) => Math.round(Number((v * 255).toFixed(6))) / 255
  return gamut === 'p3' ? shown : { ...shown, rgb: shown.rgb.map(eight) as Shown['rgb'] }
}

/** Every pair the generator promises, with its WCAG floor and the APCA floor at contrast 0. */
function pairs(vars: Partial<ThemeVariables>): [ThemeToken, Shown, number, number][] {
  const out: [ThemeToken, Shown, number, number][] = []
  const on = (fg: ThemeToken, bgs: (ThemeToken | Shown)[], wcag: number, apca = 0) => {
    for (const bg of bgs) {
      out.push([fg, typeof bg === 'string' ? shownOf(vars, bg) : bg, wcag, apca])
    }
  }
  on('--theme-app', TEXT_ON, 4.5, 75)
  on('--theme-muted-text-color', TEXT_ON, 4.5, 60)
  on('--theme-placeholder', PLACEHOLDER_ON, 3, 45)
  on('--theme-link', ['--theme-app-bg', '--theme-panel-bg', '--theme-hover'], 4.5, 60)
  on('--theme-focus', ['--theme-app-bg', '--theme-panel-bg', '--theme-input-bg'], 3)
  // A control's edge or off track: WCAG 1.4.11's 3:1, on its surfaces and its own fill.
  on('--theme-border-strong', CONTROL_ON, 3)
  // A text field's resting edge: quieter than a control's, above a divider's.
  on('--theme-border-field', CONTROL_ON, 1.3)
  on('--theme-accent-text', ['--theme-accent', '--theme-accent-hover'], 4.5)
  for (const status of STATUSES) {
    // Both shades also sit on the status's own muted fill, as in a badge or a callout.
    const muted = (['--theme-app-bg', '--theme-panel-bg'] as const).map((under) =>
      composited(vars, `--theme-${status}-muted`, under),
    )
    // The vivid shade is a graphic: WCAG 1.4.11's 3:1, no text target.
    on(`--theme-${status}`, [...STATUS_ON, ...muted], 3)
    on(`--theme-${status}-text`, [...STATUS_ON, ...muted], 4.5, 60)
    // A solid fill keeps a white label.
    on(`--theme-${status}-solid`, [WHITE], 4.5)
  }
  for (let i = 1; i <= CATEGORY_COUNT; i++) {
    // A fallback avatar's initials, or a group's icon, on its category fill.
    on(`--theme-category-${i}-text` as ThemeToken, [`--theme-category-${i}` as ThemeToken], 4.5, 60)
  }
  on('--theme-sidebar-text', ['--theme-sidebar-bg', '--theme-sidebar-hover'], 4.5, 75)
  on('--theme-sidebar-active-text', ['--theme-sidebar-active-bg'], 4.5, 75)
  for (const token of [
    '--theme-code-text',
    '--theme-code-comment',
    '--theme-code-keyword',
    '--theme-code-string',
    '--theme-code-number',
    '--theme-code-function',
    '--theme-code-type',
    '--theme-code-property',
    '--theme-ansi-red',
    '--theme-ansi-green',
    '--theme-ansi-yellow',
    '--theme-ansi-blue',
    '--theme-ansi-magenta',
    '--theme-ansi-cyan',
  ] as const) {
    on(token, CODE_ON, 4.5, 60)
  }
  return out
}

describe('generateTheme', () => {
  it.each(GRID)(
    'meets WCAG AA and the APCA floor on $base with $accent at contrast $contrast',
    (seed) => {
      for (const code of CODE_STYLES) {
        const vars = deriveTheme({ interface: seed }, { code })
        for (const [fg, bg, wcag, apca] of pairs(vars)) {
          const got = measure(shownOf(vars, fg), bg)
          expect(got.wcag, `${fg} WCAG`).toBeGreaterThanOrEqual(wcag)
          expect(got.apca, `${fg} APCA`).toBeGreaterThanOrEqual(apca)
        }
      }
    },
  )

  it.each(GRID)(
    'keeps a placeholder lighter than a value on $base with $accent at contrast $contrast',
    (seed) => {
      const vars = deriveTheme({ interface: seed })
      for (const bg of PLACEHOLDER_ON) {
        const surface = shownOf(vars, bg)
        const hint = measure(shownOf(vars, '--theme-placeholder'), surface)
        const muted = measure(shownOf(vars, '--theme-muted-text-color'), surface)
        expect(hint.wcag, bg).toBeLessThan(muted.wcag)
      }
    },
  )

  it.each(GRID.filter((s) => s.contrast === 30))(
    'keeps every promise in display-p3 too on $base with $accent',
    (seed) => {
      const { srgb, p3 } = generateTheme({ interface: seed }, { code: 'vivid' })
      const shown = { ...srgb, ...p3 }
      for (const [fg, , wcag, apca] of pairs(srgb)) {
        for (const [pairFg, bg] of pairs(shown).filter(([f]) => f === fg)) {
          const got = measure(shownOf(shown, pairFg), bg)
          expect(got.wcag, `${fg} WCAG in p3`).toBeGreaterThanOrEqual(wcag)
          expect(got.apca, `${fg} APCA in p3`).toBeGreaterThanOrEqual(apca)
        }
      }
    },
  )

  it('keeps status graphics vivid on light bases, short of the contrast text needs', () => {
    // Held to text's targets, a red icon or dot turns near-maroon; a graphic needs only 3:1.
    for (const { base, accent } of GRID.filter((s) => s.contrast === 30)) {
      const vars = deriveTheme({ interface: { base, accent } })
      if (isDarkColor(vars['--theme-app-bg'])) {
        continue
      }
      for (const status of STATUSES) {
        const on = (token: ThemeToken) => contrastRatio(vars[token], vars['--theme-app-bg'])
        expect(on(`--theme-${status}`), status).toBeLessThan(4.5)
        expect(on(`--theme-${status}-text`), status).toBeGreaterThan(on(`--theme-${status}`))
      }
    }
  })

  it('fills buttons with the accent exactly as picked', () => {
    for (const { base, accent } of GRID) {
      expect(deriveTheme({ interface: { base, accent } })['--theme-accent']).toBe(
        toHex(oklch(accent)),
      )
    }
  })

  it('raises text contrast and surface separation with the contrast setting', () => {
    for (const base of ['#ffffff', '#0d1117']) {
      const [low, mid, high] = CONTRASTS.map((contrast) =>
        deriveTheme({ interface: { base, accent: '#0d6efd', contrast } }),
      ) as [ThemeVariables, ThemeVariables, ThemeVariables]
      const text = (v: ThemeVariables) => contrastRatio(v['--theme-app'], v['--theme-app-bg'])
      const border = (v: ThemeVariables) => contrastRatio(v['--theme-border'], v['--theme-app-bg'])
      expect(text(low)).toBeLessThan(text(mid))
      expect(text(mid)).toBeLessThan(text(high))
      expect(border(low)).toBeLessThan(border(mid))
      expect(border(mid)).toBeLessThan(border(high))
    }
  })

  it('makes a dark mode hover stand out from the page, and leaves light mode as it was', () => {
    for (const base of ['#0d1117', '#111418', '#191724', '#000000', '#3a3a3a']) {
      for (const contrast of CONTRASTS) {
        const v = deriveTheme({ interface: { base, accent: '#2f81f7', contrast } })
        const ratio = contrastRatio(v['--theme-hover'], v['--theme-app-bg'])
        expect(ratio, `${base} at ${contrast}`).toBeGreaterThanOrEqual(
          contrast === 30 ? 1.59 : 1.45,
        )
        // Text keeps well past AA on it.
        expect(contrastRatio(v['--theme-app'], v['--theme-hover'])).toBeGreaterThanOrEqual(
          contrast === 0 ? 4.5 : 7,
        )
      }
    }
    // A light base keeps its quieter step.
    expect(
      deriveTheme({ interface: { base: '#f3f4f6', accent: '#06354f' } })['--theme-hover'],
    ).toBe('#e3e5e9')
  })

  it('holds control edges to 3:1 in both modes of every preset, and leaves decorative lines quiet', () => {
    for (const preset of THEME_PRESETS) {
      for (const mode of ['light', 'dark'] as const) {
        const scheme = schemeFor(preset.theme, mode)
        for (const contrast of CONTRASTS) {
          const v = deriveTheme({ ...scheme, interface: { ...scheme.interface, contrast } })
          const at = `${preset.name} ${mode} at ${contrast}`
          for (const surface of CONTROL_ON) {
            const edge = contrastRatio(v['--theme-border-strong'], v[surface])
            expect(edge, `edge on ${surface}, ${at}`).toBeGreaterThanOrEqual(
              contrast === 100 ? 4.5 : 3,
            )
            // A checked control's edge, and a slider's filled part.
            if (surface !== '--theme-muted-panel-bg') {
              expect(contrastRatio(v['--theme-focus'], v[surface]), at).toBeGreaterThanOrEqual(3)
            }
          }
          // Cards, dividers and table lines keep their quieter line.
          expect(contrastRatio(v['--theme-border'], v['--theme-app-bg']), at).toBeLessThan(3)
        }
      }
    }
  })

  it("rests a text field's edge between a divider and a control's, reaching 3:1 at high contrast", () => {
    for (const preset of THEME_PRESETS) {
      for (const mode of ['light', 'dark'] as const) {
        const scheme = schemeFor(preset.theme, mode)
        for (const contrast of CONTRASTS) {
          const v = deriveTheme({ ...scheme, interface: { ...scheme.interface, contrast } })
          const at = `${preset.name} ${mode} at ${contrast}`
          for (const surface of CONTROL_ON) {
            const on = (token: ThemeToken) => contrastRatio(v[token], v[surface])
            const field = on('--theme-border-field')
            expect(field, `field on ${surface}, ${at}`).toBeGreaterThanOrEqual(
              { 0: 1.3, 30: 1.5, 100: 3 }[contrast] as number,
            )
            expect(field, `field above a divider on ${surface}, ${at}`).toBeGreaterThan(
              on('--theme-border'),
            )
            // Hover raises the edge to the control's, which must read as a step up.
            expect(on('--theme-border-strong'), `hover on ${surface}, ${at}`).toBeGreaterThan(
              field * 1.3,
            )
          }
          // A form of fields stays calm: at the default contrast and below, a field's edge
          // keeps under 2:1 on the page.
          if (contrast <= 30) {
            expect(contrastRatio(v['--theme-border-field'], v['--theme-app-bg']), at).toBeLessThan(
              2,
            )
          }
        }
      }
    }
  })

  it('keeps category text readable on its fill in both modes of every preset', () => {
    for (const preset of THEME_PRESETS) {
      for (const mode of ['light', 'dark'] as const) {
        const scheme = schemeFor(preset.theme, mode)
        for (const contrast of CONTRASTS) {
          const v = deriveTheme({ ...scheme, interface: { ...scheme.interface, contrast } })
          for (let i = 1; i <= CATEGORY_COUNT; i++) {
            const fill = v[`--theme-category-${i}` as ThemeToken]
            const text = v[`--theme-category-${i}-text` as ThemeToken]
            const at = `${preset.name} ${mode} category ${i} at ${contrast}`
            expect(contrastRatio(text, fill), at).toBeGreaterThanOrEqual(contrast === 100 ? 7 : 4.5)
            expect(apcaContrast(text, fill), at).toBeGreaterThanOrEqual(
              contrast === 0 ? 60 : contrast === 30 ? 70 : 85,
            )
          }
        }
      }
    }
  })

  it('keeps category fills calm and apart: one lightness, one chroma, distinct hues', () => {
    for (const mode of ['light', 'dark'] as const) {
      const v = deriveTheme(schemeFor(DEFAULT_THEME, mode))
      const fills = Array.from({ length: CATEGORY_COUNT }, (_, i) =>
        oklch(v[`--theme-category-${i + 1}` as ThemeToken]),
      )
      const ls = fills.map((f) => f.l)
      const cs = fills.map((f) => f.c)
      // Matched within what sRGB rounding and gamut mapping leave.
      expect(Math.max(...ls) - Math.min(...ls), mode).toBeLessThan(0.02)
      expect(Math.max(...cs) - Math.min(...cs), mode).toBeLessThan(0.02)
      // Every pair is several just-noticeable differences apart.
      for (let a = 0; a < fills.length; a++) {
        for (let b = a + 1; b < fills.length; b++) {
          expect(
            deltaE(fills[a] as never, fills[b] as never),
            `${mode} ${a + 1}/${b + 1}`,
          ).toBeGreaterThan(2 * JND)
        }
      }
    }
  })

  it('solves an accent too pale for the page darker than the off track', () => {
    for (const { base, accent, contrast } of GRID) {
      const v = deriveTheme({ interface: { base, accent, contrast } })
      const onPage = (token: ThemeToken) => contrastRatio(v[token], v['--theme-app-bg'])
      if (v['--theme-focus'] === v['--theme-accent']) {
        continue
      }
      expect(onPage('--theme-focus'), `${base} ${accent} at ${contrast}`).toBeGreaterThan(
        onPage('--theme-border-strong') * 1.2,
      )
    }
  })

  it('lifts panels above dark backgrounds and keeps them light on light ones', () => {
    const dark = deriveTheme({ interface: { base: '#0d1117', accent: '#2f81f7' } })
    const darkL = (token: ThemeToken) => oklch(dark[token]).l
    expect(darkL('--theme-panel-bg')).toBeGreaterThan(darkL('--theme-app-bg'))
    const light = deriveTheme({ interface: { base: '#f3f4f6', accent: '#06354f' } })
    expect(oklch(light['--theme-panel-bg']).l).toBeGreaterThan(oklch(light['--theme-app-bg']).l)
    // A white base has no room above it: panels stay white.
    expect(
      deriveTheme({ interface: { base: '#ffffff', accent: '#06354f' } })['--theme-panel-bg'],
    ).toBe('#ffffff')
  })

  it('gives the sidebar its own base and accent', () => {
    const scheme: Scheme = {
      interface: { base: '#ffffff', accent: '#06354f' },
      sidebar: { base: '#06354f', accent: '#e11d48' },
    }
    const vars = deriveTheme(scheme)
    expect(vars['--theme-sidebar-bg']).toBe('#06354f')
    const active = oklch(vars['--theme-sidebar-active-bg'])
    expect(Math.abs(active.h - oklch('#e11d48').h)).toBeLessThan(10)
    // Without one, the sidebar is the page's base a little deeper.
    const plain = deriveTheme({ interface: scheme.interface })
    expect(oklch(plain['--theme-sidebar-bg']).l).toBeLessThan(oklch(plain['--theme-app-bg']).l)
  })

  it('shades a mid-tone sidebar’s own hue for the active item under a white sidebar accent', () => {
    const sidebar = oklch('#0c75ad')
    const vars = deriveTheme({
      interface: { base: '#ffffff', accent: '#0c75ad' },
      sidebar: { base: '#0c75ad', accent: '#ffffff' },
    })
    const active = oklch(vars['--theme-sidebar-active-bg'])
    expect(active.c).toBeGreaterThan(0.08)
    expect(Math.abs(active.h - sidebar.h)).toBeLessThan(10)
    // White text has no room on a lighter fill, so the fill deepens rather than matching the sidebar.
    expect(active.l).toBeLessThan(sidebar.l - 0.05)
  })

  it('colors code by style: mono keeps keywords to the text tone, vivid outshines muted', () => {
    const scheme: Scheme = { interface: { base: '#ffffff', accent: '#0d6efd' } }
    const mono = deriveTheme(scheme, { code: 'mono' })
    expect(mono['--theme-code-keyword']).toBe(mono['--theme-code-text'])
    const chroma = (code: 'vivid' | 'muted') =>
      oklch(deriveTheme(scheme, { code })['--theme-code-string']).c
    expect(chroma('vivid')).toBeGreaterThan(chroma('muted'))
  })

  it('moves syntax hues off the accent, so code never reads as the brand', () => {
    const green = deriveTheme({ interface: { base: '#ffffff', accent: '#1a7f37' } })
    const hue = (token: ThemeToken) => oklch(green[token]).h
    expect(Math.abs(hue('--theme-code-string') - hue('--theme-code-keyword'))).toBeGreaterThan(25)
  })

  it('writes display-p3 only for colors that look different there', () => {
    const vivid: Scheme = { interface: { base: '#ffffff', accent: 'oklch(0.62 0.27 145)' } }
    const { srgb, p3 } = generateTheme(vivid, { code: 'vivid' })
    expect(Object.keys(p3).length).toBeGreaterThan(0)
    for (const [token, value] of Object.entries(p3) as [ThemeToken, string][]) {
      expect(value).toMatch(/^color\(display-p3 [\d.]+ [\d.]+ [\d.]+( \/ [\d.]+)?\)$/)
      const solid = value.replace(/ \/ [\d.]+\)$/, ')')
      const wide = parseColor(solid)
      const narrow = parseColor(
        srgb[token].startsWith('rgba') ? toHex(wide ?? oklch('#000')) : srgb[token],
      )
      if (!srgb[token].startsWith('rgba')) {
        expect(
          deltaE(wide as NonNullable<typeof wide>, narrow as NonNullable<typeof narrow>),
        ).toBeGreaterThan(JND)
      }
    }
    // Neutrals are inside sRGB, so they have nothing to add.
    expect(p3['--theme-app-bg']).toBeUndefined()
    expect(p3['--theme-app']).toBeUndefined()
    // The accent itself is wider than sRGB, and shows so.
    expect(p3['--theme-accent']).toBeDefined()
  })

  it('writes the display-p3 values in a media query, after the sRGB ones', () => {
    const css = themeStylesheet(':root', {
      interface: { base: '#ffffff', accent: 'oklch(0.62 0.27 145)' },
    })
    expect(css).toMatch(/^:root \{\n {2}--theme-app-bg: #ffffff;/)
    expect(css).toMatch(
      /@media \(color-gamut: p3\) \{\n {2}:root \{\n {4}--theme-accent: color\(display-p3/,
    )
  })

  it('pairs the two modes with light-dark(), keeping a shadow valid', () => {
    const light = { interface: { base: '#ffffff', accent: '#06354f' } }
    const dark = { interface: { base: '#0d1117', accent: '#5b9ccf' } }
    const css = themeStylesheet(':root', { light, dark })
    const value = (token: string) => new RegExp(`\\n {2}${token}: (.*);`).exec(css)?.[1]
    expect(value('--theme-code-text')).toBe(
      `light-dark(${deriveTheme(light)['--theme-code-text']}, ${deriveTheme(dark)['--theme-code-text']})`,
    )
    // light-dark() takes only colors, so each of a shadow's colors is paired, not the whole list.
    expect(value('--theme-shadow-sm')).toMatch(
      /^0 1px 2px light-dark\(rgba\([^)]*\), rgba\([^)]*\)\)$/,
    )
  })

  it('rejects malformed seed colors', () => {
    expect(() => deriveTheme({ interface: { base: '#ffffff', accent: 'blue' } })).toThrow()
  })
})

describe('applyTheme', () => {
  const element = () => {
    const set = new Map<string, string>()
    return {
      set,
      el: {
        style: { setProperty: (k: string, v: string) => set.set(k, v) },
      } as unknown as HTMLElement,
    }
  }

  it('sets every provided variable on the element', () => {
    const { set, el } = element()
    const vars = deriveTheme(schemeFor(DEFAULT_THEME, 'light'))
    applyTheme(el, vars)
    expect(set.size).toBe(THEME_TOKENS.length)
    expect(set.get('--theme-accent')).toBe(vars['--theme-accent'])
  })

  it('sets the display-p3 values over the sRGB ones only on a wide-gamut screen', () => {
    const generated = generateTheme({
      interface: { base: '#ffffff', accent: 'oklch(0.62 0.27 145)' },
    })
    const narrow = element()
    applyTheme(narrow.el, generated, false)
    expect(narrow.set.get('--theme-accent')).toBe(generated.srgb['--theme-accent'])
    const wide = element()
    applyTheme(wide.el, generated, true)
    expect(wide.set.get('--theme-accent')).toBe(generated.p3['--theme-accent'])
  })
})
