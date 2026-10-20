// The generator: a scheme's three choices become every `--theme-*` token.
//
// Surfaces sit at fixed lightness offsets from the base, scaled by contrast.
// Everything read as text, and the focus ring, status graphics and controls'
// edges, is solved: its lightness moves, at its own hue and chroma, until it
// meets a WCAG 2 ratio, and for text an APCA target, on every surface it can
// sit on. The accent the person picked fills buttons exactly. It all happens in OKLCH; each color is mapped
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
import { type CodeStyle, DEFAULT_CONTRAST, type Mode, type Scheme } from './model'

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
  '--theme-border-field',
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
  '--theme-success-text',
  '--theme-success-solid',
  '--theme-success-muted',
  '--theme-error',
  '--theme-error-text',
  '--theme-error-solid',
  '--theme-error-muted',
  '--theme-warning',
  '--theme-warning-text',
  '--theme-warning-solid',
  '--theme-warning-muted',
  '--theme-info',
  '--theme-info-text',
  '--theme-info-solid',
  '--theme-info-muted',
  '--theme-favorite',
  '--theme-favorite-text',
  '--theme-favorite-solid',
  '--theme-favorite-muted',
  // Shadows
  '--theme-shadow-sm',
  '--theme-shadow',
  '--theme-shadow-lg',
  '--theme-shadow-xl',
  // The dimming behind a modal or a drawer, deeper on a dark page, where a light one barely shows.
  '--theme-backdrop',
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
  // Categories: a fill and its text for each hue, such as a fallback avatar's
  '--theme-category-1',
  '--theme-category-1-text',
  '--theme-category-2',
  '--theme-category-2-text',
  '--theme-category-3',
  '--theme-category-3-text',
  '--theme-category-4',
  '--theme-category-4-text',
  '--theme-category-5',
  '--theme-category-5-text',
  '--theme-category-6',
  '--theme-category-6-text',
  '--theme-category-7',
  '--theme-category-7-text',
  '--theme-category-8',
  '--theme-category-8-text',
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

/** The surfaces placeholder and disabled text sit on: field boxes, and the bare inputs of
 *  search bars, menus and dialogs that take their surface's background. */
export const PLACEHOLDER_ON: ThemeToken[] = [
  '--theme-input-bg',
  '--theme-input-disabled-bg',
  '--theme-app-bg',
  '--theme-panel-bg',
  '--theme-muted-panel-bg',
]

/** The surfaces a control's edge sits on: the page, panels, and the control's own fill. */
export const CONTROL_ON: ThemeToken[] = [
  '--theme-app-bg',
  '--theme-panel-bg',
  '--theme-muted-panel-bg',
  '--theme-input-bg',
]

/** The roles' targets at a contrast. WCAG AA is the floor at every contrast. */
function targets(k: number) {
  const at = (wcag: [number, number, number], apca: [number, number, number]): ContrastTarget => ({
    wcag: byContrast(k, wcag),
    apca: byContrast(k, apca),
  })
  return {
    primary: at([4.5, 7, 12], [75, 90, 105]),
    secondary: at([4.5, 4.5, 7], [60, 70, 85]),
    // Placeholder and disabled text: below secondary at every contrast, so a hint never reads
    // as a typed value, yet at the 3:1 of large text and UI so it stays legible. WCAG doesn't
    // hold a placeholder to 4.5:1; APCA's guidance puts such hints near Lc 45.
    placeholder: at([3, 3, 4.5], [45, 50, 65]),
    // A focus indicator, a status icon or dot, and a control's boundary are UI, which WCAG 2
    // holds to 3:1 (1.4.11) at every contrast.
    graphic: { wcag: byContrast(k, [3, 3, 4.5]) },
    // A text field's resting edge. The field is also told by its label, its size and its own
    // fill, so its edge sits between a divider and a control's 3:1 until high contrast, where
    // it reaches 3:1 as well.
    field: { wcag: byContrast(k, [1.3, 1.5, 3]) },
    label: { wcag: 4.5 },
  }
}

const WHITE: Oklch = { l: 1, c: 0, h: 0 }

/** The WCAG contrast a dark mode's hover keeps against the page at contrast 0, 30 and 100. */
const HOVER_STEP: [number, number, number] = [1.45, 1.6, 1.9]

// Fixed hues in OKLCH degrees: status and syntax colors keep their meaning in
// every theme; only their lightness is solved.
const STATUS = { success: 150, error: 27, warning: 70, info: 255, favorite: 5 } as const
const ANSI = { red: 27, green: 145, yellow: 90, blue: 255, magenta: 330, cyan: 200 } as const
const SYNTAX = { string: 145, number: 55, function: 300, type: 195, property: 240 } as const
// Categories tell things apart without ranking them: hues evenly spaced around OKLCH, every fill
// at one lightness and chroma, so no hue reads louder than another.
export const CATEGORY_COUNT = 8
const CATEGORY_START = 20
const CATEGORY_CHROMA = { light: 0.055, dark: 0.06 } as const
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

