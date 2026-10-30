// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { openTooltip } from '../test/tooltip'
import { TabPanel, Tabs } from './Tabs'

const items = [
  { value: 'overview', label: 'Overview' },
  { value: 'settings', label: 'Settings' },
]

describe('Tabs', () => {
  it('shows the current tab’s panel and switches on a press', async () => {
    const onValueChange = vi.fn()
    render(
      <Tabs label="Resource" items={items} defaultValue="overview" onValueChange={onValueChange}>
        <TabPanel value="overview">Overview panel</TabPanel>
        <TabPanel value="settings">Settings panel</TabPanel>
      </Tabs>,
    )
    expect(screen.getByRole('tablist', { name: 'Resource' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Overview' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByText('Overview panel')).toBeVisible()
    fireEvent.click(screen.getByRole('tab', { name: 'Settings' }))
    expect(onValueChange).toHaveBeenCalledWith('settings')
    await waitFor(() => expect(screen.getByText('Settings panel')).toBeVisible())
  })

  it('renders tabs that are pages as links, marking the current page', () => {
    render(
      <Tabs
        label="Resource"
        value="settings"
        items={items.map((item) => ({ ...item, href: `/r/${item.value}` }))}
      />,
    )
    const settings = screen.getByRole('tab', { name: 'Settings' })
    expect(settings.tagName).toBe('A')
    expect(settings).toHaveAttribute('href', '/r/settings')
    expect(settings).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: 'Overview' })).toHaveAttribute('aria-selected', 'false')
  })

  // A root with only the row in it would leave a sticky row no room to stick.
  it('drops the root box for tabs that are pages, keeping it around panels', () => {
    const { rerender } = render(
      <Tabs
        label="Resource"
        value="settings"
        sticky
        testId="tabs"
        items={items.map((item) => ({ ...item, href: `/r/${item.value}` }))}
      />,
    )
    expect(screen.getByTestId('tabs')).toHaveClass('contents')
    rerender(
      <Tabs label="Resource" defaultValue="overview" sticky testId="tabs" items={items}>
        <TabPanel value="overview">Overview panel</TabPanel>
      </Tabs>,
    )
    expect(screen.getByTestId('tabs')).not.toHaveClass('contents')
  })

  it('pins the row, at the top of a scroller that pins nothing else', () => {
    render(<Tabs label="Resource" sticky items={items} />)
    // The list sits in a box that holds its scroll arrows, inside the row.
    const row = screen.getByRole('tablist').parentElement?.parentElement as HTMLElement
    expect(row).toHaveClass('sticky')
    expect(row).toHaveStyle({ top: '0px' })
  })

  it('moves between tabs with the arrow keys', async () => {
    render(<Tabs label="Resource" items={items} defaultValue="overview" />)
    const overview = screen.getByRole('tab', { name: 'Overview' })
    act(() => overview.focus())
    fireEvent.keyDown(overview, { key: 'ArrowRight' })
    await waitFor(() => expect(screen.getByRole('tab', { name: 'Settings' })).toHaveFocus())
  })

  // Hidden panels leave the layout, so the box would take each panel's height in turn.
  it('stacks the panels in one cell with a steady height, the closed ones out of sight and reach', async () => {
    render(
      <Tabs label="Resource" items={items} defaultValue="overview" steadyHeight>
        <TabPanel value="overview">Overview panel</TabPanel>
        <TabPanel value="settings">Settings panel</TabPanel>
      </Tabs>,
    )
    const panel = (text: string) => screen.getByText(text).closest('[role="tabpanel"]')
    expect(panel('Settings panel')).not.toHaveAttribute('hidden')
    expect(panel('Settings panel')).toHaveAttribute('data-hidden')
    expect(panel('Settings panel')).toHaveAttribute('inert')
    expect(panel('Settings panel')?.parentElement).toBe(panel('Overview panel')?.parentElement)
    fireEvent.click(screen.getByRole('tab', { name: 'Settings' }))
    await waitFor(() => expect(panel('Overview panel')).toHaveAttribute('data-hidden'))
    expect(panel('Overview panel')).not.toHaveAttribute('hidden')
    expect(panel('Settings panel')).not.toHaveAttribute('inert')
  })

  it('leaves tabs inside a steady-height panel to show one panel at a time', () => {
    render(
      <Tabs label="Resource" items={items} defaultValue="overview" steadyHeight>
        <TabPanel value="overview">
          <Tabs
            label="Logs"
            items={[
              { value: 'out', label: 'Output' },
              { value: 'err', label: 'Errors' },
            ]}
            defaultValue="out"
          >
            <TabPanel value="out">Output panel</TabPanel>
            <TabPanel value="err">Errors panel</TabPanel>
          </Tabs>
        </TabPanel>
        <TabPanel value="settings">Settings panel</TabPanel>
      </Tabs>,
    )
    expect(screen.getByText('Output panel')).toBeVisible()
    expect(screen.queryByText('Errors panel')).toBeNull()
  })

  it('hides a lone tab, but still shows its panel', () => {
    render(
      <Tabs label="Resource" items={[{ value: 'only', label: 'Only' }]}>
        <TabPanel value="only">Only panel</TabPanel>
      </Tabs>,
    )
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument()
    expect(screen.getByText('Only panel')).toBeVisible()
  })

  it('keeps a lone tab’s row when something sits at its end', () => {
    render(
      <Tabs
        label="Resource"
        items={[{ value: 'only', label: 'Only' }]}
        end={<span>Session</span>}
      />,
    )
    expect(screen.getByRole('tablist')).toBeInTheDocument()
    expect(screen.getByText('Session')).toBeInTheDocument()
  })

  it('marks the current segment in the segmented look, held or not', () => {
    render(<Tabs label="Views" variant="segmented" items={items} defaultValue="overview" />)
    fireEvent.click(screen.getByRole('tab', { name: 'Settings' }))
    expect(screen.getByRole('tab', { name: 'Settings' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: 'Settings' }).className).toContain('shadow-sm')
  })

  it('names icon-only segments by their labels, with tooltips', async () => {
    render(
      <Tabs
        label="Views"
        variant="segmented"
        iconOnly
        value="overview"
        items={items.map((item) => ({ ...item, icon: <svg /> }))}
      />,
    )
    expect(screen.getByRole('tablist')).toHaveAttribute('aria-orientation', 'vertical')
    act(() => screen.getByRole('tab', { name: 'Overview' }).focus())
    await waitFor(() => expect(openTooltip()).toHaveTextContent('Overview'))
  })
})

