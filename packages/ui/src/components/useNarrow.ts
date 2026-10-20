import { useSyncExternalStore } from 'react'

// Phone width, where Popover opens as a sheet.
const NARROW = '(max-width: 639px)'

function subscribe(onChange: () => void): () => void {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return () => {}
  }
  const media = window.matchMedia(NARROW)
  media.addEventListener('change', onChange)
  return () => media.removeEventListener('change', onChange)
}

const isNarrow = () =>
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia(NARROW).matches

/** Whether the screen is phone width, under 640px. */
export function useNarrow(): boolean {
  return useSyncExternalStore(subscribe, isNarrow, () => false)
}