/** What a foreground sits on: a token, a translucent fill over a token, or a fixed color
 *  such as the white label on a solid status fill. */
type Backdrop = ThemeToken | { fill: ThemeToken; over: ThemeToken } | { fixed: Oklch }

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
    typeof d === 'string'
      ? toHex(paints[d].color)
      : 'fixed' in d
        ? toHex(d.fixed)
        : compositeHex(paints[d.fill], paints[d.over])
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
  // A highlighted row in a menu or list. Near black a fixed lightness step barely registers, so
  // in dark mode the step is solved to a contrast against the page, short of where text could no
  // longer reach its WCAG target on it (at high contrast, APCA's is out of reach on any hover).
  // Light mode keeps its step, which already reads.
  const hoverStep = step(0.045, 0.08)
  const hoverGoal = dark
    ? solve(hoverStep, [toHex(base)], { wcag: byContrast(k, HOVER_STEP) })
    : hoverStep
  const hoverAt = (share: number): Oklch => ({
    ...hoverStep,
    l: hoverStep.l + (hoverGoal.l - hoverStep.l) * share,
  })
  set('--theme-hover', hoverAt(roomFor(hoverAt, { wcag: t.primary.wcag })))
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
  solved('--theme-placeholder', ink, PLACEHOLDER_ON, t.placeholder)
  solved(
    '--theme-link',
    accent,
    ['--theme-app-bg', '--theme-panel-bg', '--theme-muted-panel-bg', '--theme-hover'],
    t.secondary,
  )
  // The accent as a graphic: a focus ring, a checked control's edge, an on switch's track, a
  // slider's fill. An accent that already shows is kept as picked. One too pale for the page is
  // solved past secondary text's contrast rather than to the bare 3:1, so an on switch or a
  // filled slider reads as heavier than the off track, which sits at 3:1.
  const focusOn: ThemeToken[] = ['--theme-app-bg', '--theme-panel-bg', '--theme-input-bg']
  const focus = solved(
    '--theme-focus',
    accent,
    focusOn,
    meets(toHex(accent), focusOn.map(hexOf), t.graphic) ? t.graphic : { wcag: t.secondary.wcag },
  )
  set('--theme-focus-ring', focus, dark ? 0.35 : 0.25)
  // A control's edge: a checkbox's box, a radio's ring, the off track of a switch or a slider.
  // It is all that shows where the control is and whether it is on, so it holds a graphic's
  // 3:1 on every surface a control sits on, and on the input fill inside it. It starts from
  // the decorative border and moves only as far as that needs, while cards, dividers and
  // table lines keep the quieter `--theme-border`.
  solved('--theme-border-strong', border, CONTROL_ON, t.graphic)
  // A text field's edge: inputs, selects, textareas and pickers. A field is a wide box with a
  // label above it and text or a placeholder inside, so it is found without its edge, and a
  // form of them drawn at 3:1 reads as heavy rows of dark boxes. Its edge rests quieter, rises
  // with contrast to 3:1 at the top of the range, and takes the 3:1 edge on hover. The input
  // fill matches the panel in every preset, so the edge is solved on the same surfaces as a
  // control's; a darker fill would read as the disabled one.
  solved('--theme-border-field', border, CONTROL_ON, t.field)

  set('--theme-accent', accent)
  const white = contrastRatio('#ffffff', toHex(accent)) >= 4.5
  set('--theme-accent-hover', { ...accent, l: accent.l + (white ? -0.05 : 0.05) })
  keep(
    '--theme-accent-text',
    { l: white ? 1 : 0, c: 0, h: 0 },
    ['--theme-accent', '--theme-accent-hover'],
    t.label,
  )

  // A status is drawn in a vivid shade and written in a text shade. The vivid shade is a
  // graphic, an icon, dot, border or bar, which WCAG holds to 3:1, so it keeps near its
  // most saturated lightness; held to text's targets it turned muddy. Text in the status is
  // solved like other secondary text. Both also sit on the status's own muted fill, as in a
  // badge or a callout.
  const mutedAlpha = dark ? 0.15 : 0.1
  const statusOn: Backdrop[] = [
    '--theme-app-bg',
    '--theme-panel-bg',
    '--theme-panel-hover',
    '--theme-muted-panel-bg',
    '--theme-hover',
    '--theme-input-bg',
  ]
  for (const [name, hue] of Object.entries(STATUS)) {
    const token = `--theme-${name}` as ThemeToken
    const muted = `--theme-${name}-muted` as ThemeToken
    const on: Backdrop[] = [
      ...statusOn,
      { fill: muted, over: '--theme-app-bg' },
      { fill: muted, over: '--theme-panel-bg' },
    ]
    // The fill follows the vivid shade, so solve until the pair settles.
    let vivid = solve({ l: dark ? 0.7 : 0.66, c: 0.2, h: hue }, statusOn.map(hexOf), t.graphic)
    for (let round = 0; round < 6; round++) {
      set(muted, vivid, mutedAlpha)
      const next = solve(vivid, on.map(hexOf), t.graphic)
      if (next === vivid) {
        break
      }
      vivid = next
    }
    keep(token, vivid, on, t.graphic)
    solved(
      `--theme-${name}-text` as ThemeToken,
      { l: dark ? 0.75 : 0.55, c: 0.17, h: hue },
      on,
      t.secondary,
    )
    // A fill under a white label, such as a destructive button: the vivid shade, deepened
    // only as far as the label needs. Solid buttons keep white labels in both modes.
    solved(`--theme-${name}-solid` as ThemeToken, vivid, [{ fixed: WHITE }], t.label)
  }

  // The sidebar: the same generator on its own base and accent.
  const sidebarBase = scheme.sidebar?.base
    ? oklch(scheme.sidebar.base)
    : neutral(dark ? Math.max(0.08, base.l - 0.035 * s) : base.l - 0.035 * s)
  const sidebarAccent = scheme.sidebar?.accent ? oklch(scheme.sidebar.accent) : accent
  // A white, black or gray accent has no hue to show: the active item is then a shade of the
  // sidebar itself, at its own chroma, rather than a gray patch on a colored sidebar.
  const activeTint =
    sidebarAccent.c < 0.02 ? sidebarBase : { ...sidebarAccent, c: Math.min(sidebarAccent.c, 0.08) }
  const sidebarDark = isDarkColor(toHex(sidebarBase))
  const sidebarDir = sidebarDark ? 1 : -1
  set('--theme-sidebar-bg', sidebarBase)
  set('--theme-sidebar-hover', {
    ...sidebarBase,
    l: sidebarBase.l + sidebarDir * (sidebarDark ? 0.08 : 0.05) * s,
  })
  // The active item's fill steps away from the sidebar, but never so far that text can't reach its target on it.
  // A mid-tone sidebar's text may have no room on a lighter fill, or a deeper one; the fill then
  // steps the other way, so the active item still stands out.
  const activeAt =
    (dir: number) =>
    (f: number): Oklch => ({
      l: sidebarBase.l + dir * (sidebarDark ? 0.12 : 0.07) * s * f,
      c: activeTint.c,
      h: activeTint.h,
    })
  const [active, room] = [activeAt(sidebarDir), activeAt(-sidebarDir)]
    .map((fill) => [fill, roomFor(fill, t.primary)] as const)
    .reduce((a, b) => (b[1] > a[1] ? b : a))
  set('--theme-sidebar-active-bg', active(room))
  solved(
    '--theme-sidebar-text',
    inkFor(sidebarBase, sidebarBase, sidebarDark),
    ['--theme-sidebar-bg', '--theme-sidebar-hover'],
    t.primary,
  )
  solved(
    '--theme-sidebar-active-text',
    { l: sidebarBase.l, c: Math.min(activeTint.c, 0.04), h: activeTint.h },
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

  // Categories: a soft fill a step off the page, and text in the fill's hue solved on it like
  // secondary text, so initials and icons read at every contrast. The fills follow the base's
  // lightness only within a narrow band, which keeps them calm on a mid-gray dark base.
  // Past the default contrast the fills step away from their text, as far as APCA's higher
  // target needs.
  const categoryL =
    (dark ? clamp(base.l + 0.14, 0.36, 0.46) : clamp(base.l - 0.07, 0.86, 0.9)) -
    dir * byContrast(k, [0, 0, 0.03])
  for (let i = 0; i < CATEGORY_COUNT; i++) {
    const h = (CATEGORY_START + (360 / CATEGORY_COUNT) * i) % 360
    const token = `--theme-category-${i + 1}` as ThemeToken
    set(token, { l: categoryL, c: CATEGORY_CHROMA[dark ? 'dark' : 'light'], h })
    solved(
      `--theme-category-${i + 1}-text` as ThemeToken,
      dark ? { l: 0.9, c: 0.05, h } : { l: 0.42, c: 0.08, h },
      [token],
      t.secondary,
    )
  }

  const shade = dark ? 0.35 : 0.07
  const a = (v: number) => Number((v * b).toFixed(3))
  const shadows: Partial<ThemeVariables> = {
    '--theme-shadow-sm': `0 1px 2px rgba(0, 0, 0, ${a(shade)})`,
    '--theme-shadow': `0 4px 6px -1px rgba(0, 0, 0, ${a(shade)}), 0 2px 4px -2px rgba(0, 0, 0, ${a(shade)})`,
    '--theme-shadow-lg': `0 10px 15px -3px rgba(0, 0, 0, ${a(shade)}), 0 4px 6px -4px rgba(0, 0, 0, ${a(shade)})`,
    '--theme-shadow-xl': `0 25px 80px -20px rgba(0, 0, 0, ${a(dark ? 0.6 : 0.2)}), 0 10px 30px -10px rgba(0, 0, 0, ${a(dark ? 0.4 : 0.1)})`,
    '--theme-backdrop': `rgba(0, 0, 0, ${dark ? 0.65 : 0.4})`,
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
    if ('fixed' in d) {
      return shown(d.fixed, 'srgb')
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
        for (const token of typeof d === 'string' ? [d] : 'fixed' in d ? [] : [d.fill, d.over]) {
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

// A color as the generator writes one: hex, rgba() or display-p3.
const COLOR = /#[0-9a-f]{3,8}\b|rgba?\([^)]*\)|color\([^)]*\)/gi

/** One value for both modes: each color that differs becomes `light-dark()`, which follows the
 *  CSS color-scheme. A shadow keeps its geometry and pairs its colors. */
function lightDark(light: string, dark: string): string {
  if (light === dark) {
    return light
  }
  const darks = dark.match(COLOR) ?? []
  if (light.replace(COLOR, '') !== dark.replace(COLOR, '')) {
    throw new Error(`cannot pair ${light} with ${dark}`)
  }
  let i = 0
  return light.replace(COLOR, (color) => {
    const other = darks[i++] as string
    return color === other ? color : `light-dark(${color}, ${other})`
  })
}

/** Splits at the commas outside any parentheses. */
function topLevel(value: string): string[] {
  const parts: string[] = []
  let depth = 0
  let start = 0
  for (let i = 0; i < value.length; i++) {
    const ch = value[i]
    if (ch === '(') {
      depth++
    } else if (ch === ')') {
      depth--
    } else if (ch === ',' && depth === 0) {
      parts.push(value.slice(start, i).trim())
      start = i + 1
    }
  }
  parts.push(value.slice(start).trim())
  return parts
}

/** A declaration laid out as the repository's formatter lays out CSS past 100 columns: a list
 *  takes a line per item, and a single function a line per argument. */
function declaration(token: string, value: string, indent: string): string {
  const line = `${indent}${token}: ${value};`
  if (line.length <= 100) {
    return line
  }
  const inner = `${indent}  `
  const items = topLevel(value)
  if (items.length > 1) {
    return `${indent}${token}:\n${items.map((item) => `${inner}${item}`).join(',\n')};`
  }
  const call = /^([\w-]+)\((.*)\)$/s.exec(value)
  if (!call) {
    return line
  }
  const args = topLevel(call[2] as string)
  return `${indent}${token}: ${call[1]}(\n${args.map((arg) => `${inner}${arg}`).join(',\n')}\n${indent});`
}

/** A stylesheet for a scheme: sRGB under `selector`, and the display-p3 overrides under
 *  `@media (color-gamut: p3)`. Given a scheme for each mode, every token that differs between
 *  them is written as `light-dark()`, so the tokens follow the CSS color-scheme wherever they are
 *  used. `omit` leaves tokens out, such as ones a host supplies. */
export function themeStylesheet(
  selector: string,
  scheme: Scheme | Record<Mode, Scheme>,
  options: DeriveOptions & { omit?: readonly ThemeToken[] } = {},
): string {
  const tokens = THEME_TOKENS.filter((token) => !options.omit?.includes(token))
  let srgb: Partial<ThemeVariables>
  let p3: Partial<ThemeVariables>
  if ('interface' in scheme) {
    ;({ srgb, p3 } = generateTheme(scheme, options))
  } else {
    const light = generateTheme(scheme.light, options)
    const dark = generateTheme(scheme.dark, options)
    srgb = {}
    p3 = {}
    for (const token of tokens) {
      srgb[token] = lightDark(light.srgb[token], dark.srgb[token])
      if (light.p3[token] !== undefined || dark.p3[token] !== undefined) {
        p3[token] = lightDark(
          light.p3[token] ?? light.srgb[token],
          dark.p3[token] ?? dark.srgb[token],
        )
      }
    }
  }
  const block = (vars: Partial<ThemeVariables>, indent: string) =>
    tokens
      .filter((token) => vars[token] !== undefined)
      .map((token) => declaration(token, vars[token] as string, indent))
      .join('\n')
  const wide = block(p3, '    ')
  return `${selector} {\n${block(srgb, '  ')}\n}\n${
    wide ? `\n@media (color-gamut: p3) {\n  ${selector} {\n${wide}\n  }\n}\n` : ''
  }`
}
