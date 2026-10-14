import { useLayoutEffect, useSyncExternalStore } from 'react'
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

function subscribeToScheme(onChange: () => void): () => void {
  if (typeof matchMedia !== 'function') {
    return () => {}
  }
  const media = matchMedia(DARK)
  media.addEventListener('change', onChange)
  return () => media.removeEventListener('change', onChange)
}

const ignore = () => () => {}

/** The mode a preference shows now, following the device while it's `system`. */
export function useColorMode(preference: ColorPreference): Mode {
  // Only `system` listens to the device, and the server renders light.
  const dark = useSyncExternalStore(
    preference === 'system' ? subscribeToScheme : ignore,
    prefersDark,
    () => false,
  )
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
