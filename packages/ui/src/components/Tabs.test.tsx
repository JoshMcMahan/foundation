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
    const row = screen.getByRole('tablist').parentElement as HTMLElement
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
