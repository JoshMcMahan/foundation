import { type RefObject, useEffect, useRef } from 'react'

/** Fires once the element comes within 100px of the bottom of `root`. */
export function useNearEnd(
  ref: RefObject<Element | null>,
  { active, root, onNear }: { active: boolean; root: HTMLElement | null; onNear: () => void },
) {
  // Through a ref, not a dependency: the parent re-renders every scroll tick, and a
  // fresh callback identity would rebuild the observer each frame.
  const latestOnNear = useRef(onNear)
  useEffect(() => {
    latestOnNear.current = onNear
  }, [onNear])

  useEffect(() => {
    const el = ref.current
    if (!active || !el) {
      return
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          latestOnNear.current()
        }
      },
      { root, rootMargin: '100px' },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [ref, active, root])
}
