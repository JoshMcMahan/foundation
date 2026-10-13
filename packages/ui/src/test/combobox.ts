import { fireEvent, waitFor } from '@testing-library/react'
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

export interface ShownOption {
  label: string
  description?: string
}

function shown(option: Element): ShownOption {
  const [label = '', description] = [...option.querySelectorAll('span')]
    .filter((span) => span.childElementCount === 0)
    .map((span) => span.textContent ?? '')
  return description === undefined ? { label } : { label, description }
}

/** Opens the field's list from the keyboard, with layout faked only meanwhile so
 *  the rest of a page keeps jsdom's, and hands its options to `read`. */
async function withOptions<T>(input: HTMLElement, read: (options: Element[]) => T): Promise<T> {
  const restore = mockListLayout()
  try {
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    const list = await waitFor(() => {
      const found = document.getElementById(input.getAttribute('aria-controls') ?? '')
      if (!found) {
        throw new Error('the field did not open its list')
      }
      return found
    })
    const result = read([...list.querySelectorAll('[role="option"]')])
    // An open list hides the rest of the page from queries, as it does from a screen reader.
    if (input.getAttribute('aria-expanded') === 'true') {
      fireEvent.keyDown(input, { key: 'Escape' })
    }
    return result
  } finally {
    restore()
  }
}

/** A combobox or autocomplete field's options, as shown. */
export function optionsOf(input: HTMLElement): Promise<ShownOption[]> {
  return withOptions(input, (options) => options.map(shown))
}

/** Picks the option labelled `label` the way a user does in a long list: types to
 *  find it, then clicks it. */
export function chooseOption(input: HTMLElement, label: string): Promise<void> {
  fireEvent.change(input, { target: { value: label } })
  return withOptions(input, (options) => {
    const option = options.find((o) => shown(o).label === label)
    if (!option) {
      throw new Error(
        `no option labelled ${label}: ${options.map((o) => shown(o).label).join(', ')}`,
      )
    }
    fireEvent.click(option)
  })
}
