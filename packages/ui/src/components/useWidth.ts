import { useLayoutEffect, useState } from 'react'

/** An element's width as it resizes, or null before it has one, measured before paint so a
 *  layout that depends on it never shows the wrong one first. */
export function useWidth(el: HTMLElement | null): number | null {
  const [width, setWidth] = useState<number | null>(null)
  useLayoutEffect(() => {
    if (!el) {
      return
    }
    const measure = () => setWidth(el.getBoundingClientRect().width || null)
    measure()
    if (typeof ResizeObserver === 'undefined') {
      return
    }
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [el])
  return width
}
