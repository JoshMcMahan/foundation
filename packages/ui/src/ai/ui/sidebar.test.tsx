// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { render, renderHook, screen } from '@testing-library/react'
import type { MenuAction, MenuEntry } from '../../components/MenuEntries'
import { SidebarRowBody, useSessionMenu } from './sidebar'

const labels = (entries: MenuEntry[]) =>
  entries.map((e) => ('divider' in e ? '—' : (e as MenuAction).label))

describe('useSessionMenu', () => {
  const menu = () => renderHook(() => useSessionMenu()).result.current

  it('lists the actions it is given in one order, delete set apart', () => {
    const items = menu()({
      remove: { onClick: vi.fn() },
      download: { onClick: vi.fn() },
      rename: { onClick: vi.fn() },
      share: { onClick: vi.fn() },
    })
    expect(labels(items)).toEqual(['Rename', 'Share', 'Download', '—', 'Delete'])
    expect((items[4] as MenuAction).destructive).toBe(true)
  })

  it('leaves out what it is not given, and the divider with nothing above it', () => {
    expect(labels(menu()({ remove: { onClick: vi.fn() } }))).toEqual(['Delete'])
    expect(labels(menu()({ rename: { onClick: vi.fn() } }))).toEqual(['Rename'])
  })

  it('disables an action with the reason it is unavailable', () => {
    const [rename] = menu()({
      rename: { onClick: vi.fn(), disabledReason: 'Wait for the turn to end' },
    }) as MenuAction[]
    expect(rename?.disabled).toBe(true)
    expect(rename?.disabledReason).toBe('Wait for the turn to end')
  })
})

describe('SidebarRowBody', () => {
  it('shows the mark, title, time and the line under it', () => {
    render(
      <SidebarRowBody
        leading={<span data-testid="dot" />}
        title="Rate limit retries"
        time="11m"
        detail={<span>gpu-box</span>}
      />,
    )
    expect(screen.getByTestId('dot')).toBeInTheDocument()
    expect(screen.getByText('Rate limit retries')).toBeInTheDocument()
    expect(screen.getByText('11m')).toBeInTheDocument()
    expect(screen.getByText('gpu-box')).toBeInTheDocument()
  })
})
