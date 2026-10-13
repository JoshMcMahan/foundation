/* The theme contract: every color a component may use is one of the
 * `--theme-*` tokens, and every token is generated from a scheme of three
 * choices (base, accent, contrast) per surface. A theme holds a scheme for
 * light and for dark; presets are themes. Components read only tokens, never a
 * light/dark flag. This entry has no browser code at import, so a build can
 * run it too. */
import type { GeneratedTheme, ThemeVariables } from './derive'

export {
  composite,
  deltaE,
  type Gamut,
  JND,
  type Oklch,
  parseColor,
  toHex,
  toP3,
} from './color'
export { apcaContrast, type ContrastTarget, contrastRatio, isDarkColor } from './contrast'
export {
  type DeriveOptions,
  deriveTheme,
  type GeneratedTheme,
  generateTheme,
  SIDEBAR_TOKENS,
  THEME_TOKENS,
  type ThemeToken,
  type ThemeVariables,
  themeStylesheet,
} from './derive'
export { type FitOptions, type FitReport, type FitResult, type FitToken, fitSeed } from './fit'
export {
  CODE_STYLES,
  type CodeStyle,
  type ColorPreference,
  DEFAULT_CONTRAST,
  DEFAULT_PRESET,
  DEFAULT_THEME,
  type Mode,
  modeOf,
  parseTheme,
  resolveMode,
  type Scheme,
  type Seed,
  schemeFor,
  serializeTheme,
  THEME_PRESETS,
  type Theme,
  type ThemeParseError,
  type ThemeParseResult,
  type ThemePreset,
} from './model'

/** Whether the screen shows display-p3, so wide-gamut values are worth setting. */
export function prefersWideGamut(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(color-gamut: p3)').matches
}

/**
 * Sets tokens on an element, such as the document root or a preview pane.
 * Given a generated theme, it sets the sRGB values and, on a wide-gamut screen,
 * the display-p3 ones over them; inline values can't carry a media query.
 */
export function applyTheme(
  el: HTMLElement,
  theme: Partial<ThemeVariables> | GeneratedTheme,
  wide: boolean = prefersWideGamut(),
): void {
  const generated = 'srgb' in theme && typeof theme.srgb === 'object'
  const vars = generated
    ? { ...(theme as GeneratedTheme).srgb, ...(wide ? (theme as GeneratedTheme).p3 : {}) }
    : (theme as Partial<ThemeVariables>)
  for (const [token, value] of Object.entries(vars)) {
    if (value !== undefined) {
      el.style.setProperty(token, value)
    }
  }
}
