import { useEffect, useState } from 'react'

function readIsDark(): boolean {
  const scheme = getComputedStyle(document.documentElement).colorScheme
  const dark = scheme.includes('dark')
  const light = scheme.includes('light')
  if (dark !== light) {
    return dark
  }
  if (typeof window.matchMedia !== 'function') {
    return false
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

/**
 * Follows the host's CSS color-scheme, the same signal the log viewer's
 * light-dark() palette uses — no provider API involved. For the rare concrete
 * pick (editor themes, image variants) the tokens cannot express.
 */
export function useCssIsDark(): boolean {
  const [isDark, setIsDark] = useState(readIsDark)
  useEffect(() => {
    const update = () => setIsDark(readIsDark())
    const media =
      typeof window.matchMedia === 'function'
        ? window.matchMedia('(prefers-color-scheme: dark)')
        : undefined
    media?.addEventListener('change', update)
    const observer = new MutationObserver(update)
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['style', 'class', 'data-theme'],
    })
    return () => {
      media?.removeEventListener('change', update)
      observer.disconnect()
    }
  }, [])
  return isDark
}
