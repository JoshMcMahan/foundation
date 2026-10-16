// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { ChatConfigProvider, resolveChatConfig } from '../ai/core/config'
import { SidebarRailItem } from '../ai/ui/sidebar'
import { ToolbarButton } from '../list/ActionToolbar'
import { ListRow } from '../list/ListPage'
import { NameCell } from '../list/ListTable'
import { ActionMenu } from './ActionMenu'
import { AppLink } from './AppLink'
import { Button, MethodButton } from './Button'
import { Card } from './Card'
import { IconButton } from './IconButton'
import { PageHeader } from './PageHeader'
import { PageHeaderAction, PageHeaderAddButton } from './PageHeaderAction'
import { Pagination } from './Pagination'
import { type UILinkComponent, UIProvider } from './Provider'
import { Table } from './Table'
import { Tabs } from './Tabs'
import { toast } from './Toast'

// A full in-app URL, search and hash included, as hosts must route it.
const HREF = '/runs/42?tab=logs#step-3'

// Stands in for a host router's Link: it marks what it renders, and like a
// router takes over only a plain click.
const routed: string[] = []
const RouterLink: UILinkComponent = ({ href, onClick, ...props }) => (
  <a
    {...props}
    href={href}
    data-router-link=""
    onClick={(e) => {
      onClick?.(e)
      if (!e.defaultPrevented && e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey) {
        e.preventDefault()
        routed.push(href)
      }
    }}
  />
)

function renderWithRouter(ui: ReactNode) {
  return render(<UIProvider slots={{ link: RouterLink }}>{ui}</UIProvider>)
}

afterEach(() => {
  cleanup()
  routed.length = 0
  act(() => toast.dismiss())
})

/** Each surface renders its href through the host's link, which gets the whole URL. */
const surfaces: [string, () => ReactNode, string | RegExp, ('link' | 'tab')?][] = [
  ['Button', () => <Button href={HREF}>Open</Button>, 'Open'],
  ['IconButton', () => <IconButton href={HREF} label="Open" icon="→" />, 'Open'],
  ['MethodButton', () => <MethodButton href={HREF} label="Open" />, /Open/],
  ['Card', () => <Card href={HREF}>Open</Card>, 'Open'],
  ['PageHeaderAddButton', () => <PageHeaderAddButton href={HREF} label="Open" />, 'Open'],
  [
    'PageHeaderAction',
    () => <PageHeaderAction href={HREF} label="Open" icon={() => null} />,
    'Open',
  ],
  [
    'PageHeader crumb',
    () => <PageHeader breadcrumbs={[{ label: 'Open', href: HREF }, { label: 'Run' }]} />,
    'Open',
  ],
  [
    'Tabs',
    () => (
      <Tabs
        label="Run"
        value="b"
        items={[
          { value: 'a', label: 'Open', href: HREF },
          { value: 'b', label: 'Here', href: '/runs/42' },
        ]}
      />
    ),
    'Open',
    // A tab that is a page keeps the tab role on its anchor.
    'tab',
  ],
  [
    'Pagination',
    () => <Pagination page={0} pageSize={10} total={30} pageHref={() => HREF} />,
    /next/i,
  ],
  [
    'ToolbarButton',
    () => <ToolbarButton action={{ key: 'open', label: 'Open', href: HREF }} />,
    'Open',
  ],
  [
    'NameCell',
    () => (
      <table>
        <tbody>
          <tr>
            <NameCell icon={null} name="Open" href={HREF} />
          </tr>
        </tbody>
      </table>
    ),
    'Open',
  ],
  [
    'ListRow pinned action',
    () => (
      <table>
        <tbody>
          <ListRow
            href={null}
            items={[]}
            goTo={() => {}}
            openMenu={() => {}}
            pinnedActions={[{ key: 'open', label: 'Open', icon: '→', href: HREF }]}
          >
            <Table.Item>row</Table.Item>
          </ListRow>
        </tbody>
      </table>
    ),
    'Open',
  ],
  [
    'SidebarRailItem',
    () => (
      <ul>
        <SidebarRailItem selected={false} label="Open" href={HREF}>
          •
        </SidebarRailItem>
      </ul>
    ),
    'Open',
  ],
  [
    'chat default link',
    () => {
      const { LinkComponent } = resolveChatConfig()
      return (
        <ChatConfigProvider value={resolveChatConfig()}>
          <LinkComponent target={{ kind: 'external', href: HREF }}>Open</LinkComponent>
        </ChatConfigProvider>
      )
    },
    'Open',
  ],
]

