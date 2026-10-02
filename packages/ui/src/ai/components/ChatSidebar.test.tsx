// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import ChatSidebar from './ChatSidebar'

vi.mock('../../icons', () => ({
  ConnectIcon: () => <span />,
  DownloadIcon: () => <span />,
  EditIcon: () => <span />,
  ImageIcon: () => <span />,
  MoreIcon: () => <span />,
  NewChatIcon: () => <span />,
  SearchIcon: () => <span />,
  SettingsIcon: () => <span />,
  ShareIcon: () => <span />,
  SharingIcon: () => <span />,
  SidebarIcon: () => <span />,
  TrashIcon: () => <span />,
}))

const downloadTextMock = vi.fn()
vi.mock('../core/exportConversation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../core/exportConversation')>()),
  downloadText: (filename: string, text: string) => downloadTextMock(filename, text),
}))

vi.mock('../../components/ConfirmModal', () => ({
  ConfirmModal: () => null,
}))

vi.mock('./ShareDialog', () => ({
  __esModule: true,
  default: () => null,
}))

const conversationsGet = vi.fn()
const chatState = {
  adapter: {
    sharing: undefined,
    attachments: undefined,
    conversations: { get: conversationsGet },
  },
  navigation: { toNewChat: vi.fn() },
  notify: { error: vi.fn() },
  activeConversationId: null,
  conversations: [] as {
    id: string
    title?: string
    createdAt: string
    canCollaborate: boolean
    isOwner: boolean
    messageCount: number
  }[],
  sidebarCollapsed: false,
  toggleSidebar: vi.fn(),
  isLoading: false,
  loadConversations: vi.fn(),
  deleteConversation: vi.fn(),
  updateConversationTitle: vi.fn(),
  clearCurrentConversation: vi.fn(),
}

vi.mock('../core/ChatProvider', () => ({
  useChat: () => chatState,
}))

vi.mock('../core/config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../core/config')>()
  return {
    ...actual,
    useChatConfig: () => ({
      ...actual.resolveChatConfig(),
      extraLinks: [],
      LinkComponent: ({ children }: { children: ReactNode }) => <a href="/">{children}</a>,
    }),
  }
})

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

const handle = () => screen.getByRole('separator')
const container = () => handle().parentElement as HTMLElement

const pointerDown = (clientX: number) =>
  fireEvent(handle(), new MouseEvent('pointerdown', { bubbles: true, clientX }))
const pointerMove = (clientX: number) =>
  fireEvent(window, new MouseEvent('pointermove', { clientX }))
const pointerUp = () => fireEvent(window, new MouseEvent('pointerup', {}))

beforeEach(() => {
  storage.clear()
  chatState.sidebarCollapsed = false
  chatState.conversations = []
  chatState.toggleSidebar.mockClear()
  conversationsGet.mockReset()
  downloadTextMock.mockClear()
})

const conversation = (id: string, title: string) => ({
  id,
  title,
  createdAt: new Date().toISOString(),
  canCollaborate: true,
  isOwner: true,
  messageCount: 1,
})

describe('ChatSidebar resizing', () => {
  it('restores the persisted width', () => {
    window.localStorage.setItem('aiChatSidebarWidth', '321')
    render(<ChatSidebar />)
    expect(container().style.width).toBe('321px')
  })

  it('falls back to the default width for garbage storage values', () => {
    window.localStorage.setItem('aiChatSidebarWidth', 'not-a-number')
    render(<ChatSidebar />)
    expect(container().style.width).toBe('256px')
  })

  it('drags to resize within bounds and persists on release', () => {
    render(<ChatSidebar />)
    pointerDown(300)
    pointerMove(400)
    expect(container().style.width).toBe('356px')
    pointerMove(2000)
    expect(container().style.width).toBe('480px')
    pointerMove(-2000)
    expect(container().style.width).toBe('200px')
    pointerUp()
    expect(window.localStorage.getItem('aiChatSidebarWidth')).toBe('200')
  })

  it('collapses to the icon rail and restores the width on expand', () => {
    window.localStorage.setItem('aiChatSidebarWidth', '400')
    const { rerender } = render(<ChatSidebar />)
    expect(container().style.width).toBe('400px')

    chatState.sidebarCollapsed = true
    rerender(<ChatSidebar />)
    expect(screen.queryByRole('separator')).not.toBeInTheDocument()

    chatState.sidebarCollapsed = false
    rerender(<ChatSidebar />)
    expect(container().style.width).toBe('400px')
  })

  it('arrow keys nudge the width from the focused handle', () => {
    window.localStorage.setItem('aiChatSidebarWidth', '300')
    render(<ChatSidebar />)
    fireEvent.keyDown(handle(), { key: 'ArrowRight' })
    expect(container().style.width).toBe('316px')
    fireEvent.keyDown(handle(), { key: 'ArrowLeft' })
    expect(container().style.width).toBe('300px')
    expect(window.localStorage.getItem('aiChatSidebarWidth')).toBe('300')
  })

  it('double-clicking the handle resets to the default width', () => {
    window.localStorage.setItem('aiChatSidebarWidth', '480')
    render(<ChatSidebar />)
    fireEvent.doubleClick(handle())
    expect(container().style.width).toBe('256px')
    expect(window.localStorage.getItem('aiChatSidebarWidth')).toBe('256')
  })
})

