// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { createContext, type ReactNode, use, useState } from 'react'
import { openTooltip } from '../test/tooltip'
import { type Breadcrumb, PageHeader, PageHeaderBar, PageHeaderProvider } from './PageHeader'
import { PageHeaderAction, PageHeaderAddButton, PageHeaderMenu } from './PageHeaderAction'
import { PageHeaderStore } from './pageHeaderStore'

const Icon = ({ className }: { className?: string }) => <svg className={className} />

function Shell({ children, persistent }: { children: ReactNode; persistent?: boolean }) {
  return (
    <PageHeaderProvider>
      <header data-testid="bar">
        <PageHeaderBar persistent={persistent} />
      </header>
      <main data-testid="page">{children}</main>
    </PageHeaderProvider>
  )
}

const bar = () => within(screen.getByTestId('bar'))
const trail: Breadcrumb[] = [
  { label: 'Storage', href: '/storage' },
  { label: 'Buckets', href: '/storage/buckets' },
  { label: 'training-data' },
]

describe('PageHeader in a shell', () => {
  it('renders the trail as an ordered list in a named landmark, the page as its h1', () => {
    render(
      <Shell>
        <PageHeader breadcrumbs={trail} />
      </Shell>,
    )
    const nav = bar().getByRole('navigation', { name: 'Breadcrumb' })
    expect(nav.querySelector('ol')).toBeInTheDocument()
    expect(within(nav).getAllByRole('listitem')).toHaveLength(3)
    expect(within(nav).getByRole('link', { name: 'Buckets' })).toHaveAttribute(
      'href',
      '/storage/buckets',
    )
    const title = screen.getByRole('heading', { level: 1 })
    expect(title).toHaveTextContent('training-data')
    expect(title).toHaveAttribute('aria-current', 'page')
    expect(within(nav).queryByRole('link', { name: 'training-data' })).toBeNull()
    expect(screen.getByTestId('page')).toBeEmptyDOMElement()
  })

  it('shows the actions in the bar from the first render, with the page’s context', () => {
    const Scope = createContext('none')
    function Reader() {
      return <span>{use(Scope)}</span>
    }
    render(
      <Shell>
        <Scope value="page context">
          <PageHeader
            breadcrumbs={trail}
            titleActions={<Reader />}
            actions={<button type="button">Save</button>}
          />
        </Scope>
      </Shell>,
    )
    expect(bar().getByRole('button', { name: 'Save' })).toBeInTheDocument()
    expect(bar().getByText('page context')).toBeInTheDocument()
  })

  it('follows the page as it changes its trail and actions', () => {
    function Page({ name, dirty }: { name: string; dirty: boolean }) {
      return (
        <PageHeader
          breadcrumbs={[{ label: 'Buckets', href: '/b' }, { label: name }]}
          actions={dirty && <button type="button">Save</button>}
        />
      )
    }
    const { rerender } = render(
      <Shell>
        <Page name="" dirty={false} />
      </Shell>,
    )
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Loading')
    rerender(
      <Shell>
        <Page name="training-data" dirty />
      </Shell>,
    )
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('training-data')
    expect(bar().getByRole('button', { name: 'Save' })).toBeInTheDocument()
    rerender(
      <Shell>
        <Page name="training-data" dirty={false} />
      </Shell>,
    )
    expect(bar().queryByRole('button', { name: 'Save' })).toBeNull()
  })

  it('leaves nothing behind when the page unmounts or another replaces it', () => {
    function App({ page }: { page: 'list' | 'detail' | 'none' }) {
      if (page === 'none') {
        return null
      }
      return page === 'list' ? (
        <PageHeader
          breadcrumbs={[{ label: 'Buckets' }]}
          actions={<button type="button">New</button>}
        />
      ) : (
        <PageHeader breadcrumbs={trail} actions={<button type="button">Delete</button>} />
      )
    }
    const { rerender } = render(
      <Shell>
        <App page="list" />
      </Shell>,
    )
    rerender(
      <Shell>
        <App page="detail" />
      </Shell>,
    )
    expect(bar().queryByRole('button', { name: 'New' })).toBeNull()
    expect(bar().getByRole('button', { name: 'Delete' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('training-data')
    rerender(
      <Shell>
        <App page="none" />
      </Shell>,
    )
    expect(screen.getByTestId('bar')).toBeEmptyDOMElement()
  })

  it('gives the page’s trail precedence over its layout’s, however the layout updates', () => {
    function Layout({ org, children }: { org: string; children: ReactNode }) {
      return (
        <>
          <PageHeader
            breadcrumbs={[{ label: org, href: '/org' }, { label: 'Members' }]}
            titleActions={<button type="button">Layout menu</button>}
          />
          {children}
        </>
      )
    }
    const page = (
      <PageHeader
        breadcrumbs={[{ label: 'demo', href: '/org' }, { label: 'Add member' }]}
        actions={<button type="button">Save</button>}
      />
    )
    const { rerender } = render(
      <Shell>
        <Layout org="demo">{page}</Layout>
      </Shell>,
    )
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Add member')
    rerender(
      <Shell>
        <Layout org="Demo Organization">{page}</Layout>
      </Shell>,
    )
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Add member')
    const buttons = bar().getAllByRole('button')
    expect(buttons.map((b) => b.textContent)).toEqual(['Layout menu', 'Save'])
  })

  it('falls back to the layout’s trail on a page that names none', () => {
    render(
      <Shell>
        <PageHeader breadcrumbs={[{ label: 'demo', href: '/org' }, { label: 'Members' }]} />
        <PageHeader actions={<button type="button">Invite</button>} />
      </Shell>,
    )
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Members')
    expect(bar().getByRole('button', { name: 'Invite' })).toBeInTheDocument()
  })

  it('hides the bar while a page asks, even a persistent one', () => {
    const { rerender } = render(
      <Shell persistent>
        <PageHeader breadcrumbs={trail} hidden />
      </Shell>,
    )
    expect(screen.getByTestId('bar')).toBeEmptyDOMElement()
    rerender(
      <Shell persistent>
        <PageHeader breadcrumbs={trail} />
      </Shell>,
    )
    expect(bar().getByRole('heading', { level: 1 })).toBeInTheDocument()
  })

  it('keeps a persistent bar when the page declares nothing', () => {
    const { rerender } = render(<Shell persistent>{null}</Shell>)
    expect(screen.getByTestId('bar')).not.toBeEmptyDOMElement()
    rerender(<Shell>{null}</Shell>)
    expect(screen.getByTestId('bar')).toBeEmptyDOMElement()
  })

  it('keeps an action’s state when the bar hides and returns', () => {
    function Counter() {
      const [n, setN] = useState(0)
      return (
        <button type="button" onClick={() => setN(n + 1)}>
          Clicked {n}
        </button>
      )
    }
    function Page({ hidden }: { hidden: boolean }) {
      return <PageHeader breadcrumbs={trail} hidden={hidden} actions={<Counter />} />
    }
    const { rerender } = render(
      <Shell>
        <Page hidden={false} />
      </Shell>,
    )
    fireEvent.click(bar().getByRole('button', { name: 'Clicked 0' }))
    rerender(
      <Shell>
        <Page hidden />
      </Shell>,
    )
    rerender(
      <Shell>
        <Page hidden={false} />
      </Shell>,
    )
    expect(bar().getByRole('button', { name: 'Clicked 1' })).toBeInTheDocument()
  })

  it('needs a provider for the bar', () => {
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => render(<PageHeaderBar />)).toThrow(/PageHeaderProvider/)
    quiet.mockRestore()
  })
})

describe('a trail too wide for its bar', () => {
  afterEach(() => vi.restoreAllMocks())

  it('folds all but the parent into a menu of links', () => {
    // jsdom lays nothing out: make the trail's natural width exceed the row.
    vi.spyOn(HTMLElement.prototype, 'scrollWidth', 'get').mockReturnValue(1000)
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(300)
    render(
      <Shell>
        <PageHeader
          breadcrumbs={[
            { label: 'Organizations', href: '/org' },
            { label: 'Research', href: '/org/research' },
            { label: 'Cloud accounts', href: '/org/research/cloud' },
            { label: 'production' },
          ]}
        />
      </Shell>,
    )
    const nav = screen.getByRole('navigation', { name: 'Breadcrumb' })
    expect(within(nav).queryByRole('link', { name: 'Organizations' })).toBeNull()
    expect(within(nav).getByRole('link', { name: 'Cloud accounts' })).toBeInTheDocument()
    fireEvent.click(within(nav).getByRole('button', { name: 'Show full path' }))
    expect(screen.getByRole('menuitem', { name: 'Research' }).closest('a')).toHaveAttribute(
      'href',
      '/org/research',
    )
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('production')
  })

  it('shows every crumb while it fits', () => {
    render(
      <Shell>
        <PageHeader breadcrumbs={trail} />
      </Shell>,
    )
    expect(screen.queryByRole('button', { name: 'Show full path' })).toBeNull()
    expect(screen.getByRole('link', { name: 'Storage' })).toBeInTheDocument()
  })
})

describe('PageHeader without a provider', () => {
  it('renders its own bar in place', () => {
    render(<PageHeader breadcrumbs={trail} actions={<button type="button">Save</button>} />)
    expect(screen.getByRole('navigation', { name: 'Breadcrumb' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument()
  })
})

describe('PageHeaderStore', () => {
  const fills = { titleActions: false, actions: false, toolbar: false }

  it('publishes only when a declaration changes', () => {
    const store = new PageHeaderStore()
    const listener = vi.fn()
    store.subscribe(listener)
    store.set(1, { breadcrumbs: [{ label: 'A' }], hidden: false, nodes: null, fills })
    const first = store.getSnapshot()
    // An equal trail in a new array, as an inline prop makes each render.
    store.set(1, { breadcrumbs: [{ label: 'A' }], hidden: false, nodes: null, fills })
    expect(listener).toHaveBeenCalledTimes(1)
    expect(store.getSnapshot()).toBe(first)
    store.set(1, { breadcrumbs: [{ label: 'B' }], hidden: false, nodes: null, fills })
    expect(listener).toHaveBeenCalledTimes(2)
  })
})

describe('PageHeaderAction', () => {
  it('names the control from ariaLabel while keeping the visible label', () => {
    render(<PageHeaderAction icon={Icon} label="Save" ariaLabel="Save flags" onClick={() => {}} />)
    expect(screen.getByRole('button', { name: 'Save flags' })).toHaveTextContent('Save')
  })

  it('links in the app, or out of it in a new tab', () => {
    render(
      <>
        <PageHeaderAction icon={Icon} label="Edit" href="/edit" />
        <PageHeaderAction icon={Icon} label="Open" href="https://example.com" external />
      </>,
    )
    expect(screen.getByRole('link', { name: 'Edit' })).toHaveAttribute('href', '/edit')
    const out = screen.getByRole('link', { name: /^Open/ })
    expect(out).toHaveAttribute('target', '_blank')
    expect(out).toHaveAttribute('rel', 'noopener noreferrer')
  })

  it('colors a destructive action’s content in the error color', () => {
    render(
      <>
        <PageHeaderAction icon={Icon} label="Remove" destructive onClick={() => {}} />
        <PageHeaderAction icon={Icon} label="Open" href="/somewhere" />
      </>,
    )
    expect(screen.getByRole('button', { name: 'Remove' })).toHaveClass(
      '*:text-(--theme-error-text)',
    )
    expect(screen.getByRole('link', { name: 'Open' })).toHaveClass('*:text-(--theme-link)')
  })

  it('stays focusable when disabled, says why and swallows presses', async () => {
    const onClick = vi.fn()
    render(
      <PageHeaderAction
        icon={Icon}
        label="Save"
        onClick={onClick}
        disabled
        disabledReason="Nothing to save yet"
      />,
    )
    const button = screen.getByRole('button', { name: 'Save. Nothing to save yet' })
    expect(button).toHaveAttribute('aria-disabled', 'true')
    expect(button).not.toBeDisabled()
    act(() => button.focus())
    await waitFor(() => expect(openTooltip()).toHaveTextContent('Nothing to save yet'))
    fireEvent.click(button)
    expect(onClick).not.toHaveBeenCalled()
  })

  it('turns a disabled link into an inert button', () => {
    render(
      <PageHeaderAction
        icon={Icon}
        label="Edit"
        href="/edit"
        disabled
        disabledReason="Read only"
      />,
    )
    expect(screen.queryByRole('link')).toBeNull()
    expect(screen.getByRole('button', { name: 'Edit. Read only' })).toHaveAttribute(
      'aria-disabled',
      'true',
    )
  })

  it('reports a toggle’s state', () => {
    render(<PageHeaderAction icon={Icon} iconOnly label="Favorite" pressed onClick={() => {}} />)
    expect(screen.getByRole('button', { name: 'Favorite' })).toHaveAttribute('aria-pressed', 'true')
  })
})

describe('PageHeaderAddButton', () => {
  it('keeps a disabled menu item inert and names its reason', () => {
    const onSelect = vi.fn()
    render(
      <PageHeaderAddButton
        label="Create key"
        word="create"
        menu={[
          { label: 'API key', onClick: vi.fn() },
          {
            label: 'Service key',
            onClick: onSelect,
            disabled: true,
            disabledReason: 'No allocations available',
          },
        ]}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Create key' }))
    const item = screen.getByRole('menuitem', { name: 'Service key. No allocations available' })
    expect(item).toHaveAttribute('aria-disabled', 'true')
    fireEvent.click(item)
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('shows the verb and is named by the full action', () => {
    render(<PageHeaderAddButton label="New cluster" word="create" href="/new" />)
    expect(screen.getByRole('link', { name: 'New cluster' })).toHaveTextContent('Create')
  })
})

describe('PageHeaderMenu', () => {
  it('renders nothing without items', () => {
    const { container } = render(<PageHeaderMenu items={[]} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('is named Actions unless told otherwise', () => {
    render(<PageHeaderMenu items={[{ label: 'Delete', onClick: () => {} }]} />)
    expect(screen.getByRole('button', { name: 'Actions' })).toBeInTheDocument()
  })
})
