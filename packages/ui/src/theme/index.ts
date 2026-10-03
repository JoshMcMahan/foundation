/* The unified theme contract: every color a component may use is one of the
 * `--theme-*` tokens below, and every token is computable from a tiny seed
 * (accent + background + contrast, per surface). Presets are named seeds;
 * a custom theme is the same seed exposed directly. Components consume only
 * tokens — never a light/dark flag. */

export const THEME_TOKENS = [
  // Interface surface
  '--theme-app-bg',
  '--theme-app',
  '--theme-panel-bg',
  '--theme-panel',
  '--theme-muted-panel-bg',
  '--theme-muted-panel-color',
  '--theme-muted-text-color',
  '--theme-border',
  '--theme-element',
  '--theme-element-text',
  '--theme-element-hover',
  '--theme-hover',
  '--theme-hover-text',
  '--theme-link',
  '--theme-input-bg',
  '--theme-input',
  '--theme-input-disabled-bg',
  '--theme-input-disabled-text',
  // Cards and elevated surfaces
  '--theme-card-bg',
  '--theme-card-border',
  '--theme-card-hover',
  // Accent
  '--theme-accent',
  '--theme-accent-text',
  '--theme-focus-ring',
  '--theme-hover-overlay',
  // Status hues
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
  '--theme-auth-shadow',
  // Sidebar surface
  '--theme-bg',
  '--theme-sidebar-text',
  '--theme-sidebar-hover',
  '--theme-sidebar-hover-text',
  '--theme-sidebar-active-bg',
  '--theme-sidebar-active-text',
] as const

export type ThemeToken = (typeof THEME_TOKENS)[number]

export type ThemeVariables = Record<ThemeToken, string>

export interface ThemeSeed {
  /** Accent color as a hex string, e.g. '#06354f'. */
  accent: string
  /** Base background color as a hex string. */
  background: string
  /** How far foregrounds and borders sit from the background. 1 is normal; sensible range is roughly 0.5–1.5. */
  contrast?: number
}

export interface SurfaceSeeds {
  interface: ThemeSeed
  sidebar?: ThemeSeed
}

type Rgb = [number, number, number]

function parseHex(hex: string): Rgb {
  const [, r, g, b] = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex) ?? []
  if (r === undefined || g === undefined || b === undefined) {
    throw new Error(`Invalid hex color: ${hex}`)
  }
  return [Number.parseInt(r, 16), Number.parseInt(g, 16), Number.parseInt(b, 16)]
}

function toHex([r, g, b]: Rgb): string {
  const c = (v: number) =>
    Math.max(0, Math.min(255, Math.round(v)))
      .toString(16)
      .padStart(2, '0')
  return `#${c(r)}${c(g)}${c(b)}`
}

/** Linear interpolation from `a` toward `b` by `t` in sRGB. */
function mix(a: string, b: string, t: number): string {
  const ca = parseHex(a)
  const cb = parseHex(b)
  return toHex([
    ca[0] + (cb[0] - ca[0]) * t,
    ca[1] + (cb[1] - ca[1]) * t,
    ca[2] + (cb[2] - ca[2]) * t,
  ])
}

function alpha(hex: string, a: number): string {
  const [r, g, b] = parseHex(hex)
  return `rgba(${r}, ${g}, ${b}, ${a})`
}

function relativeLuminance(hex: string): number {
  const toLinear = (v: number) => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  const [r, g, b] = parseHex(hex)
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b)
}

export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a)
  const lb = relativeLuminance(b)
  const [hi, lo] = la > lb ? [la, lb] : [lb, la]
  return (hi + 0.05) / (lo + 0.05)
}

/** Uses the WCAG luminance threshold 0.179, matching how org themes classify backgrounds. */
export function isDarkColor(hex: string): boolean {
  return relativeLuminance(hex) < 0.179
}

/** White or black, whichever reads better on the given color. */
function readableOn(hex: string): string {
  return contrastRatio(hex, '#ffffff') >= contrastRatio(hex, '#000000') ? '#ffffff' : '#000000'
}

