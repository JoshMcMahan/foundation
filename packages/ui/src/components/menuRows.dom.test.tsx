// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MoreButton, rowContextMenuProps } from '../list/rowMenu'
import { ActionMenu } from './ActionMenu'
import { ContextMenuProvider, useContextMenu, useOpenMenu } from './ContextMenu'
import { ariaKeyShortcut, type MenuEntry } from './MenuEntries'
import { UIProvider } from './Provider'

const run = () => {}

function Menu({ items, label = 'Actions' }: { items: MenuEntry[]; label?: string }) {
  return (
    <ActionMenu label={label} items={items} triggerClassName="trigger">
      {label}
    </ActionMenu>
  )
}

const openMenu = async (name = 'Actions') => {
  fireEvent.click(screen.getByRole('button', { name }))
  return screen.findByRole('menu')
}

describe('menu rows', () => {
  it('reads a description line with the row and lets a search find it', async () => {
    render(
      <ActionMenu
        label="Switch"
        search={{ placeholder: 'Search', empty: 'None' }}
        items={[
          { label: 'Compute', description: 'Clusters, sessions', onClick: run },
          { label: 'Storage', description: 'Buckets, disks', onClick: run },
        ]}
      >
        Switch
      </ActionMenu>,
    )
    await openMenu('Switch')
    expect(screen.getByRole('menuitem', { name: /Compute/ })).toHaveTextContent(
      'Clusters, sessions',
    )
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search' }), {
      target: { value: 'disks' },
    })
    expect(screen.getByRole('menuitem', { name: /Storage/ })).toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: /Compute/ })).toBeNull()
  })

  it('shows a shortcut as text and names it for assistive technology', async () => {
    render(
      <Menu
        items={[
          { label: 'Status', shortcut: 'S', items: [{ label: 'Done', onClick: run }] },
          { label: 'Clear', shortcut: '⌘K', onClick: run },
        ]}
      />,
    )
    await openMenu()
    expect(screen.getByRole('menuitem', { name: /Status/ })).toHaveAttribute(
      'aria-keyshortcuts',
      'S',
    )
    const clear = screen.getByRole('menuitem', { name: /Clear/ })
    expect(clear).toHaveAttribute('aria-keyshortcuts', 'Meta+K')
    expect(clear).toHaveTextContent('⌘K')
  })

  it('spells shortcuts as aria-keyshortcuts does', () => {
    expect(ariaKeyShortcut('⌘⇧P')).toBe('Meta+Shift+P')
    expect(ariaKeyShortcut('Ctrl+Enter')).toBe('Ctrl+Enter')
    expect(ariaKeyShortcut('a')).toBe('A')
    expect(ariaKeyShortcut(undefined)).toBeUndefined()
  })

  it('marks the current page and keeps the row’s icon', async () => {
    render(
      <Menu
        items={[
          { label: 'North', icon: <span data-testid="north-dot" />, href: '/north', current: true },
          { label: 'South', href: '/south' },
        ]}
      />,
    )
    await openMenu()
    const north = screen.getByRole('menuitem', { name: 'North' })
    expect(north).toHaveAttribute('aria-current', 'page')
    expect(within(north).getByTestId('north-dot')).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'South' })).not.toHaveAttribute('aria-current')
  })

  it('says a link opens a new tab', async () => {
    render(
      <Menu items={[{ label: 'Guide', href: 'https://example.com/guide', target: '_blank' }]} />,
    )
    await openMenu()
    expect(
      screen.getByRole('menuitem', { name: /^Guide\s*\(opens in a new tab\)$/ }),
    ).toHaveAttribute('target', '_blank')
  })

  it('names a group by its heading', async () => {
    render(
      <Menu items={[{ group: 'Switch product', items: [{ label: 'Compute', onClick: run }] }]} />,
    )
    await openMenu()
    const group = screen.getByRole('group', { name: 'Switch product' })
    expect(within(group).getByRole('menuitem', { name: 'Compute' })).toBeInTheDocument()
  })

  it('keeps a disabled submenu closed and says why', async () => {
    render(
      <Menu
        items={[
          {
            label: 'Labels',
            disabled: true,
            disabledReason: 'No labels yet',
            items: [{ label: 'Bug', onClick: run }],
          },
        ]}
      />,
    )
    await openMenu()
    const labels = screen.getByRole('menuitem', { name: 'Labels. No labels yet' })
    expect(labels).toHaveAttribute('aria-disabled', 'true')
    fireEvent.click(labels)
    expect(screen.queryByRole('menuitem', { name: 'Bug' })).toBeNull()
  })

  it('hides a badge from screen readers', async () => {
    render(
      <Menu
        items={[{ label: 'Changelog, new', badge: <span data-testid="dot">•</span>, onClick: run }]}
      />,
    )
    await openMenu()
    expect(screen.getByRole('menuitem', { name: 'Changelog, new' })).toBeInTheDocument()
    expect(screen.getByTestId('dot').closest('[aria-hidden="true"]')).not.toBeNull()
  })
})

