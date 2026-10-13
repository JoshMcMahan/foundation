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
