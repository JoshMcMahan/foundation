// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import { Disclosure } from './Disclosure'
import { Section } from './Section'
import { TabPanel, Tabs } from './Tabs'

// Tailwind's outline-none sets the outline style variable to none, which focus-visible:outline-2
// then reads, so a class list with both draws no focus ring at all.
function drawsFocusRing(el: Element) {
  const classes = el.className.split(/\s+/)
  return (
    classes.includes('focus-visible:outline-2') &&
    classes.includes('focus-visible:outline-(--theme-focus)') &&
    !classes.includes('outline-none')
  )
}

describe('focus rings', () => {
  it('outlines a focused tab and its panel in the focus color', () => {
    render(
      <Tabs
        label="Resource"
        items={[
          { value: 'overview', label: 'Overview' },
          { value: 'settings', label: 'Settings' },
        ]}
        defaultValue="overview"
      >
        <TabPanel value="overview">Overview panel</TabPanel>
        <TabPanel value="settings">Settings panel</TabPanel>
      </Tabs>,
    )
    expect(drawsFocusRing(screen.getByRole('tab', { name: 'Overview' }))).toBe(true)
    expect(drawsFocusRing(screen.getByRole('tabpanel'))).toBe(true)
  })

  it('outlines a focused disclosure summary in the focus color', () => {
    render(<Disclosure summary="Arguments">the args</Disclosure>)
    expect(drawsFocusRing(screen.getByRole('button', { name: 'Arguments' }))).toBe(true)
  })

  it('outlines a focused section title in the focus color', () => {
    render(<Section title="Network">content</Section>)
    expect(drawsFocusRing(screen.getByRole('button', { name: 'Network' }))).toBe(true)
  })
})
