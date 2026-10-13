// The generator: a scheme's three choices become every `--theme-*` token.
//
// Surfaces sit at fixed lightness offsets from the base, scaled by contrast.
// Everything read as text, and the focus ring and strong borders, is solved:
// its lightness moves, at its own hue and chroma, until it meets a WCAG 2 ratio
// and an APCA target on every surface it can sit on. The accent the person
// picked fills buttons exactly. It all happens in OKLCH; each color is mapped
// into sRGB, and into display-p3 where that shows more of it, only at the end,
// and the contrast it was solved for is checked again in display-p3.
import {
  deltaE,
  type Gamut,
  JND,
  mixOklab,
  type Oklch,
  oklch,
  rendered,
  toHex,
  toP3,
  withAlpha,
} from './color'
import {
  type ContrastTarget,
  contrastRatio,
  isDarkColor,
  meets,
  meetsIn,
  over,
  type Shown,
  shown,
  solve,
} from './contrast'
import { type CodeStyle, DEFAULT_CONTRAST, type Scheme } from './model'

export const THEME_TOKENS = [
  // Surfaces
  '--theme-app-bg',
  '--theme-panel-bg',
  '--theme-panel-hover',
  '--theme-muted-panel-bg',
  '--theme-hover',
  '--theme-input-bg',
  '--theme-input-disabled-bg',
  // Text
  '--theme-app',
  '--theme-muted-text-color',
  '--theme-placeholder',
  '--theme-link',
  // Lines
  '--theme-border',
  '--theme-border-strong',
  // Accent
  '--theme-accent',
  '--theme-accent-text',
  '--theme-accent-hover',
  '--theme-accent-subtle',
  '--theme-focus',
  '--theme-focus-ring',
  // Status
  '--theme-success',
  '--theme-success-muted',
  '--theme-error',
  '--theme-error-muted',
  '--theme-warning',
  '--theme-warning-muted',
  '--theme-info',
  '--theme-info-muted',
  '--theme-favorite',
  '--theme-favorite-muted',
  // Shadows
  '--theme-shadow-sm',
  '--theme-shadow',
  '--theme-shadow-lg',
  '--theme-shadow-xl',
  // Sidebar
  '--theme-sidebar-bg',
  '--theme-sidebar-text',
  '--theme-sidebar-hover',
  '--theme-sidebar-active-bg',
  '--theme-sidebar-active-text',
  // Code
  '--theme-code-bg',
  '--theme-code-text',
  '--theme-code-comment',
  '--theme-code-keyword',
  '--theme-code-string',
  '--theme-code-number',
  '--theme-code-function',
  '--theme-code-type',
  '--theme-code-property',
  '--theme-ansi-black',
  '--theme-ansi-red',
  '--theme-ansi-green',
  '--theme-ansi-yellow',
  '--theme-ansi-blue',
  '--theme-ansi-magenta',
  '--theme-ansi-cyan',
  '--theme-ansi-white',
] as const

export type ThemeToken = (typeof THEME_TOKENS)[number]

export type ThemeVariables = Record<ThemeToken, string>

/** The tokens the sidebar owns. A host's chrome may supply its own fallbacks, so the stylesheet gives them no defaults. */
export const SIDEBAR_TOKENS: readonly ThemeToken[] = THEME_TOKENS.filter((t) =>
  t.startsWith('--theme-sidebar-'),
)

/** A theme as both outputs: every token in sRGB, and the tokens a display-p3 screen shows noticeably more of. */
export interface GeneratedTheme {
  srgb: ThemeVariables
  /** `color(display-p3 …)` for the tokens whose display-p3 mapping is more than one just-noticeable difference from their sRGB one. */
  p3: Partial<ThemeVariables>
}