describe('ChatSidebar search', () => {
  it('filters conversations by title', () => {
    chatState.conversations = [conversation('1', 'Alpha planning'), conversation('2', 'Beta notes')]
    render(<ChatSidebar />)
    fireEvent.change(screen.getByPlaceholderText('Search conversations'), {
      target: { value: 'alpha' },
    })
    expect(screen.getByText('Alpha planning')).toBeInTheDocument()
    expect(screen.queryByText('Beta notes')).not.toBeInTheDocument()
  })

  it('shows a no-matches message for a fruitless search', () => {
    chatState.conversations = [conversation('1', 'Alpha planning')]
    render(<ChatSidebar />)
    fireEvent.change(screen.getByPlaceholderText('Search conversations'), {
      target: { value: 'zzz' },
    })
    expect(screen.getByText('No conversations match your search')).toBeInTheDocument()
  })

  it('escape clears the active filter', () => {
    chatState.conversations = [conversation('1', 'Alpha planning')]
    render(<ChatSidebar />)
    const input = screen.getByPlaceholderText('Search conversations')
    fireEvent.change(input, { target: { value: 'zzz' } })
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(screen.getByText('Alpha planning')).toBeInTheDocument()
  })

  it('the focus event expands a collapsed sidebar and focuses the input', async () => {
    chatState.sidebarCollapsed = true
    chatState.conversations = [conversation('1', 'Alpha planning')]
    render(<ChatSidebar />)
    document.dispatchEvent(new Event('aichat:focus-sidebar-search'))
    expect(chatState.toggleSidebar).toHaveBeenCalled()
    await new Promise((resolve) => requestAnimationFrame(resolve))
  })
})

describe('ChatSidebar with host actions', () => {
  it('leaves new chat and search to the host header', () => {
    chatState.conversations = [conversation('1', 'Alpha planning')]
    render(<ChatSidebar actions={false} />)
    expect(screen.queryByText('New chat')).not.toBeInTheDocument()
    expect(screen.queryByPlaceholderText('Search conversations')).not.toBeInTheDocument()
    expect(screen.getByText('Alpha planning')).toBeInTheDocument()
  })

  it('ignores the sidebar search shortcut', () => {
    chatState.sidebarCollapsed = true
    render(<ChatSidebar actions={false} />)
    document.dispatchEvent(new Event('aichat:focus-sidebar-search'))
    expect(chatState.toggleSidebar).not.toHaveBeenCalled()
  })
})

describe('ChatSidebar export', () => {
  it('downloads the conversation as markdown from the row menu', async () => {
    chatState.conversations = [conversation('1', 'Alpha planning')]
    conversationsGet.mockResolvedValue({
      id: '1',
      title: 'Alpha planning',
      messages: [
        { id: 'm1', role: 'user', content: 'hello' },
        { id: 'm2', role: 'assistant', content: 'world' },
      ],
    })
    render(<ChatSidebar />)
    fireEvent.click(screen.getByLabelText('More actions'))
    fireEvent.click(await screen.findByText('Download'))
    await vi.waitFor(() => expect(downloadTextMock).toHaveBeenCalled())
    const [filename, text] = downloadTextMock.mock.calls[0] ?? []
    expect(filename).toBe('alpha-planning.md')
    expect(text).toContain('# Alpha planning')
    expect(text).toContain('## User')
    expect(text).toContain('hello')
    expect(text).toContain('## Assistant')
  })

  it('notifies on export failure', async () => {
    chatState.conversations = [conversation('1', 'Alpha planning')]
    conversationsGet.mockRejectedValue(new Error('nope'))
    render(<ChatSidebar />)
    fireEvent.click(screen.getByLabelText('More actions'))
    fireEvent.click(await screen.findByText('Download'))
    await vi.waitFor(() => expect(chatState.notify.error).toHaveBeenCalled())
    expect(downloadTextMock).not.toHaveBeenCalled()
  })
})
