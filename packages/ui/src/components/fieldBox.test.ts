import { focusOutline } from './fieldBox'
import { segmentClassName } from './segmented'

// Tailwind's outline-none sets the outline style variable to none, which focus-visible:outline-2
// then reads, so a class list with both draws no focus ring at all.
const showsFocus = (classes: string) =>
  classes.includes('focus-visible:outline-2') && !classes.split(/\s+/).includes('outline-none')

describe('focus rings', () => {
  it('draws the shared outline in the focus color', () => {
    expect(showsFocus(focusOutline)).toBe(true)
    expect(focusOutline).toContain('focus-visible:outline-(--theme-focus)')
  })

  it('draws a segment’s outline, current or not', () => {
    expect(showsFocus(segmentClassName(true, {}))).toBe(true)
    expect(showsFocus(segmentClassName(false, { iconOnly: true }))).toBe(true)
  })
})