describe.each(surfaces)('%s', (_, ui, name, role = 'link') => {
  it('is a link through the host’s router with the full href', () => {
    renderWithRouter(ui())
    const link = screen.getByRole(role, { name })
    expect(link.tagName).toBe('A')
    expect(link).toHaveAttribute('href', HREF)
    expect(link).toHaveAttribute('data-router-link')
  })

  it('routes a plain click and leaves a modified or middle click to the browser', () => {
    renderWithRouter(ui())
    const link = screen.getByRole(role, { name })
    expect(fireEvent.click(link, { ctrlKey: true })).toBe(true)
    expect(fireEvent.click(link, { metaKey: true })).toBe(true)
    expect(fireEvent.click(link, { button: 1 })).toBe(true)
    expect(routed).toEqual([])
    fireEvent.click(link)
    expect(routed).toEqual([HREF])
  })
})

describe('menu link row', () => {
  it('is a link through the host’s router, as a folded crumb or any menu href is', async () => {
    renderWithRouter(
      <ActionMenu label="More" items={[{ label: 'Storage', href: HREF }]}>
        …
      </ActionMenu>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'More' }))
    const row = await screen.findByRole('menuitem', { name: 'Storage' })
    expect(row.tagName).toBe('A')
    expect(row).toHaveAttribute('href', HREF)
    expect(row).toHaveAttribute('data-router-link')
  })
})

describe('a link action with target _blank', () => {
  const action = {
    key: 'console',
    label: 'Console',
    icon: '↗',
    href: HREF,
    target: '_blank',
  } as const
  const expectNewTab = (link: HTMLElement) => {
    expect(link).toHaveAttribute('href', HREF)
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
    expect(link).toHaveTextContent('(opens in a new tab)')
  }

  it('opens a menu row in a new tab', async () => {
    renderWithRouter(
      <ActionMenu label="More" items={[action]}>
        …
      </ActionMenu>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'More' }))
    expectNewTab(await screen.findByRole('menuitem', { name: /Console/ }))
  })

  it('opens a toolbar button in a new tab', () => {
    renderWithRouter(<ToolbarButton action={action} />)
    expectNewTab(screen.getByRole('link', { name: /Console/ }))
  })

  it('opens a pinned row action in a new tab', () => {
    renderWithRouter(
      <table>
        <tbody>
          <ListRow
            href={null}
            items={[]}
            goTo={() => {}}
            openMenu={() => {}}
            pinnedActions={[action]}
          >
            <Table.Item>row</Table.Item>
          </ListRow>
        </tbody>
      </table>,
    )
    // Its name is the aria-label; the new tab rides in its content.
    expectNewTab(screen.getByRole('link', { name: 'Console' }))
  })
})

describe('Toast link action', () => {
  it('is a link through the host’s router, and closes the toast', async () => {
    renderWithRouter(null)
    act(() => {
      toast.info('Run started', { action: { label: 'View run', href: HREF } })
    })
    const link = await screen.findByRole('link', { name: 'View run' })
    expect(link).toHaveAttribute('href', HREF)
    expect(link).toHaveAttribute('data-router-link')
    fireEvent.click(link)
    expect(routed).toEqual([HREF])
  })
})

