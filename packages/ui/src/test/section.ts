import { fireEvent } from '@testing-library/react'

/** The toggles of the sections that fold. */
const toggles = () =>
  [...document.querySelectorAll<HTMLElement>('[data-section-title]')].filter((title) =>
    title.hasAttribute('aria-expanded'),
  )

function toggleOf(title: string): HTMLElement {
  const found = toggles().find((toggle) => toggle.textContent === title)
  if (!found) {
    throw new Error(`no ${title} section`)
  }
  return found
}

export const isSectionOpen = (title: string) =>
  toggleOf(title).getAttribute('aria-expanded') === 'true'

/** The titles of the sections now open, in page order. */
export const openSectionTitles = () =>
  toggles()
    .filter((toggle) => toggle.getAttribute('aria-expanded') === 'true')
    .map((toggle) => toggle.textContent)

/** Opens or closes a section, as a press on its title does. */
export function toggleSection(title: string) {
  fireEvent.click(toggleOf(title))
}

/** Opens a section if it is folded, and returns its content. */
export function openSection(title: string): HTMLElement {
  const toggle = toggleOf(title)
  if (toggle.getAttribute('aria-expanded') !== 'true') {
    fireEvent.click(toggle)
  }
  // The toggle names its content only while open.
  const panel = document.getElementById(toggle.getAttribute('aria-controls') ?? '')
  if (!panel) {
    throw new Error(`no content for the ${title} section`)
  }
  return panel
}
