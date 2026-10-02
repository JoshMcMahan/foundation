// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { forwardRef, useImperativeHandle } from 'react'
import ChatInput from './ChatInput'

vi.mock('../../icons', () => ({
  ArrowUpIcon: () => <span />,
  AttachmentIcon: () => <span />,
  StopSolidIcon: () => <span />,
}))

const addFilesMock = vi.fn()
vi.mock('./AttachmentUpload', () => ({
  __esModule: true,
  default: forwardRef(function AttachmentUploadMock(_props, ref) {
    useImperativeHandle(ref, () => ({ addFiles: addFilesMock }))
    return <div data-testid="attachment-upload" />
  }),
}))

vi.mock('./DragOverlay', () => ({
  __esModule: true,
  default: () => null,
}))

const chatState = {
  adapter: { attachments: {} as object | undefined },
  isStreaming: false,
  stopStreaming: vi.fn(),
  queuedMessages: [] as unknown[],
  flushQueuedMessages: vi.fn(),
  isSelectedModelAvailable: true,
}

vi.mock('../core/ChatProvider', () => ({
  useChat: () => chatState,
}))

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

const textarea = () => screen.getByPlaceholderText('Ask anything') as HTMLTextAreaElement

beforeEach(() => {
  storage.clear()
  addFilesMock.mockClear()
  chatState.adapter.attachments = {}
  chatState.isSelectedModelAvailable = true
})

const pasteFiles = (files: File[]) => fireEvent.paste(textarea(), { clipboardData: { files } })

describe('ChatInput drafts', () => {
  it('persists the draft per conversation and restores it', () => {
    const { unmount } = render(<ChatInput onSend={vi.fn()} conversationId="c1" />)
    fireEvent.change(textarea(), { target: { value: 'half-typed thought' } })
    expect(storage.get('aiChatDraft:c1')).toBe('half-typed thought')
    unmount()

    render(<ChatInput onSend={vi.fn()} conversationId="c1" />)
    expect(textarea().value).toBe('half-typed thought')
  })

  it('keeps drafts separate across conversations', () => {
    storage.set('aiChatDraft:c1', 'first')
    storage.set('aiChatDraft:c2', 'second')
    const { rerender } = render(<ChatInput onSend={vi.fn()} conversationId="c1" />)
    expect(textarea().value).toBe('first')
    rerender(<ChatInput onSend={vi.fn()} conversationId="c2" />)
    expect(textarea().value).toBe('second')
  })

  it('clears the draft on send', () => {
    const onSend = vi.fn()
    render(<ChatInput onSend={onSend} conversationId="c1" />)
    fireEvent.change(textarea(), { target: { value: 'ship it' } })
    fireEvent.keyDown(textarea(), { key: 'Enter' })
    expect(onSend).toHaveBeenCalledWith('ship it', undefined, undefined)
    expect(storage.has('aiChatDraft:c1')).toBe(false)
    expect(textarea().value).toBe('')
  })

  it('does not persist oversized drafts', () => {
    render(<ChatInput onSend={vi.fn()} conversationId="c1" />)
    fireEvent.change(textarea(), { target: { value: 'x'.repeat(10_001) } })
    expect(storage.has('aiChatDraft:c1')).toBe(false)
  })
})

describe('ChatInput model availability', () => {
  it('will not send while the selected model is not available', () => {
    chatState.isSelectedModelAvailable = false
    const onSend = vi.fn()
    render(<ChatInput onSend={onSend} conversationId="c1" />)

    fireEvent.change(textarea(), { target: { value: 'are you still there' } })
    fireEvent.keyDown(textarea(), { key: 'Enter' })

    expect(onSend).not.toHaveBeenCalled()
    expect(screen.getByLabelText('Send message (Enter)')).toBeDisabled()
  })
})

describe('ChatInput paste-to-attach', () => {
  const file = new File(['x'], 'shot.png', { type: 'image/png' })

  it('routes pasted files into the attachment upload', async () => {
    render(<ChatInput onSend={vi.fn()} conversationId="c1" />)
    pasteFiles([file])
    await vi.waitFor(() => expect(addFilesMock).toHaveBeenCalledWith([file]))
    expect(screen.getByTestId('attachment-upload')).toBeInTheDocument()
  })

  it('leaves text pastes alone', () => {
    render(<ChatInput onSend={vi.fn()} conversationId="c1" />)
    pasteFiles([])
    expect(addFilesMock).not.toHaveBeenCalled()
  })

  it('ignores file pastes when attachments are unavailable', () => {
    chatState.adapter.attachments = undefined
    render(<ChatInput onSend={vi.fn()} conversationId="c1" />)
    pasteFiles([file])
    expect(addFilesMock).not.toHaveBeenCalled()
  })
})

