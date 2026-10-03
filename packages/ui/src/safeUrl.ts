const SAFE_PROTOCOLS = new Set(['http:', 'https:', 'blob:'])

/**
 * Returns url when following it cannot run script in the app's origin: a
 * relative path or an http, https or blob URL. Hosts and servers supply these
 * URLs, so a javascript: URL from either would otherwise run when clicked.
 */
export function safeUrl(url: string | null | undefined): string | undefined {
  if (!url) {
    return undefined
  }
  try {
    // Parsing applies the browser's own normalization, so tricks like
    // " JaVa\tscript:" resolve to the protocol a click would use.
    const { protocol } = new URL(url, 'https://relative.invalid')
    return SAFE_PROTOCOLS.has(protocol) ? url : undefined
  } catch {
    return undefined
  }
}
