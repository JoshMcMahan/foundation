import { vi } from 'vitest'

/** Gives every element a size, since jsdom has no layout and the virtual list
 *  draws no rows in a scroller it measures as empty. The virtual list reads a
 *  scroller's client size and an item's offset size, so both are faked.
 *  Returns the restore. */
export function mockListLayout(size = 240) {
  const spies = (['offsetHeight', 'offsetWidth', 'clientHeight', 'clientWidth'] as const).map(
    (key) => vi.spyOn(HTMLElement.prototype, key, 'get').mockReturnValue(size),
  )
  return () => {
    for (const spy of spies) {
      spy.mockRestore()
    }
  }
}
