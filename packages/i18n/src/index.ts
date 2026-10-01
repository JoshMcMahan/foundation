/**
 * The supported locale that best matches preferred, most preferred first (as in
 * navigator.languages): an exact match, else the same base language, so es-MX
 * gets es. Returns fallback when nothing matches.
 */
export function negotiateLocale(
  preferred: readonly string[],
  locales: readonly string[],
  fallback: string,
): string {
  for (const tag of preferred) {
    const exact = locales.find((l) => l.toLowerCase() === tag.toLowerCase())
    if (exact) return exact
    const base = baseLanguage(tag)
    const match = base && locales.find((l) => baseLanguage(l) === base)
    if (match) return match
  }
  return fallback
}

function baseLanguage(tag: string): string | undefined {
  try {
    return new Intl.Locale(tag).language
  } catch {
    return undefined
  }
}

export interface DetectOptions {
  /** Returned when nothing else matches. */
  fallback: string
  /** A locale the server chose, such as one it injected into the page. */
  injected?: string | null | undefined
  /** A cookie holding the person's choice. */
  cookie?: string
  /** A localStorage key holding the person's choice. */
  storageKey?: string
}

/**
 * The locale to start in: the server's choice, then a stored choice (cookie,
 * then localStorage), then the browser's languages. Each is negotiated against
 * locales, so a stored es-MX still finds es.
 */
export function detectLocale(locales: readonly string[], options: DetectOptions): string {
  const choices = [options.injected, readCookie(options.cookie), readStorage(options.storageKey)]
  for (const choice of choices) {
    if (choice) {
      const match = negotiateLocale([choice], locales, '')
      if (match) return match
    }
  }
  const browser = typeof navigator === 'undefined' ? [] : navigator.languages
  return negotiateLocale(browser, locales, options.fallback)
}

function readCookie(name: string | undefined): string | undefined {
  if (!name || typeof document === 'undefined') return undefined
  for (const part of document.cookie.split(';')) {
    const [key, ...value] = part.trim().split('=')
    if (key === name) return decodeURIComponent(value.join('='))
  }
  return undefined
}

function readStorage(key: string | undefined): string | undefined {
  if (!key) return undefined
  try {
    return localStorage.getItem(key) ?? undefined
  } catch {
    // Storage blocked, as in some private windows: use the browser's languages.
    return undefined
  }
}
