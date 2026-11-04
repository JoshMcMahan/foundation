import { type CSSProperties, useEffectEvent, useLayoutEffect, useRef, useState } from 'react'

/** Which ends of a sideways scroller hide some of its content. `start` and `end` follow the
 *  line's direction, so `start` is the right in a right-to-left line. */
export type HiddenEnds = { start: boolean; end: boolean }
const NO_ENDS: HiddenEnds = { start: false, end: false }

/**
 * Tracks which ends of a row that scrolls sideways hide some of its content, kept up to date
 * as it scrolls, resizes or settles. Put `ref` and `onScroll` on the element that scrolls
 * (`overflow-x: auto`), and give its `style` `fadeMask(ends)` to fade the ends that hide
 * something. While `active` is false, as for a row that wraps instead, no end is hidden.
 */
export function useHiddenEnds<T extends HTMLElement = HTMLElement>(active = true) {
  const ref = useRef<T>(null)
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
    if (!el || !active) {
      return
    }
    const update = () => measure()
    // Something inside that eases into place, such as a tab row's underline after the tabs
    // narrow, can run past the end until it settles, and settling resizes nothing observed.
    el.addEventListener('transitionend', update)
    const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(update)
    observer?.observe(el)
    return () => {
      el.removeEventListener('transitionend', update)
      observer?.disconnect()
    }
  }, [active])
  return { ref, ends, onScroll: measureNow }
}

// How far the fade reaches into a value that runs on past an edge.
const FADE = '1.25rem'

/**
 * A mask style that fades whichever `ends` hide content, over `reach` from each edge (1.25rem
 * unless given), leaving the outermost `clear` of it fully hidden, such as under an arrow that
 * sits there. Returns undefined when nothing is hidden, so a row that fits shows whole.
 *
 * The fade runs left to right. In a right-to-left line, set `--fade-end: left` on the same
 * element (`rtl:[--fade-end:left]`) so it follows the line.
 */
export function fadeMask(
  { start, end }: HiddenEnds,
  reach = FADE,
  clear?: string,
): CSSProperties | undefined {
  if (!start && !end) {
    return undefined
  }
  const from = clear ? `transparent ${clear}` : 'transparent'
  const to = clear ? `transparent calc(100% - ${clear})` : 'transparent'
  const image = `linear-gradient(to var(--fade-end, right), ${start ? `${from}, #000 ${reach}` : '#000'}, ${end ? `#000 calc(100% - ${reach}), ${to}` : '#000'})`
  return { maskImage: image, WebkitMaskImage: image }
}
