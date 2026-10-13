// Fitting a seed to colors a host already has, such as a palette stored before
// themes were seeds. The generator is run backwards: the base and the accent
// are read straight off the background and accent tokens (the generator shows
// both exactly), and what's left, contrast, the sidebar and the code style, is
// searched for the smallest difference from the colors given.
import { composite, deltaE, type Oklch, parseColor, toHex } from './color'
import { contrastRatio, isDarkColor } from './contrast'
import { deriveTheme, type ThemeToken, type ThemeVariables } from './derive'
import {
  CODE_STYLES,
  type CodeStyle,
  DEFAULT_THEME,
  type Mode,
  type Scheme,
  schemeFor,
} from './model'

export interface FitOptions {
  /** How much each token counts toward the fit; 1 by default. */
  weights?: Partial<Record<ThemeToken, number>>
}

export interface FitToken {
  token: ThemeToken
  target: string
  fitted: string
  /** ΔEOK × 100, so 2 is about one just-noticeable difference. */
  deltaE: number
  /** The target failed WCAG AA against its background, so the fitted color is meant to differ. */
  correctedForContrast: boolean
}

export interface FitReport {
  tokens: FitToken[]
  /** Mean and largest ΔEOK × 100 over the tokens not corrected for contrast. */
  mean: number
  max: number
  /** Up to three tokens furthest from their target, worst first. */
  worst: ThemeToken[]
  /** faithful: the main surfaces and colors within 2 and nothing past 5; close: within 5 and 10; changed: past that. */
  verdict: 'faithful' | 'close' | 'changed'
}

export interface FitResult {
  scheme: Scheme
  mode: Mode
  code: CodeStyle
  report: FitReport
}

const MAIN: readonly ThemeToken[] = [
  '--theme-app-bg',
  '--theme-app',
  '--theme-panel-bg',
  '--theme-accent',
  '--theme-link',
  '--theme-border',
  '--theme-sidebar-bg',
]

// Each role's floor, and the token its color is read against.
const FLOORS: Partial<Record<ThemeToken, [ThemeToken, number]>> = {
  '--theme-app': ['--theme-app-bg', 4.5],
  '--theme-muted-text-color': ['--theme-app-bg', 4.5],
  '--theme-link': ['--theme-app-bg', 4.5],
  '--theme-placeholder': ['--theme-input-bg', 3],
  '--theme-focus': ['--theme-app-bg', 3],
  '--theme-accent-text': ['--theme-accent', 4.5],
  '--theme-success': ['--theme-app-bg', 4.5],
  '--theme-error': ['--theme-app-bg', 4.5],
  '--theme-warning': ['--theme-app-bg', 4.5],
  '--theme-info': ['--theme-app-bg', 4.5],
  '--theme-sidebar-text': ['--theme-sidebar-bg', 4.5],
  '--theme-sidebar-active-text': ['--theme-sidebar-active-bg', 4.5],
  '--theme-code-text': ['--theme-code-bg', 4.5],
  '--theme-code-comment': ['--theme-code-bg', 4.5],
}

const isColor = (v: string) =>
  /^#[\da-f]{6}$/i.test(v) || /^rgba\(/.test(v) || parseColor(v) !== null

/** A color as the hex it shows as over a backdrop. */
function shown(value: string, backdrop: string): string {
  if (value.startsWith('rgba(')) {
    return composite(value, backdrop)
  }
  return toHex(parseColor(value) ?? { l: 0, c: 0, h: 0 })
}

type Target = Partial<Record<ThemeToken, string>>

function corrected(target: Target, token: ThemeToken, background: string): boolean {
  const floor = FLOORS[token]
  const value = target[token]
  if (!floor || !value) {
    return false
  }
  const against = target[floor[0]] ? shown(target[floor[0]] as string, background) : null
  return against !== null && contrastRatio(shown(value, background), against) < floor[1]
}

function measure(target: Target, fitted: ThemeVariables, background: string): FitToken[] {
  return (Object.keys(target) as ThemeToken[])
    .filter((token) => isColor(target[token] as string) && fitted[token] !== undefined)
    .map((token) => {
      const want = shown(target[token] as string, background)
      const got = shown(fitted[token], fitted['--theme-app-bg'])
      const a = parseColor(want)
      const b = parseColor(got)
      return {
        token,
        target: target[token] as string,
        fitted: fitted[token],
        deltaE: a && b ? Math.round(deltaE(a, b) * 10000) / 100 : 100,
        correctedForContrast: corrected(target, token, background),
      }
    })
}

function score(tokens: FitToken[], weights: FitOptions['weights']): number {
  let sum = 0
  let total = 0
  for (const t of tokens) {
    if (t.correctedForContrast) continue
    const w = weights?.[t.token] ?? 1
    sum += t.deltaE * w
    total += w
  }
  return total ? sum / total : 0
}

