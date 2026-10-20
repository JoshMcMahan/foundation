// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { ActionToolbar, fitToolbar, type ItemWidth, type ToolbarItem } from './ActionToolbar'

const icon = <svg />

// jsdom lays nothing out, so these give the toolbar a width and each button
// one from its text: 20px of padding, 8px a letter and 18px for an icon, or a
// 28px square folded to its icon.
function layOut(toolbarWidth: number) {
  vi.spyOn(Element.prototype, 'clientWidth', 'get').mockImplementation(function (this: Element) {
    return this.getAttribute('role') === 'toolbar' ? toolbarWidth : 0
  })
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    const el = this as HTMLElement
    const width =
      el.dataset['fold'] === 'folded'
        ? 28
        : 20 + (el.textContent ?? '').length * 8 + (el.querySelector('svg') ? 18 : 0)
    return { width, height: 28, top: 0, left: 0, right: width, bottom: 28 } as DOMRect
  })
}

afterEach(() => vi.restoreAllMocks())

const noop = () => {}

// Full: Run 62 + Stop 70 | Logs 70, Follow 86 | Refresh 94, Delete 86 with the
// gaps comes to 511px. Labels fold from the end, each 28px folded: Delete,
// Refresh, Follow, Logs, Stop, down to 245px; at 150px only Run and Stop fit
// beside the `…` button.
const GROUPS: ToolbarItem[][] = [
  [
    { key: 'run', label: 'Run', icon, onClick: noop, primary: true },
    { key: 'stop', label: 'Stop', icon, onClick: noop },
  ],
  [
    { key: 'logs', label: 'Logs', icon, href: '/logs', target: '_blank' },
    { key: 'follow', label: 'Follow', icon, onClick: noop, checked: true },
  ],
]
const RIGHT: ToolbarItem[] = [
  { key: 'refresh', label: 'Refresh', icon, onClick: noop },
  {
    key: 'delete',
    label: 'Delete',
    icon,
    onClick: noop,
    destructive: true,
    disabled: true,
    disabledReason: 'Stop it first',
  },
]

function renderAt(width: number) {
  layOut(width)
  return render(<ActionToolbar label="Cluster controls" groups={GROUPS} right={RIGHT} />)
}

const menuButton = () => screen.queryByRole('button', { name: 'More actions' })

describe('ActionToolbar fitting its width', () => {
  it('shows every label in one row when there is room', () => {
    renderAt(800)
    expect(screen.getByRole('button', { name: 'Stop' })).toHaveTextContent('Stop')
    expect(screen.getByRole('button', { name: 'Stop' }).querySelector('.sr-only')).toBeNull()
    expect(menuButton()).toBeNull()
  })

  it('folds labels one at a time from the end, keeping each as the name', () => {
    // Delete and Refresh folded make 387px; Follow folded too, 329px.
    renderAt(400)
    expect(menuButton()).toBeNull()
    const folded = (name: string | RegExp) =>
      screen.getByRole('button', { name }).querySelector('.sr-only:first-of-type')?.textContent
    // Named by its label still, which only a screen reader and the tooltip show.
    expect(folded('Refresh')).toBe('Refresh')
    expect(folded(/^Delete/)).toBe('Delete')
    expect(folded('Follow')).toBeUndefined()
    expect(folded('Stop')).toBeUndefined()
    expect(folded('Run')).toBeUndefined()
  })

  it('folds the earlier groups only once the later ones are folded', () => {
    // Everything but Run and Stop folded makes 287px.
    renderAt(300)
    expect(menuButton()).toBeNull()
    const label = (name: string) => screen.getByRole('button', { name }).querySelector('.sr-only')
    expect(label('Follow')).toHaveTextContent('Follow')
    expect(screen.getByRole('link', { name: /^Logs/ }).querySelector('.sr-only')).not.toBeNull()
    expect(label('Stop')).toBeNull()
  })

  it('then moves the right-hand actions into the menu, then the last group, never the primary', () => {
    renderAt(150)
    expect(menuButton()).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Run' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Refresh' })).toBeNull()
    // The menu keeps its rows mounted while closed: a toggle checked, a link a
    // link, a destructive one in the error color and a disabled one with its reason.
    expect(screen.getByRole('menuitemcheckbox', { name: 'Follow', hidden: true })).toHaveAttribute(
      'aria-checked',
      'true',
    )
    const logs = screen.getByRole('menuitem', { name: /^Logs/, hidden: true })
    expect(logs).toHaveAttribute('href', '/logs')
    expect(logs).toHaveAttribute('target', '_blank')
    const remove = screen.getByRole('menuitem', { name: /^Delete\W+Stop it first$/, hidden: true })
    expect(remove).toHaveAttribute('aria-disabled', 'true')
    expect(remove.className).toContain('text-(--theme-error-text)')
  })

  it('reaches the menu with the arrow keys, as one of its items', async () => {
    renderAt(150)
    const stop = screen.getByRole('button', { name: 'Stop' })
    act(() => stop.focus())
    fireEvent.keyDown(stop, { key: 'ArrowRight' })
    await waitFor(() => expect(menuButton()).toHaveFocus())
  })
})

