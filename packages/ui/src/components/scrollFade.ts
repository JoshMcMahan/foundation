import { type CSSProperties, useEffectEvent, useLayoutEffect, useRef, useState } from 'react'

/** Which ends of a sideways scroller hide some of its content, kept up to date as it
 *  scrolls or resizes. */
export type HiddenEnds = { start: boolean; end: boolean }
const NO_ENDS: HiddenEnds = { start: false, end: false }

export function useHiddenEnds(active: boolean) {
  const ref = useRef<HTMLElement>(null)
  const [ends, setEnds] = useState<HiddenEnds>(NO_ENDS)
  const measureNow = () => {
    const el = ref.current
    if (!el || !active) {
      setEnds(NO_ENDS)
      return
    }
    // Negative while scrolled from the start in a right-to-left line.
    const scrolled = Math.abs(el.scrollLeft)
    const start = scrolled > 1
    const end = scrolled + el.clientWidth < el.scrollWidth - 1
    setEnds((was) => (was.start === start && was.end === end ? was : { start, end }))
  }
  // The observer reads the latest value and room without subscribing again each render.
  const measure = useEffectEvent(measureNow)
  // After every render, as the value or its room may have changed; the state bails out
  // when the ends are the same.
  useLayoutEffect(() => {
    measure()
  })
  useLayoutEffect(() => {
    const el = ref.current
    if (!el || !active || typeof ResizeObserver === 'undefined') {
      return
    }
    const observer = new ResizeObserver(() => measure())
    observer.observe(el)
    return () => observer.disconnect()
  }, [active])
  return { ref, ends, onScroll: measureNow }
}

// How far the fade reaches into a value that runs on past an edge.
const FADE = '1.25rem'

export function fadeMask({ start, end }: HiddenEnds): CSSProperties | undefined {
  if (!start && !end) {
    return undefined
  }
  const image = `linear-gradient(to var(--fade-end, right), ${start ? `transparent, #000 ${FADE}` : '#000'}, ${end ? `#000 calc(100% - ${FADE}), transparent` : '#000'})`
  return { maskImage: image, WebkitMaskImage: image }
}
