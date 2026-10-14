import { useSyncExternalStore } from 'react'

const DARK = '(prefers-color-scheme: dark)'

/** Whether the host's CSS color-scheme reads dark, falling back to the system preference. */
export function readIsDark(): boolean {
  if (typeof document === 'undefined') {
    return false
  }
  const scheme = getComputedStyle(document.documentElement).colorScheme
  const dark = scheme.includes('dark')
  const light = scheme.includes('light')
  if (dark !== light) {
    return dark
  }
  if (typeof window.matchMedia !== 'function') {
    return false
  }
  return window.matchMedia(DARK).matches
}

// One observer and one style read for every reader on the page: each reader of its own would
// force a style recalculation on every attribute change of the root, such as each step of a
// theme being applied.
const listeners = new Set<() => void>()
let current = false
let stop: (() => void) | undefined

function refresh() {
  const next = readIsDark()
  if (next !== current) {
    current = next
    for (const listener of listeners) {
      listener()
    }
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  if (!stop) {
    current = readIsDark()
    const media = typeof window.matchMedia === 'function' ? window.matchMedia(DARK) : undefined
    media?.addEventListener('change', refresh)
    const observer = new MutationObserver(refresh)
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['style', 'class', 'data-theme'],
    })
    stop = () => {
      media?.removeEventListener('change', refresh)
      observer.disconnect()
    }
  }
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0) {
      stop?.()
      stop = undefined
    }
  }
}

// Read fresh while nothing subscribes, as on a first render; kept by the observer after that.
const snapshot = () => (stop ? current : readIsDark())

/**
 * Follows the host's CSS color-scheme, the same signal the log viewer's
 * light-dark() palette uses — no provider API involved. For the rare concrete
 * pick (editor themes, image variants) the tokens cannot express.
 */
export function useCssIsDark(): boolean {
  return useSyncExternalStore(subscribe, snapshot, () => false)
}
