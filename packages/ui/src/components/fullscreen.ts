import { useSyncExternalStore } from 'react'

function subscribe(onChange: () => void) {
  document.addEventListener('fullscreenchange', onChange)
  return () => document.removeEventListener('fullscreenchange', onChange)
}

function snapshot(): HTMLElement | undefined {
  const element = document.fullscreenElement
  return element instanceof HTMLElement ? element : undefined
}

/** Where a popup portals while an element is fullscreen: that element. The browser
 *  shows only the fullscreen element's subtree, so a popup portaled to the body
 *  would open unseen behind it. Undefined otherwise, which keeps the body. */
export function useFullscreenContainer(): HTMLElement | undefined {
  return useSyncExternalStore(subscribe, snapshot, () => undefined)
}