it('counts what each tab holds, and colors one that needs attention', () => {
  render(
    <Tabs
      label="Resources"
      items={[
        { value: 'vms', label: 'VMs', count: 1204 },
        { value: 'disks', label: 'Disks', count: 23, tone: 'warning' },
      ]}
    />,
  )
  expect(screen.getByRole('tab', { name: /VMs/ })).toHaveTextContent('1.2K')
  const disks = screen.getByRole('tab', { name: /Disks/ })
  expect(disks).toHaveTextContent('23')
  expect(disks).toHaveClass('text-(--theme-warning)')
})

it('sets segmented tabs small', () => {
  render(
    <Tabs
      label="Views"
      variant="segmented"
      size="sm"
      items={[
        { value: 'list', label: 'List' },
        { value: 'board', label: 'Board' },
      ]}
    />,
  )
  expect(screen.getByRole('tab', { name: 'List' })).toHaveClass('h-6', 'text-xs')
})

describe('a line row too wide for its space', () => {
  it('scrolls the current tab into view and fades the end that hides tabs', () => {
    const items = Array.from({ length: 11 }, (_, i) => ({ value: `t${i}`, label: `Tab ${i}` }))
    // Each tab 100px wide in a 300px row, as jsdom lays nothing out.
    const geometry = {
      offsetLeft(this: HTMLElement) {
        const index = Number(this.textContent?.replace('Tab ', ''))
        return Number.isNaN(index) ? 0 : index * 100
      },
      offsetWidth: () => 100,
      clientWidth: () => 300,
      scrollWidth: () => 1100,
    }
    const restore = Object.entries(geometry).map(([key, get]) => {
      const was = Object.getOwnPropertyDescriptor(HTMLElement.prototype, key)
      Object.defineProperty(HTMLElement.prototype, key, { configurable: true, get })
      return () => was && Object.defineProperty(HTMLElement.prototype, key, was)
    })
    const scrollTo = vi.fn(function (this: HTMLElement, { left }: { left: number }) {
      this.scrollLeft = left
    })
    HTMLElement.prototype.scrollTo = scrollTo as unknown as typeof HTMLElement.prototype.scrollTo
    try {
      render(<Tabs label="Inventory" items={items} defaultValue="t9" />)
      // Tab 9 spans 900–1000: scrolled so it ends clear of the 48px fade at the row's right edge.
      expect(scrollTo).toHaveBeenCalledWith({ left: 748, behavior: 'instant' })
      const list = screen.getByRole('tablist')
      expect(list.style.maskImage).toContain('linear-gradient')
      // Wide enough to dissolve a tab cut at the edge, not just its last letter.
      expect(list.style.maskImage).toContain('48px')
      // An arrow at each end that hides tabs moves the row most of its width that way.
      const scrollBy = vi.fn()
      list.scrollBy = scrollBy as unknown as typeof list.scrollBy
      const arrowAtEnd = document.querySelector('[data-scroll-arrow="end"]') as HTMLElement
      expect(document.querySelector('[data-scroll-arrow="start"]')).toBeInTheDocument()
      expect(arrowAtEnd).toHaveAttribute('aria-hidden', 'true')
      fireEvent.click(arrowAtEnd)
      expect(scrollBy).toHaveBeenCalledWith(expect.objectContaining({ left: 204 }))
    } finally {
      for (const undo of restore) {
        undo()
      }
    }
  })

  it('drops the fade and arrow once the current tab’s underline settles inside the row', () => {
    const { rerender } = render(<Tabs label="Views" items={items} defaultValue="settings" />)
    const list = screen.getByRole('tablist')
    // The current tab narrows, such as when a web font loads: the tabs fit, but the underline
    // still runs past them as it eases to the narrower tab.
    let scrollWidth = 303
    Object.defineProperties(list, {
      clientWidth: { value: 300 },
      scrollWidth: { get: () => scrollWidth },
    })
    rerender(<Tabs label="Views" items={items} defaultValue="settings" />)
    expect(document.querySelector('[data-scroll-arrow="end"]')).toBeInTheDocument()
    scrollWidth = 300
    const underline = list.lastElementChild as HTMLElement
    fireEvent.transitionEnd(underline)
    expect(document.querySelector('[data-scroll-arrow="end"]')).not.toBeInTheDocument()
    expect(list.style.maskImage).toBe('')
  })
})
