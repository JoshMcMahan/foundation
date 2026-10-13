import { useEffect, useLayoutEffect, useState } from 'react'
import {
  applyTheme,
  type ColorPreference,
  generateTheme,
  type Mode,
  modeOf,
  resolveMode,
  schemeFor,
  type Theme,
} from '../theme/index'

const DARK = '(prefers-color-scheme: dark)'
const prefersDark = () => typeof matchMedia === 'function' && matchMedia(DARK).matches

/** The mode a preference shows now, following the device while it's `system`. */
export function useColorMode(preference: ColorPreference): Mode {
  const [dark, setDark] = useState(prefersDark)
  useEffect(() => {
    if (preference !== 'system' || typeof matchMedia !== 'function') {
      return
    }
    const media = matchMedia(DARK)
    const update = () => setDark(media.matches)
    update()
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [preference])
  return resolveMode(preference, dark)
}

/**
 * Applies a theme's scheme for a mode to an element, the document root by
 * default, again whenever the theme changes: as a person edits it, the whole
 * app previews it. It also sets the element's `color-scheme`, which native
 * controls and `light-dark()` follow.
 */
export function useApplyTheme(theme: Theme, mode: Mode, element?: HTMLElement | null): void {
  useLayoutEffect(() => {
    const el = element ?? document.documentElement
    const scheme = schemeFor(theme, mode)
    applyTheme(el, generateTheme(scheme, theme.code ? { code: theme.code } : {}))
    el.style.colorScheme = modeOf(scheme)
  }, [theme, mode, element])
}