export interface DeriveOptions {
  /** How the code theme colors syntax. */
  code?: CodeStyle
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

/** Between the values at contrast 0, 30 (the default) and 100. */
/**
 * The color text starts from on a surface, before its lightness is solved. Dark text on a tinted light
 * surface carries several times the surface's own chroma, as hand-made slate and gray scales do; light
 * text on a dark surface carries less than the surface, or it reads as colored. The surface's chroma is
 * added in OKLab to its tint, so the surface's hue leads and the accent only leans it, and a white
 * surface keeps neutral text whatever the accent.
 */
function inkFor(surface: Oklch, tint: Oklch, dark: boolean): Oklch {
  const rad = Math.PI / 180
  if (dark) {
    return { ...tint, c: Math.min(tint.c, 0.03) }
  }
  const extra = Math.min(0.035, surface.c * 7)
  const a = tint.c * Math.cos(tint.h * rad) + extra * Math.cos(surface.h * rad)
  const b = tint.c * Math.sin(tint.h * rad) + extra * Math.sin(surface.h * rad)
  return { l: surface.l, c: Math.hypot(a, b), h: (Math.atan2(b, a) / rad + 360) % 360 }
}

function byContrast(k: number, [at0, at30, at100]: [number, number, number]): number {
  return k <= 30 ? at0 + ((at30 - at0) * k) / 30 : at30 + ((at100 - at30) * (k - 30)) / 70
}

/** The roles' targets at a contrast. WCAG AA is the floor at every contrast. */
function targets(k: number) {
  const at = (wcag: [number, number, number], apca: [number, number, number]): ContrastTarget => ({
    wcag: byContrast(k, wcag),
    apca: byContrast(k, apca),
  })
  return {
    primary: at([4.5, 7, 12], [75, 90, 105]),
    secondary: at([4.5, 4.5, 7], [60, 70, 85]),
    placeholder: at([3, 3, 4.5], [45, 50, 65]),
    // A focus indicator and a control's boundary are UI, which WCAG 2 holds to 3:1.
    focus: { wcag: byContrast(k, [3, 3, 4.5]) },
    control: { wcag: byContrast(k, [1.6, 2.2, 3]) },
    onAccent: { wcag: 4.5 },
  }
}

// Fixed hues in OKLCH degrees: status and syntax colors keep their meaning in
// every theme; only their lightness is solved.
const STATUS = { success: 150, error: 27, warning: 70, info: 255, favorite: 5 } as const
const ANSI = { red: 27, green: 145, yellow: 90, blue: 255, magenta: 330, cyan: 200 } as const
const SYNTAX = { string: 145, number: 55, function: 300, type: 195, property: 240 } as const
const CODE_CHROMA: Record<CodeStyle, number> = { balanced: 0.13, vivid: 0.19, muted: 0.07, mono: 0 }

/** The largest share, 0–1, of a fill's step from its surface that still lets the readable
 *  pole, black or white, meet a target on it. */
function roomFor(fill: (share: number) => Oklch, target: ContrastTarget): number {
  const fits = (share: number) => {
    const bg = toHex(fill(share))
    return meets(isDarkColor(bg) ? '#ffffff' : '#000000', [bg], target)
  }
  if (fits(1)) {
    return 1
  }
  let lo = 0
  let hi = 1
  while (hi - lo > 0.01) {
    const mid = (lo + hi) / 2
    if (fits(mid)) {
      lo = mid
    } else {
      hi = mid
    }
  }
  return lo
}

/** A fixed hue moved off the accent's, so syntax never reads as the brand. */
function awayFrom(hue: number, accentHue: number): number {
  const d = ((hue - accentHue + 540) % 360) - 180
  return Math.abs(d) < 30 ? (hue + (d < 0 ? -45 : 45) + 360) % 360 : hue
}

/** A color token: an OKLCH color, at an alpha when it's a translucent fill. */
interface Paint {
  color: Oklch
  alpha?: number
}

/** What a foreground sits on: a token, or a translucent fill over a token. */
type Backdrop = ThemeToken | { fill: ThemeToken; over: ThemeToken }

/** A contrast a foreground was solved for, kept to check the display-p3 output against. */
interface Check {
  fg: ThemeToken
  on: Backdrop[]
  target: ContrastTarget
}

/** Every token as sRGB, plus display-p3 overrides that keep every contrast the sRGB output meets. */
export function generateTheme(scheme: Scheme, options: DeriveOptions = {}): GeneratedTheme {
  const { srgb, paints, checks } = build(scheme, options)
  return { srgb, p3: p3Overrides(paints, checks) }
}

function build(
  scheme: Scheme,
  options: DeriveOptions,
): { srgb: ThemeVariables; paints: Record<ThemeToken, Paint>; checks: Check[] } {
  const base = oklch(scheme.interface.base)
  const accent = oklch(scheme.interface.accent)
  const k = clamp(scheme.interface.contrast ?? DEFAULT_CONTRAST, 0, 100)
  // Surfaces separate more with contrast, slowly past the default; lines and shadows faster.
  const s = 0.6 + (0.4 * (Math.min(k, 30) + Math.max(k - 30, 0) * 0.25)) / 30
  const b = byContrast(k, [0.6, 1, 1.8])
  const dark = isDarkColor(toHex(base))
  const dir = dark ? 1 : -1
  const t = targets(k)

  const paints = {} as Record<ThemeToken, Paint>
  const checks: Check[] = []
  const hexOf = (d: Backdrop) =>
    typeof d === 'string' ? toHex(paints[d].color) : compositeHex(paints[d.fill], paints[d.over])
  const set = (token: ThemeToken, color: Oklch, alpha?: number) => {
    paints[token] = alpha === undefined ? { color } : { color, alpha }
    return color
  }
  /** A color that must keep a contrast on its backdrops, in both outputs. */
  const keep = (token: ThemeToken, color: Oklch, on: Backdrop[], target: ContrastTarget) => {
    checks.push({ fg: token, on, target })
    return set(token, color)
  }
  /** A foreground solved on its backdrops. */
  const solved = (token: ThemeToken, start: Oklch, on: Backdrop[], target: ContrastTarget) =>
    keep(token, solve(start, on.map(hexOf), target), on, target)

  // Neutrals lean toward the accent, more so when the base is already tinted.
  const tint = mixOklab(base, accent, Math.min(0.5, (dark ? 0.05 : 0.04) * (1 + base.c / 0.03)))
  // Dark surfaces gain a little chroma as they rise, so they don't wash out.
  const neutral = (l: number, lift = 0): Oklch => ({
    l: clamp(l, 0, 1),
    c: tint.c + (dark ? 0.004 * lift : 0),
    h: tint.h,
  })
  const ink = inkFor(base, tint, dark)
  // A near-white neutral base has no room above it: panels stay white, and shadow and border carry elevation.
  const paper = base.l > 0.97 && base.c < 0.02
  const raised = (towardWhite: number, darkStep: number): Oklch =>
    dark
      ? neutral(base.l + darkStep * s, 1)
      : paper
        ? { l: 1, c: 0, h: 0 }
        : { ...neutral(base.l + (1 - base.l) * towardWhite), c: tint.c * 0.5 }
  const step = (light: number, darkStep: number) =>
    neutral(base.l + dir * (dark ? darkStep : light) * s, 1)

  set('--theme-app-bg', base)
  const panel = set('--theme-panel-bg', raised(0.85, 0.035))
  set('--theme-panel-hover', neutral(panel.l + dir * (dark ? 0.04 : 0.025) * s, 1))
  const mutedPanel = set('--theme-muted-panel-bg', step(0.03, 0.065))
  set('--theme-hover', step(0.045, 0.08))
  set('--theme-input-bg', raised(0.7, 0.05))
  set('--theme-input-disabled-bg', step(0.02, 0.025))
  set('--theme-accent-subtle', {
    l: base.l + dir * (dark ? 0.07 : 0.04) * s,
    c: Math.min(accent.c, dark ? 0.045 : 0.035),
    h: accent.h,
  })
  const border = set('--theme-border', neutral(base.l + dir * (dark ? 0.14 : 0.12) * b))

  // Text meets its target on every surface it sits on.
  const textOn: ThemeToken[] = [
    '--theme-app-bg',
    '--theme-panel-bg',
    '--theme-panel-hover',
    '--theme-muted-panel-bg',
    '--theme-hover',
    '--theme-input-bg',
    '--theme-accent-subtle',
  ]
  solved('--theme-app', ink, textOn, t.primary)
  solved('--theme-muted-text-color', ink, textOn, t.secondary)
  solved(
    '--theme-placeholder',
    ink,
    ['--theme-input-bg', '--theme-input-disabled-bg', '--theme-app-bg', '--theme-panel-bg'],
    t.placeholder,
  )
  solved(
    '--theme-link',
    accent,
    ['--theme-app-bg', '--theme-panel-bg', '--theme-muted-panel-bg', '--theme-hover'],
    t.secondary,
  )
  const focus = solved(
    '--theme-focus',
    accent,
    ['--theme-app-bg', '--theme-panel-bg', '--theme-input-bg'],
    t.focus,
  )
  set('--theme-focus-ring', focus, dark ? 0.35 : 0.25)
  solved(
    '--theme-border-strong',
    border,
    ['--theme-app-bg', '--theme-panel-bg', '--theme-input-bg'],
    t.control,
  )

  set('--theme-accent', accent)
  const white = contrastRatio('#ffffff', toHex(accent)) >= 4.5
  set('--theme-accent-hover', { ...accent, l: accent.l + (white ? -0.05 : 0.05) })
  keep(
    '--theme-accent-text',
    { l: white ? 1 : 0, c: 0, h: 0 },
    ['--theme-accent', '--theme-accent-hover'],
    t.onAccent,
  )

  const mutedAlpha = dark ? 0.15 : 0.1
  for (const [name, hue] of Object.entries(STATUS)) {
    const token = `--theme-${name}` as ThemeToken
    const muted = `--theme-${name}-muted` as ThemeToken
    const plain: ThemeToken[] = ['--theme-app-bg', '--theme-panel-bg', '--theme-muted-panel-bg']
    const on: Backdrop[] = [
      ...plain,
      { fill: muted, over: '--theme-app-bg' },
      { fill: muted, over: '--theme-panel-bg' },
    ]
    // Also readable on its own muted fill, as in a callout. The fill follows the
    // color, so solve until the pair settles.
    let color = solve({ l: dark ? 0.75 : 0.55, c: 0.17, h: hue }, plain.map(hexOf), t.secondary)
    for (let round = 0; round < 6; round++) {
      set(muted, color, mutedAlpha)
      const next = solve(color, on.map(hexOf), t.secondary)
      if (next === color) {
        break
      }
      color = next
    }
    keep(token, color, on, t.secondary)
  }

  // The sidebar: the same generator on its own base and accent.
  const sidebarBase = scheme.sidebar?.base
    ? oklch(scheme.sidebar.base)
    : neutral(dark ? Math.max(0.08, base.l - 0.035 * s) : base.l - 0.035 * s)
  const sidebarAccent = scheme.sidebar?.accent ? oklch(scheme.sidebar.accent) : accent
  const sidebarDark = isDarkColor(toHex(sidebarBase))
  const sidebarDir = sidebarDark ? 1 : -1
  set('--theme-sidebar-bg', sidebarBase)
  set('--theme-sidebar-hover', {
    ...sidebarBase,
    l: sidebarBase.l + sidebarDir * (sidebarDark ? 0.08 : 0.05) * s,
  })
  // The active item's fill steps away from the sidebar, but never so far that text can't reach its target on it.
  const activeAt = (f: number): Oklch => ({
    l: sidebarBase.l + sidebarDir * (sidebarDark ? 0.12 : 0.07) * s * f,
    c: Math.min(sidebarAccent.c, 0.08),
    h: sidebarAccent.h,
  })
  set('--theme-sidebar-active-bg', activeAt(roomFor(activeAt, t.primary)))
  solved(
    '--theme-sidebar-text',
    inkFor(sidebarBase, sidebarBase, sidebarDark),
    ['--theme-sidebar-bg', '--theme-sidebar-hover'],
    t.primary,
  )
  solved(
    '--theme-sidebar-active-text',
    { l: sidebarBase.l, c: Math.min(sidebarAccent.c, 0.04), h: sidebarAccent.h },
    ['--theme-sidebar-active-bg'],
    t.primary,
  )

  // Code sits on the muted panel; syntax hues are fixed and their lightness solved like text.
  const style = options.code ?? 'balanced'
  set('--theme-code-bg', mutedPanel)
  const codeOn: ThemeToken[] = ['--theme-code-bg', '--theme-panel-bg', '--theme-app-bg']
  const codeText = solved('--theme-code-text', ink, codeOn, t.primary)
  const comment = solved('--theme-code-comment', ink, codeOn, t.secondary)
  const syntaxL = dark ? 0.78 : 0.5
  const chroma = CODE_CHROMA[style]
  const syntax = (token: ThemeToken, hue: number) =>
    solved(token, { l: syntaxL, c: chroma, h: awayFrom(hue, accent.h) }, codeOn, t.secondary)
  if (style === 'mono') {
    keep('--theme-code-keyword', codeText, codeOn, t.primary)
    keep('--theme-code-property', comment, codeOn, t.secondary)
  } else {
    solved(
      '--theme-code-keyword',
      { l: syntaxL, c: Math.min(accent.c, chroma + 0.04), h: accent.h },
      codeOn,
      t.secondary,
    )
    syntax('--theme-code-property', SYNTAX.property)
  }
  syntax('--theme-code-string', SYNTAX.string)
  syntax('--theme-code-number', SYNTAX.number)
  syntax('--theme-code-function', SYNTAX.function)
  syntax('--theme-code-type', SYNTAX.type)
  for (const [name, hue] of Object.entries(ANSI)) {
    solved(
      `--theme-ansi-${name}` as ThemeToken,
      { l: syntaxL, c: 0.15, h: hue },
      codeOn,
      t.secondary,
    )
  }
  keep('--theme-ansi-black', dark ? comment : codeText, codeOn, t.secondary)
  keep('--theme-ansi-white', dark ? codeText : comment, codeOn, t.secondary)

  const shade = dark ? 0.35 : 0.07
  const a = (v: number) => Number((v * b).toFixed(3))
  const shadows: Partial<ThemeVariables> = {
    '--theme-shadow-sm': `0 1px 2px rgba(0, 0, 0, ${a(shade)})`,
    '--theme-shadow': `0 4px 6px -1px rgba(0, 0, 0, ${a(shade)}), 0 2px 4px -2px rgba(0, 0, 0, ${a(shade)})`,
    '--theme-shadow-lg': `0 10px 15px -3px rgba(0, 0, 0, ${a(shade)}), 0 4px 6px -4px rgba(0, 0, 0, ${a(shade)})`,
    '--theme-shadow-xl': `0 25px 80px -20px rgba(0, 0, 0, ${a(dark ? 0.6 : 0.2)}), 0 10px 30px -10px rgba(0, 0, 0, ${a(dark ? 0.4 : 0.1)})`,
  }

  const srgb = {} as ThemeVariables
  for (const token of THEME_TOKENS) {
    const paint = paints[token]
    srgb[token] = paint
      ? paint.alpha === undefined
        ? toHex(paint.color)
        : withAlpha(toHex(paint.color), paint.alpha)
      : (shadows[token] as string)
  }
  return { srgb, paints, checks }
}

// Translucent fills drawn from a color: where the color shows in sRGB, so does its fill.
const FILLS: [ThemeToken, ThemeToken][] = [
  ['--theme-focus-ring', '--theme-focus'],
  ['--theme-success-muted', '--theme-success'],
  ['--theme-error-muted', '--theme-error'],
  ['--theme-warning-muted', '--theme-warning'],
  ['--theme-info-muted', '--theme-info'],
  ['--theme-favorite-muted', '--theme-favorite'],
]

/** The tokens a display-p3 screen shows noticeably more of, keeping only those
 *  whose contrast checks still hold when the screen shows them. */
function p3Overrides(paints: Record<ThemeToken, Paint>, checks: Check[]): Partial<ThemeVariables> {
  const wide = new Set(
    (Object.keys(paints) as ThemeToken[]).filter(
      (token) => deltaE(rendered(paints[token].color, 'p3'), rendered(paints[token].color)) > JND,
    ),
  )
  const gamutOf = (token: ThemeToken): Gamut => (wide.has(token) ? 'p3' : 'srgb')
  const show = (token: ThemeToken): Shown => shown(paints[token].color, gamutOf(token))
  const backdrop = (d: Backdrop): Shown => {
    if (typeof d === 'string') {
      return show(d)
    }
    const fill = paints[d.fill]
    return over(show(d.fill), fill.alpha ?? 1, rendered(paints[d.over].color, gamutOf(d.over)))
  }
  const passes = (check: Check) => meetsIn(show(check.fg), check.on.map(backdrop), check.target)
  // Drop the foreground's override first, then its backdrops', until every check holds.
  for (let round = 0; round < 4; round++) {
    let changed = false
    for (const check of checks) {
      if (passes(check)) {
        continue
      }
      if (wide.delete(check.fg)) {
        changed = true
        if (passes(check)) {
          continue
        }
      }
      for (const d of check.on) {
        for (const token of typeof d === 'string' ? [d] : [d.fill, d.over]) {
          changed = wide.delete(token) || changed
        }
      }
    }
    if (!changed) {
      break
    }
  }
  for (const [fill, color] of FILLS) {
    if (!wide.has(color)) {
      wide.delete(fill)
    }
  }
  const out: Partial<ThemeVariables> = {}
  for (const token of THEME_TOKENS) {
    if (wide.has(token)) {
      out[token] = toP3(paints[token].color, paints[token].alpha)
    }
  }
  return out
}

function compositeHex(fill: Paint, backdrop: Paint): string {
  const f = toHex(fill.color)
  const u = toHex(backdrop.color)
  const a = fill.alpha ?? 1
  const channel = (hex: string, i: number) => Number.parseInt(hex.slice(i, i + 2), 16)
  return `#${[1, 3, 5]
    .map((i) =>
      Math.round(channel(f, i) * a + channel(u, i) * (1 - a))
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`
}

/** Every `--theme-*` token for a scheme, in sRGB. */
export function deriveTheme(scheme: Scheme, options: DeriveOptions = {}): ThemeVariables {
  return build(scheme, options).srgb
}

/** A stylesheet for a scheme: sRGB under `selector`, and the display-p3 overrides under
 *  `@media (color-gamut: p3)`. `omit` leaves tokens out, such as ones a host supplies. */
export function themeStylesheet(
  selector: string,
  scheme: Scheme,
  options: DeriveOptions & { omit?: readonly ThemeToken[] } = {},
): string {
  const { srgb, p3 } = generateTheme(scheme, options)
  const block = (vars: Partial<ThemeVariables>, indent: string) =>
    THEME_TOKENS.filter((token) => !options.omit?.includes(token) && vars[token] !== undefined)
      .map((token) => `${indent}${token}: ${vars[token]};`)
      .join('\n')
  const wide = block(p3, '    ')
  return `${selector} {\n${block(srgb, '  ')}\n}\n${
    wide ? `\n@media (color-gamut: p3) {\n  ${selector} {\n${wide}\n  }\n}\n` : ''
  }`
}