describe('ChatInput with a host-driven turn', () => {
  const stopButton = () => screen.queryByRole('button', { name: /stop/i })

  it('offers Stop for the host turn and never touches the provider stream', () => {
    chatState.isStreaming = true
    const onStop = vi.fn()
    const { rerender } = render(
      <ChatInput onSend={vi.fn()} turn={{ running: false, onStop }} disabled />,
    )
    expect(stopButton()).toBeNull()

    rerender(<ChatInput onSend={vi.fn()} turn={{ running: true, onStop }} disabled />)
    fireEvent.click(stopButton()!)
    expect(onStop).toHaveBeenCalledTimes(1)
    expect(chatState.stopStreaming).not.toHaveBeenCalled()

    rerender(<ChatInput onSend={vi.fn()} turn={{ running: true, onStop, stopping: true }} />)
    expect(stopButton()).toBeDisabled()
    chatState.isStreaming = false
  })

  it("leaves the provider's queue to the provider's own composer", () => {
    chatState.queuedMessages = ['held']
    render(<ChatInput onSend={vi.fn()} turn={{ running: false, onStop: vi.fn() }} />)
    fireEvent.click(screen.getByRole('button', { name: /send/i }))
    expect(chatState.flushQueuedMessages).not.toHaveBeenCalled()
    chatState.queuedMessages = []
  })
})

describe('ChatInput slash commands', () => {
  const commands = [
    { name: 'status', description: 'Show session status' },
    { name: 'stats' },
    { name: 'model', description: 'Show or change the current model' },
  ]
  const slash = (onOpen = vi.fn()) => ({
    commands,
    label: 'Commands',
    onOpen,
  })
  const options = () => screen.queryAllByRole('option')

  it('lists commands matching what is typed after the slash', () => {
    const onOpen = vi.fn()
    render(<ChatInput onSend={vi.fn()} slash={slash(onOpen)} />)
    expect(screen.queryByRole('listbox')).toBeNull()
    fireEvent.change(textarea(), { target: { value: '/st' } })
    expect(onOpen).toHaveBeenCalled()
    expect(options().map((o) => o.textContent)).toEqual(['/statusShow session status', '/stats'])
  })

  it('picks with the arrow keys and Enter instead of sending', () => {
    const onSend = vi.fn()
    render(<ChatInput onSend={onSend} slash={slash()} />)
    fireEvent.change(textarea(), { target: { value: '/st' } })
    fireEvent.keyDown(textarea(), { key: 'ArrowDown' })
    expect(options()[1]).toHaveAttribute('aria-selected', 'true')
    fireEvent.keyDown(textarea(), { key: 'Enter' })
    expect(onSend).not.toHaveBeenCalled()
    expect(textarea().value).toBe('/stats ')
    expect(screen.queryByRole('listbox')).toBeNull()

    fireEvent.keyDown(textarea(), { key: 'Enter' })
    expect(onSend).toHaveBeenCalledWith('/stats', undefined, undefined)
  })

  it('sends a fully typed command, and Escape closes the menu', () => {
    const onSend = vi.fn()
    render(<ChatInput onSend={onSend} slash={slash()} />)
    fireEvent.change(textarea(), { target: { value: '/m' } })
    fireEvent.keyDown(textarea(), { key: 'Escape' })
    expect(screen.queryByRole('listbox')).toBeNull()

    fireEvent.change(textarea(), { target: { value: '/model' } })
    expect(screen.queryByRole('listbox')).toBeNull()
    fireEvent.keyDown(textarea(), { key: 'Enter' })
    expect(onSend).toHaveBeenCalledWith('/model', undefined, undefined)
  })

  it('stays out of the way for a host without commands and for prose', () => {
    const { rerender } = render(<ChatInput onSend={vi.fn()} />)
    fireEvent.change(textarea(), { target: { value: '/st' } })
    expect(screen.queryByRole('listbox')).toBeNull()
    rerender(<ChatInput onSend={vi.fn()} slash={slash()} />)
    fireEvent.change(textarea(), { target: { value: '/status of the build?' } })
    expect(screen.queryByRole('listbox')).toBeNull()
  })
})
