// What a person picks, and what a host stores: a theme is a scheme for light
// and one for dark, and a scheme is three choices. Everything else is derived.

import { oklch, parseColor, toHex } from './color'
import { isDarkColor } from './contrast'

export type Mode = 'light' | 'dark'

/** What a person prefers: one mode, or whichever the device asks for. */
export type ColorPreference = Mode | 'system'

/** How strongly the code theme colors syntax. */
export type CodeStyle = 'balanced' | 'vivid' | 'muted' | 'mono'

export const CODE_STYLES: readonly CodeStyle[] = ['balanced', 'vivid', 'muted', 'mono']

/** The three choices a surface is generated from. */
export interface Seed {
  /** The background, as a hex or `oklch()`. Its lightness sets light or dark; its hue tints every neutral. */
  base: string
  /** The brand color, as a hex or `oklch()`. Filled buttons show it exactly. */
  accent: string
  /** 0–100, 30 by default. Raises the separation of surfaces and borders and the contrast of text; text never drops below WCAG AA. */
  contrast?: number
}

/** A theme in one mode: the page's seed, and the sidebar's own base or accent when it has them. */
export interface Scheme {
  interface: Seed
  sidebar?: { base?: string; accent?: string }
}

/** A theme for both modes, as a host stores it and a person copies it. A missing mode is derived from the other. */
export interface Theme {
  version: 1
  light?: Scheme
  dark?: Scheme
  /** How the code theme colors syntax; balanced by default. */
  code?: CodeStyle
}

export const DEFAULT_CONTRAST = 30

export interface ThemePreset {
  name: string
  label: string
  theme: Theme
}

export const THEME_PRESETS: readonly ThemePreset[] = [
  {
    name: 'navy',
    label: 'Navy',
    theme: {
      version: 1,
      light: {
        interface: { base: '#f3f4f6', accent: '#06354f' },
        sidebar: { base: '#06354f' },
      },
      dark: { interface: { base: '#111418', accent: '#5b9ccf' } },
    },
  },
  {
    name: 'light',
    label: 'Light',
    theme: { version: 1, light: { interface: { base: '#ffffff', accent: '#0d6efd' } } },
  },
  {
    name: 'dark',
    label: 'Dark',
    theme: {
      version: 1,
      dark: {
        interface: { base: '#0d1117', accent: '#2f81f7' },
        sidebar: { base: '#161b22' },
      },
    },
  },
  {
    name: 'rose-pine',
    label: 'Rosé Pine',
    theme: {
      version: 1,
      dark: {
        interface: { base: '#191724', accent: '#c4a7e7' },
        sidebar: { base: '#1f1d2e' },
      },
    },
  },
]

export const DEFAULT_PRESET = THEME_PRESETS[0] as ThemePreset
export const DEFAULT_THEME: Theme = DEFAULT_PRESET.theme

/** The mode a scheme renders in, read from its base. */
export function modeOf(scheme: Scheme): Mode {
  return isDarkColor(toHex(oklch(scheme.interface.base))) ? 'dark' : 'light'
}

/** The mode a preference resolves to. */
export function resolveMode(preference: ColorPreference, prefersDark: boolean): Mode {
  if (preference === 'system') {
    return prefersDark ? 'dark' : 'light'
  }
  return preference
}

// Where a derived mode's background sits in OKLCH lightness.
const ANCHOR: Record<Mode, number> = { light: 0.985, dark: 0.19 }

/** One scheme carried into the other mode: the base keeps its hue and tint at the
 *  other mode's lightness, the accent and contrast carry over, and the sidebar
 *  falls back to its derived default since its relation to the page doesn't flip. */
function carry(scheme: Scheme, mode: Mode): Scheme {
  const base = oklch(scheme.interface.base)
  const sidebarAccent = scheme.sidebar?.accent
  return {
    interface: {
      ...scheme.interface,
      base: toHex({ ...base, l: ANCHOR[mode], c: Math.min(base.c, mode === 'dark' ? 0.03 : 0.02) }),
    },
    ...(sidebarAccent ? { sidebar: { accent: sidebarAccent } } : {}),
  }
}

/** The scheme a theme has for a mode, derived from its other mode when it has none,
 *  and from the default theme when it has neither. */
export function schemeFor(theme: Theme | undefined, mode: Mode): Scheme {
  const own = theme?.[mode]
  if (own) {
    return own
  }
  const other = theme?.[mode === 'light' ? 'dark' : 'light']
  if (other) {
    return carry(other, mode)
  }
  return schemeFor(DEFAULT_THEME, mode)
}