describe('fitToolbar', () => {
  const item = (key: string, full: number, primary = false): ItemWidth => ({
    key,
    full,
    folded: 28,
    primary,
  })
  const groups = [[item('run', 80, true), item('stop', 80)], [item('logs', 80)]]
  // With no icon, it keeps its label folded.
  const right = [{ ...item('refresh', 80), folded: 80 }]

  // Full, it is 355px. Logs folds first (303px), then Stop (251px); Refresh
  // has no icon, so it doesn't fold but moves first.
  it('folds labels from the end, then moves items from the end, folding the primary last', () => {
    expect(fitToolbar(groups, right, 1000)).toEqual({ folded: [], overflow: [] })
    expect(fitToolbar(groups, right, 320)).toEqual({ folded: ['logs'], overflow: [] })
    expect(fitToolbar(groups, right, 260)).toEqual({ folded: ['logs', 'stop'], overflow: [] })
    expect(fitToolbar(groups, right, 200)).toEqual({
      folded: ['logs', 'stop'],
      overflow: ['refresh'],
    })
    expect(fitToolbar(groups, right, 150).overflow).toEqual(['refresh', 'logs'])
    expect(fitToolbar(groups, right, 50)).toEqual({
      folded: ['logs', 'stop', 'run'],
      overflow: ['refresh', 'logs', 'stop'],
    })
  })
})

describe('ActionToolbar toggles', () => {
  it('say whether they are pressed, disabled ones and ones moved into the menu too', () => {
    layOut(100)
    render(
      <ActionToolbar
        groups={[
          [
            { key: 'refresh', label: 'Auto refresh', icon, onClick: () => {}, checked: true },
            {
              key: 'follow',
              label: 'Follow',
              icon,
              onClick: () => {},
              checked: false,
              disabled: true,
            },
          ],
        ]}
        right={[
          { key: 'graph', label: 'Graph', icon, onClick: () => {}, checked: true },
          { key: 'editor', label: 'Editor', icon, onClick: () => {}, checked: false },
        ]}
      />,
    )
    expect(screen.getByRole('button', { name: 'Auto refresh' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(screen.getByRole('button', { name: 'Follow' })).toHaveAttribute('aria-pressed', 'false')
    // The menu keeps its rows mounted while closed.
    expect(screen.getByRole('menuitemcheckbox', { name: 'Graph', hidden: true })).toHaveAttribute(
      'aria-checked',
      'true',
    )
    expect(screen.getByRole('menuitemcheckbox', { name: 'Editor', hidden: true })).toHaveAttribute(
      'aria-checked',
      'false',
    )
  })
})

describe('ActionToolbar', () => {
  it('is one named toolbar whose disabled actions stay reachable and say why', () => {
    render(
      <ActionToolbar
        label="Cluster controls"
        groups={[
          [
            { key: 'open', label: 'Open', icon, href: '/open', primary: true },
            {
              key: 'logs',
              label: 'Logs',
              icon,
              href: '/logs',
              disabled: true,
              disabledReason: 'No logs yet',
            },
            {
              key: 'delete',
              label: 'Delete',
              icon,
              onClick: () => {},
              destructive: true,
              disabled: true,
              disabledReason: 'Stop it first',
            },
          ],
        ]}
      />,
    )
    const toolbar = screen.getByRole('toolbar', { name: 'Cluster controls' })
    expect(toolbar).toContainElement(screen.getByRole('link', { name: 'Open' }))
    const remove = screen.getByRole('button', { name: 'Delete. Stop it first' })
    expect(remove).toHaveAttribute('aria-disabled', 'true')
    expect(remove).not.toHaveAttribute('disabled')
    // A disabled link stays a link, in the toolbar's arrow-key order, going nowhere.
    const logs = screen.getByRole('link', { name: 'Logs. No logs yet' })
    expect(logs).toHaveAttribute('aria-disabled', 'true')
    expect(logs).not.toHaveAttribute('href')
    expect(logs).toHaveAttribute('tabindex', '-1')
  })

  it('warns once when two actions share an icon component', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const Same = () => <svg />
    const groups = [
      [
        { key: 'a', label: 'Refresh', icon: <Same />, onClick: noop },
        { key: 'b', label: 'Auto refresh', icon: <Same />, onClick: noop, checked: true },
      ],
    ]
    const { rerender } = render(<ActionToolbar groups={groups} />)
    rerender(<ActionToolbar groups={groups} />)
    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('"Refresh", "Auto refresh" share an icon'),
    )
  })

  it('warns once when more than one action is primary', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const groups = [
      [
        { key: 'a', label: 'Start', icon, onClick: () => {}, primary: true },
        { key: 'b', label: 'Stop', icon, onClick: () => {}, primary: true },
      ],
    ]
    const { rerender } = render(<ActionToolbar groups={groups} />)
    rerender(<ActionToolbar groups={groups} />)
    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('"Start", "Stop" are all primary'))
    warn.mockRestore()
  })
})

describe('a busy toolbar action', () => {
  it('shows a spinner, keeps focus and can’t be pressed again', () => {
    const onClick = vi.fn()
    render(
      <ActionToolbar
        groups={[[{ key: 'refresh', label: 'Refresh', icon, onClick, loading: true }]]}
      />,
    )
    const refresh = screen.getByRole('button', { name: 'Refresh' })
    expect(refresh).toHaveAttribute('aria-busy', 'true')
    expect(refresh).not.toBeDisabled()
    fireEvent.click(refresh)
    expect(onClick).not.toHaveBeenCalled()
  })
})
