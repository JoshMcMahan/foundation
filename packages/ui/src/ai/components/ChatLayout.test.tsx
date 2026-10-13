// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { makeStaticAdapter, makeSummaries, StoryChat } from '../stories/harness'
import ChatLayout from './ChatLayout'

const storage = new Map<string, string>()
Object.defineProperty(window, 'localStorage', {
  configurable: true,
  value: {
    getItem: (k: string) => storage.get(k) ?? null,
    setItem: (k: string, v: string) => storage.set(k, String(v)),
    removeItem: (k: string) => storage.delete(k),
    clear: () => storage.clear(),
  },
})

// jsdom lays nothing out; the chat's width is whatever a test says it is.
let chatWidth = 1200
// Every observer hears a resize: the drawer has its own besides the layout's.
const observers = new Set<() => void>()
const resize = () => {
  for (const cb of observers) {
    cb()
  }
}
Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
  configurable: true,
  get: () => chatWidth,
})
global.ResizeObserver = class {
  cb: () => void
  constructor(cb: () => void) {
    this.cb = cb
  }
  observe() {
    observers.add(this.cb)
  }
  unobserve() {}
  disconnect() {
    observers.delete(this.cb)
  }
} as unknown as typeof ResizeObserver

const FIRST = 'Slurm sizing session 1'

function renderLayout(
  layout: Omit<ComponentProps<typeof ChatLayout>, 'children'> = {},
  sidebarControl?: ComponentProps<typeof StoryChat>['sidebarControl'],
) {
  const adapter = makeStaticAdapter({ summaries: makeSummaries({ count: 3 }) })
  return render(
    <StoryChat adapter={adapter} conversationId={null} sidebarControl={sidebarControl}>
      <ChatLayout {...layout}>
        <p>thread</p>
      </ChatLayout>
    </StoryChat>,
  )
}

beforeEach(() => {
  storage.clear()
  chatWidth = 1200
  observers.clear()
})

describe('ChatLayout inline', () => {
  it('keeps the list beside the thread and remembers the rail', async () => {
    renderLayout()
    expect(await screen.findByText(FIRST)).toBeVisible()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Close sidebar' }))
    expect(storage.get('aiChatSidebar')).toBe('collapsed')
  })

  it('puts the host content above the list and tells it when the list is the rail', async () => {
    renderLayout({
      sidebarActions: false,
      sidebarTop: ({ collapsed }) => <p>{collapsed ? 'top: rail' : 'top: list'}</p>,
    })
    expect(await screen.findByText('top: list')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Close sidebar' }))
    expect(screen.getByText('top: rail')).toBeInTheDocument()
  })

  it('reads the rail from the earlier storage key', async () => {
    storage.set('aiChatSidebarCollapsed', '1')
    renderLayout()
    expect(await screen.findByRole('button', { name: 'Open sidebar' })).toBeInTheDocument()
  })
})

describe('ChatLayout drawer', () => {
  it('keeps the drawer bar beside the toggle, and only while the list is a drawer', async () => {
    const { unmount } = renderLayout({ sidebarMode: 'drawer', drawerBar: <p>bar</p> })
    expect(screen.getByText('bar')).toBeInTheDocument()
    unmount()
    renderLayout({ drawerBar: <p>bar</p> })
    expect(await screen.findByText(FIRST)).toBeVisible()
    expect(screen.queryByText('bar')).not.toBeInTheDocument()
  })

  it('starts closed, opens from its toggle and closes once a conversation is picked', async () => {
    renderLayout({ sidebarMode: 'drawer' })
    const dialog = screen.getByRole('dialog', { hidden: true })
    expect(dialog).not.toBeVisible()

    fireEvent.click(screen.getByRole('button', { name: 'Open sidebar' }))
    expect(dialog).toBeVisible()
    // The thread leaves the accessibility tree while the drawer covers it.
    expect(screen.queryByRole('main')).not.toBeInTheDocument()

    fireEvent.click(await screen.findByText(FIRST))
    await waitFor(() => expect(dialog).not.toBeVisible())
    expect(screen.getByRole('main')).toBeInTheDocument()
  })

  it('leaves the toggle to the host header when asked', () => {
    renderLayout({ sidebarMode: 'drawer', drawerToggle: false })
    expect(screen.queryByRole('button', { name: 'Open sidebar' })).not.toBeInTheDocument()
  })
})

describe('ChatLayout auto', () => {
  it('shows the drawer below the breakpoint and the column above it', () => {
    chatWidth = 500
    renderLayout({ sidebarMode: 'auto' })
    expect(screen.getByRole('dialog', { hidden: true })).toBeInTheDocument()

    chatWidth = 1000
    act(resize)
    expect(screen.queryByRole('dialog', { hidden: true })).not.toBeInTheDocument()
  })

  it('closes an open drawer when the chat widens past the breakpoint', () => {
    chatWidth = 500
    const onDrawerOpenChange = vi.fn()
    renderLayout({ sidebarMode: 'auto' }, { drawerOpen: true, onDrawerOpenChange })
    chatWidth = 1000
    act(resize)
    expect(onDrawerOpenChange).toHaveBeenCalledWith(false)
  })
})

describe('ChatLayout under host control', () => {
  it('hides the list while the host says so', async () => {
    renderLayout({}, { sidebar: 'hidden' })
    await act(async () => {})
    expect(screen.queryByText(FIRST)).not.toBeInTheDocument()
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument()
  })

  it('asks the host rather than changing on its own, and remembers nothing', () => {
    const onSidebarChange = vi.fn()
    renderLayout({}, { sidebar: 'collapsed', onSidebarChange })
    fireEvent.click(screen.getByRole('button', { name: 'Open sidebar' }))
    expect(onSidebarChange).toHaveBeenCalledWith('expanded')
    expect(screen.getByRole('button', { name: 'Open sidebar' })).toBeInTheDocument()
    expect(storage.has('aiChatSidebar')).toBe(false)
  })

  it('opens the drawer the host opens', () => {
    renderLayout({ sidebarMode: 'drawer' }, { drawerOpen: true })
    expect(screen.getByRole('dialog')).toBeVisible()
  })
})