/** Nudges `color` toward the readable pole of `bg` until it clears `ratio`. */
function ensureReadable(color: string, bg: string, ratio: number): string {
  const pole = isDarkColor(bg) ? '#ffffff' : '#000000'
  let out = color
  for (let t = 0; t <= 1 && contrastRatio(out, bg) < ratio; t += 0.05) {
    out = mix(color, pole, t)
  }
  return out
}

function clampContrast(contrast: number | undefined): number {
  const c = contrast ?? 1
  return Math.max(0.25, Math.min(2, c))
}

const STATUS_HUES = {
  success: { onLight: '#16a34a', onDark: '#22c55e' },
  error: { onLight: '#dc2626', onDark: '#ef4444' },
  warning: { onLight: '#d97706', onDark: '#f59e0b' },
  info: { onLight: '#2563eb', onDark: '#3b82f6' },
  favorite: { onLight: '#e11d48', onDark: '#f43f5e' },
} as const

interface SidebarVariables {
  bg: string
  text: string
  hover: string
  hoverText: string
  activeBg: string
  activeText: string
}

function deriveSidebar(seed: ThemeSeed): SidebarVariables {
  const bg = seed.background
  const c = clampContrast(seed.contrast)
  const dark = isDarkColor(bg)
  const pole = dark ? '#ffffff' : '#000000'
  const text = mix(pole, bg, Math.max(0, 1 - c) * 0.5)
  const hover = mix(bg, pole, 0.12 * c)
  const activeBg = dark ? mix(seed.accent, '#ffffff', 0.85) : seed.accent
  return {
    bg,
    text,
    hover,
    hoverText: text,
    activeBg,
    activeText: readableOn(activeBg),
  }
}

function authShadow(dark: boolean): string {
  const [far, near] = dark ? [0.6, 0.4] : [0.2, 0.1]
  return `0 25px 80px -20px rgba(0, 0, 0, ${far}), 0 10px 30px -10px rgba(0, 0, 0, ${near})`
}

