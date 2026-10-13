import { vi } from 'vitest'

/** Gives every element a size, since jsdom has no layout and the virtual list
 *  draws no rows in a scroller it measures as empty. Returns the restore. */
export function mockListLayout(size = 240) {
  const height = vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(size)
  const width = vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(size)
  return () => {
    height.mockRestore()
    width.mockRestore()
  }
}