describe('ActionMenu', () => {
  it('takes a trigger of its own, named by its text, without a tooltip', async () => {
    render(
      <ActionMenu
        label="Export"
        items={[{ label: 'CSV', onClick: run }]}
        trigger={<button type="button">Export as</button>}
      />,
    )
    const trigger = screen.getByRole('button', { name: 'Export as' })
    expect(trigger).toHaveAttribute('aria-haspopup', 'menu')
    fireEvent.click(trigger)
    expect(await screen.findByRole('menu', { name: 'Export' })).toBeInTheDocument()
  })

  it('can’t open while disabled', () => {
    render(
      <ActionMenu label="More" disabled items={[{ label: 'Rename', onClick: run }]}>
        More
      </ActionMenu>,
    )
    const trigger = screen.getByRole('button', { name: 'More' })
    expect(trigger).toBeDisabled()
    fireEvent.click(trigger)
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('says when it has nothing to show', async () => {
    render(
      <ActionMenu label="Connect" items={[]} empty="No connected resources">
        Connect
      </ActionMenu>,
    )
    await openMenu('Connect')
    expect(screen.getByText('No connected resources')).toBeInTheDocument()
  })

  it('pins a footer action last, after a header that is not a choice', async () => {
    const seeAll = vi.fn()
    render(
      <ActionMenu
        label="Organizations"
        header={<span>Signed in as Ada</span>}
        footer={{ label: 'See all', onClick: seeAll }}
        items={[{ label: 'North', onClick: run }]}
      >
        Organizations
      </ActionMenu>,
    )
    const menu = await openMenu('Organizations')
    const rows = within(menu).getAllByRole('menuitem')
    expect(rows.map((row) => row.textContent)).toEqual(['North', 'See all'])
    expect(within(menu).getByText('Signed in as Ada').closest('[role="menuitem"]')).toBeNull()
    fireEvent.click(rows[1] as HTMLElement)
    expect(seeAll).toHaveBeenCalledOnce()
  })
})

describe('the shared menu', () => {
  function Rows() {
    const openMenu = useOpenMenu()
    return (
      <>
        <button
          type="button"
          onClick={(e) => openMenu(e.currentTarget, [{ label: 'Rename', onClick: run }])}
        >
          Open
        </button>
        <div
          data-testid="row"
          {...rowContextMenuProps(openMenu, [{ label: 'Archive', onClick: run }])}
        />
      </>
    )
  }

  it('opens from anywhere below UIProvider without rendering a menu', async () => {
    render(
      <UIProvider>
        <Rows />
      </UIProvider>,
    )
    fireEvent.contextMenu(screen.getByTestId('row'), { clientX: 10, clientY: 10 })
    expect(await screen.findByRole('menuitem', { name: 'Archive' })).toBeInTheDocument()
  })

  it('leaves Shift+right-click to the browser', () => {
    render(
      <ContextMenuProvider>
        <Rows />
      </ContextMenuProvider>,
    )
    const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, shiftKey: true })
    act(() => {
      screen.getByTestId('row').dispatchEvent(event)
    })
    expect(event.defaultPrevented).toBe(false)
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('closes on a second press of the button that opened it', async () => {
    render(
      <ContextMenuProvider>
        <Rows />
      </ContextMenuProvider>,
    )
    const button = screen.getByRole('button', { name: 'Open' })
    fireEvent.click(button)
    await screen.findByRole('menu')
    fireEvent.pointerDown(button)
    fireEvent.mouseDown(button)
    fireEvent.click(button)
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull())
  })

  it('opens a more button’s items and says it is expanded', async () => {
    render(
      <UIProvider>
        <MoreButton items={() => [{ label: 'Rename', onClick: run }]} />
      </UIProvider>,
    )
    const button = screen.getByRole('button', { name: 'More actions' })
    fireEvent.click(button)
    expect(await screen.findByRole('menuitem', { name: 'Rename' })).toBeInTheDocument()
    await waitFor(() => expect(button).toHaveAttribute('aria-expanded', 'true'))
  })

  it('keeps a scoped menu working beside the shared one', async () => {
    function Scoped() {
      const { openMenu, contextMenu } = useContextMenu()
      return (
        <>
          <button
            type="button"
            onClick={(e) => openMenu(e.currentTarget, [{ label: 'Here', onClick: run }])}
          >
            Scoped
          </button>
          {contextMenu}
        </>
      )
    }
    render(
      <UIProvider>
        <Scoped />
      </UIProvider>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Scoped' }))
    expect(await screen.findByRole('menuitem', { name: 'Here' })).toBeInTheDocument()
  })
})