describe('AppLink', () => {
  it.each([
    ['mailto:help@example.com', 'Email us'],
    ['tel:+15555550123', 'Call us'],
  ])('hands %s to the browser, not the router', (href, name) => {
    renderWithRouter(<AppLink href={href}>{name}</AppLink>)
    const link = screen.getByRole('link', { name })
    expect(link).toHaveAttribute('href', href)
    expect(link).not.toHaveAttribute('data-router-link')
  })

  it('loads the page with a plain anchor for reloadDocument', () => {
    renderWithRouter(
      <AppLink href="/api/export?format=csv" reloadDocument>
        Export
      </AppLink>,
    )
    const link = screen.getByRole('link', { name: 'Export' })
    expect(link).toHaveAttribute('href', '/api/export?format=csv')
    expect(link).not.toHaveAttribute('data-router-link')
  })

  it('leaves another origin to the browser, cutting a new tab’s hold on this page', () => {
    renderWithRouter(
      <AppLink href="https://example.com/docs" target="_blank">
        Docs
      </AppLink>,
    )
    const link = screen.getByRole('link', { name: /^Docs/ })
    expect(link).not.toHaveAttribute('data-router-link')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  })

  it('routes an absolute URL on this origin', () => {
    const own = `${window.location.origin}${HREF}`
    renderWithRouter(<AppLink href={own}>Own</AppLink>)
    expect(screen.getByRole('link', { name: 'Own' })).toHaveAttribute('data-router-link')
  })

  it.each([
    ['//evil.example/a'],
    ['/\\evil.example/a'],
    ['\\\\evil.example/a'],
    ['\\/evil.example/a'],
    [' //evil.example/a'],
  ])('hands %j, which a browser opens on another host, to the browser', (href) => {
    renderWithRouter(<AppLink href={href}>Away</AppLink>)
    const link = screen.getByRole('link', { name: 'Away' })
    expect(new URL(link.getAttribute('href') ?? '', window.location.href).host).toBe('evil.example')
    expect(link).not.toHaveAttribute('data-router-link')
  })

  it.each([['/ok'], ['?q=1'], ['#a'], ['runs/42']])('routes %j in the app', (href) => {
    renderWithRouter(<AppLink href={href}>Here</AppLink>)
    expect(screen.getByRole('link', { name: 'Here' })).toHaveAttribute('data-router-link')
  })

  it('hands a blob: URL on this origin to the browser', () => {
    renderWithRouter(<AppLink href={`blob:${window.location.origin}/0f1e`}>File</AppLink>)
    expect(screen.getByRole('link', { name: 'File' })).not.toHaveAttribute('data-router-link')
  })

  it('is a focusable link that goes nowhere while disabled', () => {
    const onClick = vi.fn()
    renderWithRouter(
      <Button href={HREF} disabled onClick={onClick}>
        Open
      </Button>,
    )
    const link = screen.getByRole('link', { name: 'Open' })
    expect(link).not.toHaveAttribute('href')
    expect(link).toHaveAttribute('aria-disabled', 'true')
    act(() => link.focus())
    expect(link).toHaveFocus()
    fireEvent.click(link)
    expect(onClick).not.toHaveBeenCalled()
  })

  it('drops an href that would run script', () => {
    // Built up so the lint that flags a script URL in source lets the test name one.
    const script = ['javascript', 'alert(1)'].join(':')
    renderWithRouter(<AppLink href={script}>Bad</AppLink>)
    expect(screen.getByRole('link', { name: 'Bad' })).not.toHaveAttribute('href')
  })
})

describe('SidebarRailItem with href', () => {
  it('runs onSelect for a plain click only', () => {
    const onSelect = vi.fn()
    renderWithRouter(
      <ul>
        <SidebarRailItem selected={false} label="Task" href={HREF} onSelect={onSelect}>
          •
        </SidebarRailItem>
      </ul>,
    )
    const link = screen.getByRole('link', { name: 'Task' })
    fireEvent.click(link, { metaKey: true })
    expect(onSelect).not.toHaveBeenCalled()
    fireEvent.click(link)
    expect(onSelect).toHaveBeenCalledOnce()
  })
})

describe('ListRow with href', () => {
  function renderRow(goTo: (to: string) => void, selectionActive = false) {
    return renderWithRouter(
      <table>
        <tbody>
          <ListRow
            href={HREF}
            items={[]}
            goTo={goTo}
            openMenu={() => {}}
            selectionActive={selectionActive}
            onRowSelect={() => {}}
          >
            <NameCell icon={null} name="gpu-cluster" href={HREF} />
            <Table.Item>ready</Table.Item>
          </ListRow>
        </tbody>
      </table>,
    )
  }

  it('makes its name link cover the row', () => {
    renderRow(() => {})
    expect(screen.getByRole('link', { name: 'gpu-cluster' })).toHaveAttribute('data-row-link')
  })

  it('keeps the link in its cell while selecting', () => {
    renderRow(() => {}, true)
    expect(screen.getByRole('link', { name: 'gpu-cluster' })).not.toHaveAttribute('data-row-link')
  })

  it('goes there on a plain click the link misses, and not on a modified one', () => {
    const goTo = vi.fn()
    renderRow(goTo)
    const cell = screen.getByText('ready')
    fireEvent.click(cell, { ctrlKey: true })
    expect(goTo).not.toHaveBeenCalled()
    fireEvent.click(cell)
    expect(goTo).toHaveBeenCalledWith(HREF)
  })
})