/** The scheme whose derived tokens come closest to `target`, a partial map of tokens a host has colors for, with how close each came. */
export function fitSeed(target: Target, options: FitOptions = {}): FitResult {
  const fallback = schemeFor(DEFAULT_THEME, 'light').interface
  const given = parseColor(target['--theme-app-bg'] ?? '')
  const background = given ? toHex(given) : fallback.base
  const mode: Mode = isDarkColor(background) ? 'dark' : 'light'
  const accentSource = target['--theme-accent'] ?? target['--theme-link']
  const accent = accentSource ? shown(accentSource, background) : fallback.accent
  const sidebarBg = target['--theme-sidebar-bg']
  const activeBg = target['--theme-sidebar-active-bg']

  const evaluate = (scheme: Scheme, code: CodeStyle) => {
    const fitted = deriveTheme(scheme, { code })
    return { tokens: measure(target, fitted, background), fitted }
  }
  const cost = (scheme: Scheme, code: CodeStyle) =>
    score(evaluate(scheme, code).tokens, options.weights)
  const withContrast = (scheme: Scheme, contrast: number): Scheme => ({
    ...scheme,
    interface: { ...scheme.interface, contrast: Math.round(contrast * 10) / 10 },
  })

  let scheme: Scheme = { interface: { base: background, accent } }
  let code: CodeStyle = 'balanced'

  // Sidebar: keep its own base only when the generated one is noticeably different.
  if (sidebarBg) {
    const own = shown(sidebarBg, background)
    const generated = deriveTheme(scheme)['--theme-sidebar-bg']
    const a = parseColor(own)
    const b = parseColor(generated)
    if (a && b && deltaE(a, b) > 0.02) {
      scheme = { ...scheme, sidebar: { base: own } }
    }
  }

  const findContrast = (s: Scheme) => {
    let best = 30
    let bestCost = Number.POSITIVE_INFINITY
    for (let k = 0; k <= 100; k += 5) {
      const c = cost(withContrast(s, k), code)
      if (c < bestCost) {
        best = k
        bestCost = c
      }
    }
    // Golden-section search around the best grid point.
    let lo = Math.max(0, best - 5)
    let hi = Math.min(100, best + 5)
    const phi = (Math.sqrt(5) - 1) / 2
    let x1 = hi - phi * (hi - lo)
    let x2 = lo + phi * (hi - lo)
    let f1 = cost(withContrast(s, x1), code)
    let f2 = cost(withContrast(s, x2), code)
    while (hi - lo > 0.2) {
      if (f1 <= f2) {
        hi = x2
        x2 = x1
        f2 = f1
        x1 = hi - phi * (hi - lo)
        f1 = cost(withContrast(s, x1), code)
      } else {
        lo = x1
        x1 = x2
        f1 = f2
        x2 = lo + phi * (hi - lo)
        f2 = cost(withContrast(s, x2), code)
      }
    }
    const candidates = [best, (lo + hi) / 2]
    return candidates.reduce((a, c) =>
      cost(withContrast(s, c), code) < cost(withContrast(s, a), code) ? c : a,
    )
  }

  scheme = withContrast(scheme, findContrast(scheme))

  // A sidebar's active item shows its accent's hue; try the page's accent at that hue.
  const active = activeBg ? parseColor(shown(activeBg, background)) : null
  if (active && active.c > 0.02) {
    const page = parseColor(accent) as Oklch
    const sidebarAccent = toHex({ ...page, h: active.h, c: Math.max(page.c, active.c) })
    const candidate: Scheme = { ...scheme, sidebar: { ...scheme.sidebar, accent: sidebarAccent } }
    if (cost(candidate, code) < cost(scheme, code)) {
      scheme = candidate
    }
  }

  if ((Object.keys(target) as ThemeToken[]).some((t) => t.startsWith('--theme-code-'))) {
    code = CODE_STYLES.reduce((a, c) => (cost(scheme, c) < cost(scheme, a) ? c : a))
  }

  const tokens = evaluate(scheme, code).tokens
  const counted = tokens.filter((t) => !t.correctedForContrast)
  const max = counted.reduce((m, t) => Math.max(m, t.deltaE), 0)
  const mainMax = counted
    .filter((t) => MAIN.includes(t.token))
    .reduce((m, t) => Math.max(m, t.deltaE), 0)
  const mean = counted.length ? counted.reduce((s, t) => s + t.deltaE, 0) / counted.length : 0
  const verdict =
    mainMax <= 2 && max <= 5 ? 'faithful' : mainMax <= 5 && max <= 10 ? 'close' : 'changed'
  return {
    scheme,
    mode,
    code,
    report: {
      tokens,
      mean: Math.round(mean * 100) / 100,
      max,
      worst: [...counted]
        .sort((a, b) => b.deltaE - a.deltaE)
        .slice(0, 3)
        .filter((t) => t.deltaE > 0)
        .map((t) => t.token),
      verdict,
    },
  }
}