export function deriveTheme(seed: ThemeSeed | SurfaceSeeds): ThemeVariables {
  const surfaces: SurfaceSeeds = 'interface' in seed ? seed : { interface: seed }
  const { accent, background: bg } = surfaces.interface
  const c = clampContrast(surfaces.interface.contrast)
  const dark = isDarkColor(bg)
  const pole = dark ? '#ffffff' : '#000000'

  const fg = mix(pole, bg, Math.max(0, 1 - c) * 0.5)
  // Panels sit above the app background: lifted toward white on light
  // themes, toward the light pole on dark ones.
  const panelBg = dark ? mix(bg, '#ffffff', 0.045) : mix(bg, '#ffffff', 0.8)
  const mutedPanelBg = dark ? mix(bg, '#ffffff', 0.09) : mix(bg, '#ffffff', 0.5)
  const border = mix(bg, pole, (dark ? 0.16 : 0.16) * c)
  const mutedText = mix(fg, bg, 0.42)
  const hover = dark ? mix(bg, '#ffffff', 0.08) : mix(bg, '#000000', 0.04)
  const inputBg = dark ? mix(bg, '#ffffff', 0.08) : mix(bg, '#ffffff', 0.65)
  const link = ensureReadable(accent, bg, 4.5)
  const accentText = readableOn(accent)
  const accentHover = mix(accent, pole, 0.1)
  const cardBg = panelBg
  // Without its own seed the sidebar follows the interface: dark themes keep
  // it on the panel color, light themes anchor it on a dark form of the accent.
  let sidebarBg = panelBg
  if (!dark) {
    sidebarBg = isDarkColor(accent) ? accent : mix(accent, '#000000', 0.4)
  }
  const sidebar = deriveSidebar(surfaces.sidebar ?? { accent, background: sidebarBg, contrast: c })

  const status = (name: keyof typeof STATUS_HUES) =>
    ensureReadable(dark ? STATUS_HUES[name].onDark : STATUS_HUES[name].onLight, bg, 3)

  const shadowInk = dark ? 0.35 : 0.07

  return {
    '--theme-app-bg': bg,
    '--theme-app': fg,
    '--theme-panel-bg': panelBg,
    '--theme-panel': fg,
    '--theme-muted-panel-bg': mutedPanelBg,
    '--theme-muted-panel-color': mutedText,
    '--theme-muted-text-color': mutedText,
    '--theme-border': border,
    '--theme-element': accent,
    '--theme-element-text': accentText,
    '--theme-element-hover': accentHover,
    '--theme-hover': hover,
    '--theme-hover-text': fg,
    '--theme-link': link,
    '--theme-input-bg': inputBg,
    '--theme-input': link,
    '--theme-input-disabled-bg': mix(inputBg, bg, 0.5),
    '--theme-input-disabled-text': mix(fg, bg, 0.6),
    '--theme-card-bg': cardBg,
    '--theme-card-border': alpha(pole, dark ? 0.06 : 0.04),
    '--theme-card-hover': dark ? mix(cardBg, '#ffffff', 0.05) : mix(cardBg, '#000000', 0.02),
    '--theme-accent': accent,
    '--theme-accent-text': accentText,
    '--theme-focus-ring': alpha(link, dark ? 0.25 : 0.2),
    '--theme-hover-overlay': alpha(pole, dark ? 0.03 : 0.02),
    '--theme-success': status('success'),
    '--theme-success-muted': alpha(status('success'), dark ? 0.15 : 0.1),
    '--theme-error': status('error'),
    '--theme-error-muted': alpha(status('error'), dark ? 0.15 : 0.1),
    '--theme-warning': status('warning'),
    '--theme-warning-muted': alpha(status('warning'), dark ? 0.15 : 0.1),
    '--theme-info': status('info'),
    '--theme-info-muted': alpha(status('info'), dark ? 0.15 : 0.1),
    '--theme-favorite': status('favorite'),
    '--theme-favorite-muted': alpha(status('favorite'), dark ? 0.15 : 0.1),
    '--theme-shadow-sm': `0 1px 2px rgba(0, 0, 0, ${shadowInk})`,
    '--theme-shadow': `0 4px 6px -1px rgba(0, 0, 0, ${shadowInk}), 0 2px 4px -2px rgba(0, 0, 0, ${shadowInk})`,
    '--theme-shadow-lg': `0 10px 15px -3px rgba(0, 0, 0, ${shadowInk}), 0 4px 6px -4px rgba(0, 0, 0, ${shadowInk})`,
    '--theme-auth-shadow': authShadow(dark),
    '--theme-bg': sidebar.bg,
    '--theme-sidebar-text': sidebar.text,
    '--theme-sidebar-hover': sidebar.hover,
    '--theme-sidebar-hover-text': sidebar.hoverText,
    '--theme-sidebar-active-bg': sidebar.activeBg,
    '--theme-sidebar-active-text': sidebar.activeText,
  }
}

export interface ThemePreset {
  name: string
  label: string
  seed: SurfaceSeeds
}

export const THEME_PRESETS: readonly ThemePreset[] = [
  {
    name: 'navy',
    label: 'Navy',
    seed: {
      interface: { accent: '#06354f', background: '#f3f4f6' },
      sidebar: { accent: '#06354f', background: '#06354f' },
    },
  },
  {
    name: 'light',
    label: 'Light',
    seed: { interface: { accent: '#0d6efd', background: '#ffffff' } },
  },
  {
    name: 'dark',
    label: 'Dark',
    seed: {
      interface: { accent: '#2f81f7', background: '#0d1117' },
      sidebar: { accent: '#2f81f7', background: '#161b22' },
    },
  },
  {
    name: 'rose-pine',
    label: 'Rosé Pine',
    seed: {
      interface: { accent: '#c4a7e7', background: '#191724' },
      sidebar: { accent: '#c4a7e7', background: '#1f1d2e' },
    },
  },
]

export const DEFAULT_PRESET = THEME_PRESETS[0] as ThemePreset

export function applyTheme(el: HTMLElement, vars: Partial<ThemeVariables>): void {
  for (const [token, value] of Object.entries(vars)) {
    if (value !== undefined) {
      el.style.setProperty(token, value)
    }
  }
}
