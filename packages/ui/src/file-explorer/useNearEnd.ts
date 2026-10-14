import { type RefObject, useEffect, useEffectEvent } from 'react'

/** Fires once the element comes within 100px of the bottom of `root`. */
export function useNearEnd(
  ref: RefObject<Element | null>,
  { active, root, onNear }: { active: boolean; root: HTMLElement | null; onNear: () => void },
) {
  // An effect event, not a dependency: the parent re-renders every scroll tick,
  // and a fresh callback identity would rebuild the observer each frame.
  const near = useEffectEvent(onNear)

  useEffect(() => {
    const el = ref.current
    if (!active || !el) {
      return
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          near()
        }
      },
      { root, rootMargin: '100px' },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [ref, active, root])
}