/** Why a pasted theme was refused, and where. */
export interface ThemeParseError {
  code: 'json' | 'version' | 'shape' | 'color' | 'range'
  /** The field at fault, such as `light.interface.accent`. */
  path: string
}

export type ThemeParseResult = { ok: true; theme: Theme } | { ok: false; error: ThemeParseError }

/** The fields a stored theme may have at any level, each yet to be checked. */
type Fields = {
  [K in
    | 'version'
    | 'light'
    | 'dark'
    | 'code'
    | 'interface'
    | 'sidebar'
    | 'base'
    | 'accent'
    | 'contrast']?: unknown
}

const isRecord = (v: unknown): v is Fields =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

/** Reads a theme from JSON text or a parsed value, such as a paste or a stored row. Never throws. */
export function parseTheme(input: unknown): ThemeParseResult {
  let value = input
  if (typeof input === 'string') {
    try {
      value = JSON.parse(input)
    } catch {
      return { ok: false, error: { code: 'json', path: '' } }
    }
  }
  if (!isRecord(value)) {
    return { ok: false, error: { code: 'shape', path: '' } }
  }
  if (value.version !== 1) {
    return { ok: false, error: { code: 'version', path: 'version' } }
  }
  const theme: Theme = { version: 1 }
  const fail = (code: ThemeParseError['code'], path: string): ThemeParseResult => ({
    ok: false,
    error: { code, path },
  })
  const color = (v: unknown, path: string): string | ThemeParseResult => {
    if (typeof v !== 'string') {
      return fail('shape', path)
    }
    return parseColor(v) ? v.trim() : fail('color', path)
  }
  for (const mode of ['light', 'dark'] as const) {
    const scheme = value[mode]
    if (scheme === undefined) {
      continue
    }
    if (!isRecord(scheme) || !isRecord(scheme.interface)) {
      return fail('shape', `${mode}.interface`)
    }
    const at = `${mode}.interface`
    const base = color(scheme.interface.base, `${at}.base`)
    if (typeof base !== 'string') return base
    const accent = color(scheme.interface.accent, `${at}.accent`)
    if (typeof accent !== 'string') return accent
    const seed: Seed = { base, accent }
    const contrast = scheme.interface.contrast
    if (contrast !== undefined) {
      if (typeof contrast !== 'number' || !Number.isFinite(contrast)) {
        return fail('shape', `${at}.contrast`)
      }
      if (contrast < 0 || contrast > 100) {
        return fail('range', `${at}.contrast`)
      }
      seed.contrast = contrast
    }
    const parsed: Scheme = { interface: seed }
    if (scheme.sidebar !== undefined) {
      if (!isRecord(scheme.sidebar)) {
        return fail('shape', `${mode}.sidebar`)
      }
      parsed.sidebar = {}
      if (scheme.sidebar.base !== undefined) {
        const sidebarBase = color(scheme.sidebar.base, `${mode}.sidebar.base`)
        if (typeof sidebarBase !== 'string') return sidebarBase
        parsed.sidebar.base = sidebarBase
      }
      if (scheme.sidebar.accent !== undefined) {
        const sidebarAccent = color(scheme.sidebar.accent, `${mode}.sidebar.accent`)
        if (typeof sidebarAccent !== 'string') return sidebarAccent
        parsed.sidebar.accent = sidebarAccent
      }
    }
    theme[mode] = parsed
  }
  if (value.code !== undefined) {
    if (!CODE_STYLES.includes(value.code as CodeStyle)) {
      return fail('range', 'code')
    }
    theme.code = value.code as CodeStyle
  }
  return { ok: true, theme }
}

/** A theme as small, stable JSON: what a host stores and a person copies. */
export function serializeTheme(theme: Theme): string {
  const scheme = (s: Scheme | undefined) =>
    s && {
      interface: {
        base: s.interface.base,
        accent: s.interface.accent,
        ...(s.interface.contrast === undefined ? {} : { contrast: s.interface.contrast }),
      },
      ...(s.sidebar
        ? {
            sidebar: {
              ...(s.sidebar.base ? { base: s.sidebar.base } : {}),
              ...(s.sidebar.accent ? { accent: s.sidebar.accent } : {}),
            },
          }
        : {}),
    }
  return JSON.stringify({
    version: 1,
    ...(theme.light ? { light: scheme(theme.light) } : {}),
    ...(theme.dark ? { dark: scheme(theme.dark) } : {}),
    ...(theme.code ? { code: theme.code } : {}),
  })
}
