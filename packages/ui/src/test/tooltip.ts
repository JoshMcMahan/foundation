import { fireEvent, waitFor } from '@testing-library/react'

/** The open tooltip, or null. Base UI keeps tooltips out of the accessibility
 *  tree, so it is found by its open, positioned popup rather than a role. */
export function openTooltip(): HTMLElement | null {
  return document.body.querySelector<HTMLElement>('[data-side][data-open]:has(> [data-side])')
}

/** Hovers `anchor` the way a mouse does and waits out the delay for its tooltip. */
export async function hoverTooltip(anchor: HTMLElement | null): Promise<HTMLElement> {
  if (!anchor) {
    throw new Error('no tooltip anchor')
  }
  fireEvent.pointerEnter(anchor, { pointerType: 'mouse' })
  fireEvent.mouseEnter(anchor)
  fireEvent.pointerMove(anchor, { pointerType: 'mouse' })
  fireEvent.mouseMove(anchor)
  return waitFor(() => {
    const tooltip = anchor.hasAttribute('data-popup-open') ? openTooltip() : null
    if (!tooltip) {
      throw new Error('no tooltip opened')
    }
    return tooltip
  })
}
