// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { forwardRef, useImperativeHandle } from 'react'
import type { Attachment } from './AttachmentUpload'
import ChatInput from './ChatInput'
import { DRAFT_MAX_LENGTH, DRAFT_TTL_MS, readDraft, sweepDrafts } from './chatDraft'
import { appendHistory, HISTORY_MAX_CHARS, HISTORY_MAX_ENTRIES, readHistory } from './chatHistory'
import type { PasteUploadResult } from './usePasteCards'

const addFilesMock = vi.fn()
const uploadProps: {
  current?: { attachments: Attachment[]; onAttachmentsChange: (next: Attachment[]) => void }
} = {}
vi.mock('./AttachmentUpload', () => ({
  __esModule: true,
  default: forwardRef(function AttachmentUploadMock(
    props: NonNullable<typeof uploadProps.current>,
    ref,
  ) {
    uploadProps.current = props
    useImperativeHandle(ref, () => ({ addFiles: addFilesMock }))
    return <div data-testid="attachment-upload" />
  }),
}))

vi.mock('./ComposerChrome', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./ComposerChrome')>()),
  ComposerControls: () => null,
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
  tools: [] as unknown[],
  enabledToolIds: [] as string[],
  setToolEnabled: vi.fn(),
  consumeInputFocus: vi.fn((_conversationId?: string) => false),
}

vi.mock('../core/ChatProvider', () => ({
  useChat: () => chatState,
  useHasChatTools: () => false,
}))

const storage = new Map<string, string>()
Object.defineProperty(window, 'localStorage', {
  configurable: true,
  value: {
    getItem: (k: string) => storage.get(k) ?? null,
    setItem: (k: string, v: string) => storage.set(k, String(v)),
    removeItem: (k: string) => storage.delete(k),
    clear: () => storage.clear(),
    key: (i: number) => [...storage.keys()][i] ?? null,
    get length() {
      return storage.size
    },
  },
})

const tabStorage = new Map<string, string>()
Object.defineProperty(window, 'sessionStorage', {
  configurable: true,
  value: {
    getItem: (k: string) => tabStorage.get(k) ?? null,
    setItem: (k: string, v: string) => tabStorage.set(k, String(v)),
    removeItem: (k: string) => tabStorage.delete(k),
  },
})

const textarea = () => screen.getByPlaceholderText('Ask anything') as HTMLTextAreaElement

beforeEach(() => {
  storage.clear()
  tabStorage.clear()
  addFilesMock.mockClear()
  chatState.adapter.attachments = {}
  chatState.isSelectedModelAvailable = true
  chatState.consumeInputFocus = vi.fn((_conversationId?: string) => false)
})

const pasteFiles = (files: File[]) => fireEvent.paste(textarea(), { clipboardData: { files } })

describe('ChatInput drafts', () => {
  it('persists the draft per conversation and restores it', () => {
    const { unmount } = render(<ChatInput onSend={vi.fn()} conversationId="c1" />)
    fireEvent.change(textarea(), { target: { value: 'half-typed thought' } })
    expect(JSON.parse(storage.get('aiChatDraft:c1') ?? '').text).toBe('half-typed thought')
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

  it('lets a host read what is typed until it is sent', () => {
    render(<ChatInput onSend={vi.fn()} conversationId="c1" />)
    fireEvent.change(textarea(), { target: { value: 'half-typed thought' } })
    expect(readDraft('c1')).toBe('half-typed thought')
    expect(readDraft('c2')).toBe('')
    fireEvent.keyDown(textarea(), { key: 'Enter' })
    expect(readDraft('c1')).toBe('')
  })

  it('ignores a draft older than its lifetime', () => {
    storage.set(
      'aiChatDraft:c1',
      JSON.stringify({ text: 'stale', savedAt: Date.now() - DRAFT_TTL_MS - 1 }),
    )
    render(<ChatInput onSend={vi.fn()} conversationId="c1" />)
    expect(textarea().value).toBe('')
  })

  it('sweeps expired drafts and dates ones stored without an age', () => {
    const now = Date.now()
    storage.set(
      'aiChatDraft:old',
      JSON.stringify({ text: 'stale', savedAt: now - DRAFT_TTL_MS - 1 }),
    )
    storage.set('aiChatDraft:fresh', JSON.stringify({ text: 'fresh', savedAt: now - 1000 }))
    storage.set('aiChatDraft:legacy', 'bare text')
    storage.set('otherKey', 'untouched')

    sweepDrafts(now)
    expect(storage.has('aiChatDraft:old')).toBe(false)
    expect(JSON.parse(storage.get('aiChatDraft:fresh') ?? '').text).toBe('fresh')
    expect(JSON.parse(storage.get('aiChatDraft:legacy') ?? '')).toEqual({
      text: 'bare text',
      savedAt: now,
    })
    expect(storage.get('otherKey')).toBe('untouched')

    sweepDrafts(now + DRAFT_TTL_MS + 1)
    expect(storage.has('aiChatDraft:legacy')).toBe(false)
  })

  it('does not persist oversized drafts', () => {
    render(<ChatInput onSend={vi.fn()} conversationId="c1" />)
    fireEvent.change(textarea(), { target: { value: 'x'.repeat(10_001) } })
    expect(storage.has('aiChatDraft:c1')).toBe(false)
  })
})

describe('ChatInput focus handoff', () => {
  it('leaves focus alone when no send handed it over', () => {
    render(<ChatInput onSend={vi.fn()} conversationId="c1" />)
    expect(textarea()).not.toHaveFocus()
  })

  it('takes the focus a send handed over once it is enabled', () => {
    chatState.consumeInputFocus = vi.fn((id?: string) => id === 'c1')
    const { rerender } = render(<ChatInput onSend={vi.fn()} conversationId="c1" disabled />)
    expect(chatState.consumeInputFocus).not.toHaveBeenCalled()

    rerender(<ChatInput onSend={vi.fn()} conversationId="c1" />)
    expect(textarea()).toHaveFocus()
  })

  // jsdom keeps focus on a box it disables, where a browser moves it to the body.
  const dropFocusToBody = () => {
    const spare = document.createElement('input')
    document.body.append(spare)
    spare.focus()
    spare.remove()
  }

  it('takes focus back when a lock lifts while it was being typed in', () => {
    const { rerender } = render(<ChatInput onSend={vi.fn()} conversationId="c1" />)
    textarea().focus()

    rerender(<ChatInput onSend={vi.fn()} conversationId="c1" disabled />)
    dropFocusToBody()
    expect(document.activeElement).toBe(document.body)
    rerender(<ChatInput onSend={vi.fn()} conversationId="c1" />)

    expect(textarea()).toHaveFocus()
  })

  it('leaves focus where the reader moved it while locked', () => {
    const { rerender } = render(
      <>
        <ChatInput onSend={vi.fn()} conversationId="c1" />
        <button type="button">elsewhere</button>
      </>,
    )
    textarea().focus()

    rerender(
      <>
        <ChatInput onSend={vi.fn()} conversationId="c1" disabled />
        <button type="button">elsewhere</button>
      </>,
    )
    screen.getByRole('button', { name: 'elsewhere' }).focus()
    rerender(
      <>
        <ChatInput onSend={vi.fn()} conversationId="c1" />
        <button type="button">elsewhere</button>
      </>,
    )

    expect(screen.getByRole('button', { name: 'elsewhere' })).toHaveFocus()
  })

  it('stays unfocused after a lock when it was not focused before', () => {
    const { rerender } = render(<ChatInput onSend={vi.fn()} conversationId="c1" />)

    rerender(<ChatInput onSend={vi.fn()} conversationId="c1" disabled />)
    rerender(<ChatInput onSend={vi.fn()} conversationId="c1" />)

    expect(textarea()).not.toHaveFocus()
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
    // Focus stays in the textarea, which names the active option and its list.
    expect(textarea()).toHaveAttribute('aria-activedescendant', options()[1]?.id)
    expect(textarea()).toHaveAttribute('aria-controls', screen.getByRole('listbox').id)
    fireEvent.keyDown(textarea(), { key: 'Enter' })
    expect(onSend).not.toHaveBeenCalled()
    expect(textarea().value).toBe('/stats ')
    expect(screen.queryByRole('listbox')).toBeNull()

    fireEvent.keyDown(textarea(), { key: 'Enter' })
    expect(onSend).toHaveBeenCalledWith('/stats', undefined, undefined)
  })

  it('keeps a fully typed command listed, and Enter sends it', () => {
    const onSend = vi.fn()
    render(<ChatInput onSend={onSend} slash={slash()} />)
    fireEvent.change(textarea(), { target: { value: '/model' } })
    expect(options().map((o) => o.textContent)).toEqual(['/modelShow or change the current model'])

    fireEvent.keyDown(textarea(), { key: 'Enter' })
    expect(onSend).toHaveBeenCalledWith('/model', undefined, undefined)
    expect(screen.queryByRole('listbox')).toBeNull()
  })

  it('completes a fully typed command with Tab, ready for its arguments', () => {
    const onSend = vi.fn()
    render(<ChatInput onSend={onSend} slash={slash()} />)
    fireEvent.change(textarea(), { target: { value: '/model' } })
    fireEvent.keyDown(textarea(), { key: 'Tab' })
    expect(onSend).not.toHaveBeenCalled()
    expect(textarea().value).toBe('/model ')
    expect(screen.queryByRole('listbox')).toBeNull()
  })

  it('still completes a whole name that begins a longer one', () => {
    const onSend = vi.fn()
    render(
      <ChatInput
        onSend={onSend}
        slash={{ commands: [{ name: 'plan' }, { name: 'plan-review' }], label: 'Commands' }}
      />,
    )
    fireEvent.change(textarea(), { target: { value: '/plan' } })
    fireEvent.keyDown(textarea(), { key: 'ArrowDown' })
    fireEvent.keyDown(textarea(), { key: 'Enter' })
    expect(onSend).not.toHaveBeenCalled()
    expect(textarea().value).toBe('/plan-review ')
  })

  it('closes on Escape until the text changes, and Enter then sends', () => {
    const onSend = vi.fn()
    render(<ChatInput onSend={onSend} slash={slash()} />)
    fireEvent.change(textarea(), { target: { value: '/m' } })
    fireEvent.keyDown(textarea(), { key: 'Escape' })
    expect(screen.queryByRole('listbox')).toBeNull()

    fireEvent.change(textarea(), { target: { value: '/model' } })
    expect(screen.queryByRole('listbox')).not.toBeNull()
    fireEvent.keyDown(textarea(), { key: 'Escape' })
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

describe('ChatInput large pastes', () => {
  const big = 'pasted line\n'.repeat(200)
  const saved = {
    id: 3,
    placeholder: '[Pasted text #3 +200 lines]',
    lines: 200,
    bytes: big.length,
  }
  const pasteText = (text: string) =>
    fireEvent.paste(textarea(), {
      clipboardData: { files: [], getData: () => text },
    })

  it('pastes text that fits inline into the box', () => {
    const upload = vi.fn()
    render(<ChatInput onSend={vi.fn()} pastes={{ inlineMaxBytes: 10_000, upload }} />)
    expect(pasteText(big)).toBe(true)
    expect(upload).not.toHaveBeenCalled()
    expect(screen.queryByTestId('paste-file-card')).toBeNull()
  })

  it('saves a paste too big to send inline and sends it by placeholder', async () => {
    const upload = vi.fn().mockResolvedValue({ paste: saved })
    const onSend = vi.fn()
    render(<ChatInput onSend={onSend} pastes={{ inlineMaxBytes: 1000, upload }} />)
    expect(pasteText(big)).toBe(false)
    expect(upload).toHaveBeenCalledWith(big)
    expect(screen.getByText('Saving…')).toBeInTheDocument()
    fireEvent.keyDown(textarea(), { key: 'Enter' })
    expect(onSend).not.toHaveBeenCalled()

    await screen.findByText('paste-3.txt')
    expect(screen.getByText('200 lines · 2.34 KB')).toBeInTheDocument()
    fireEvent.change(textarea(), { target: { value: 'summarize' } })
    fireEvent.keyDown(textarea(), { key: 'Enter' })
    expect(onSend).toHaveBeenCalledWith(`summarize\n\n${saved.placeholder}`, undefined, undefined, [
      saved,
    ])
    expect(screen.queryByTestId('paste-file-card')).toBeNull()
  })

  it('puts the text in the box when the target cannot store pastes', async () => {
    const upload = vi.fn().mockResolvedValue({ unsupported: true })
    render(<ChatInput onSend={vi.fn()} pastes={{ inlineMaxBytes: 1000, upload }} />)
    pasteText(big)
    await vi.waitFor(() => expect(textarea().value).toBe(big))
    expect(screen.queryByTestId('paste-file-card')).toBeNull()
  })

  it('shows an upload that never reached the machine as failed', async () => {
    const upload = vi.fn().mockRejectedValue(new Error('Failed to fetch'))
    render(<ChatInput onSend={vi.fn()} pastes={{ inlineMaxBytes: 1000, upload }} />)
    pasteText(big)
    expect(await screen.findByText('Failed to fetch')).toBeInTheDocument()
  })

  it('keeps a paste removed while saving out of the box', async () => {
    let answer: (result: PasteUploadResult) => void = () => {}
    const upload = vi.fn(
      () =>
        new Promise<PasteUploadResult>((resolve) => {
          answer = resolve
        }),
    )
    render(<ChatInput onSend={vi.fn()} pastes={{ inlineMaxBytes: 1000, upload }} />)
    pasteText(big)
    fireEvent.click(screen.getByRole('button', { name: 'Remove paste' }))
    await act(async () => answer({ unsupported: true }))
    expect(textarea().value).toBe('')
  })

  it('leaves pastes as text until the limit is known, then cards the big ones', async () => {
    const upload = vi.fn().mockResolvedValue({ paste: saved })
    const { rerender } = render(
      <ChatInput onSend={vi.fn()} pastes={{ inlineMaxBytes: undefined, upload }} />,
    )
    expect(pasteText(big)).toBe(true)
    fireEvent.change(textarea(), { target: { value: big } })
    expect(upload).not.toHaveBeenCalled()

    rerender(<ChatInput onSend={vi.fn()} pastes={{ inlineMaxBytes: 1000, upload }} />)
    expect(textarea().value).toBe('')
    expect(await screen.findByText('paste-3.txt')).toBeInTheDocument()
  })

  // At most 1MiB of text goes inline per message, however it is split.
  const first = 'first\n'.repeat(100_000)
  const second = 'second\n'.repeat(90_000)

  it('cards a paste that would push the message past what goes inline', () => {
    const upload = vi.fn().mockResolvedValue({ paste: saved })
    render(<ChatInput onSend={vi.fn()} pastes={{ inlineMaxBytes: 1 << 20, upload }} />)
    expect(pasteText(first)).toBe(true)
    fireEvent.change(textarea(), { target: { value: first } })
    expect(pasteText(second)).toBe(false)
    expect(upload).toHaveBeenCalledWith(second)
    expect(textarea().value).toBe(first)
  })

  it('cards the latest pastes once the limit is known if together they are too much', async () => {
    const upload = vi.fn().mockResolvedValue({ paste: saved })
    const { rerender } = render(
      <ChatInput onSend={vi.fn()} pastes={{ inlineMaxBytes: undefined, upload }} />,
    )
    pasteText(first)
    pasteText(second)
    fireEvent.change(textarea(), { target: { value: `${first}${second}` } })

    rerender(<ChatInput onSend={vi.fn()} pastes={{ inlineMaxBytes: 1 << 20, upload }} />)
    expect(textarea().value).toBe(first)
    expect(upload).toHaveBeenCalledWith(second)
    expect(await screen.findByText('paste-3.txt')).toBeInTheDocument()
  })

  // What the composer shows must match what the new model will be sent.
  it('moves pastes between the box and cards when the model changes', async () => {
    const upload = vi.fn().mockResolvedValue({ paste: saved })
    const { rerender } = render(
      <ChatInput onSend={vi.fn()} pastes={{ inlineMaxBytes: 10_000, upload }} />,
    )
    pasteText(big)
    fireEvent.change(textarea(), { target: { value: `look: ${big}` } })

    rerender(<ChatInput onSend={vi.fn()} pastes={{ inlineMaxBytes: 1000, upload }} />)
    expect(textarea().value).toBe('look: ')
    expect(upload).toHaveBeenCalledWith(big)
    await screen.findByText('paste-3.txt')

    rerender(<ChatInput onSend={vi.fn()} pastes={{ inlineMaxBytes: 10_000, upload }} />)
    expect(screen.queryByTestId('paste-file-card')).toBeNull()
    expect(textarea().value).toBe(`look: \n\n${big}`)

    // Back to a card as the limit settles again: the saved paste is reused.
    rerender(<ChatInput onSend={vi.fn()} pastes={{ inlineMaxBytes: 1000, upload }} />)
    expect(await screen.findByText('paste-3.txt')).toBeInTheDocument()
    expect(upload).toHaveBeenCalledTimes(1)
  })
})

describe('ChatInput height', () => {
  it('fits its text again when its width changes', () => {
    let notify: (() => void) | undefined
    const original = globalThis.ResizeObserver
    globalThis.ResizeObserver = class {
      constructor(cb: () => void) {
        notify = cb
      }
      observe() {}
      disconnect() {}
      unobserve() {}
    } as unknown as typeof ResizeObserver
    try {
      render(<ChatInput onSend={vi.fn()} />)
      const box = textarea()
      let width = 120
      let scrollHeight = 180
      Object.defineProperty(box, 'clientWidth', { configurable: true, get: () => width })
      Object.defineProperty(box, 'scrollHeight', { configurable: true, get: () => scrollHeight })
      // The first measurement happened at jsdom's zero width; a wider box
      // wraps less, so it is measured again.
      width = 600
      scrollHeight = 26
      act(() => notify?.())
      expect(box.style.height).toBe('26px')
      // A change of height alone, such as its own resize, measures nothing.
      scrollHeight = 999
      act(() => notify?.())
      expect(box.style.height).toBe('26px')
    } finally {
      globalThis.ResizeObserver = original
    }
  })
})

describe('ChatInput tools', () => {
  afterEach(() => {
    chatState.tools = []
  })

  it("leaves the chat's tools out where they do not apply", () => {
    chatState.adapter.attachments = undefined
    chatState.tools = [{ id: 'list_clusters', label: 'Clusters' }]
    const { rerender } = render(<ChatInput onSend={vi.fn()} />)
    expect(screen.getByRole('button', { name: /tools/i })).toBeInTheDocument()

    rerender(<ChatInput onSend={vi.fn()} tools={false} />)
    expect(screen.queryByRole('button', { name: /tools/i })).not.toBeInTheDocument()
  })
})

const typeInBox = (value: string) => fireEvent.change(textarea(), { target: { value } })
const pressEnter = () => fireEvent.keyDown(textarea(), { key: 'Enter' })
const pressUp = (init?: KeyboardEventInit) =>
  fireEvent.keyDown(textarea(), { key: 'ArrowUp', ...init })
const pressDown = () => fireEvent.keyDown(textarea(), { key: 'ArrowDown' })

describe('ChatInput failed sends', () => {
  it.each([
    ['false', () => false],
    ['a promise of false', () => Promise.resolve(false)],
  ])('puts the text back when the host answers %s', async (_answer, onSend) => {
    render(<ChatInput onSend={onSend} conversationId="c1" />)
    typeInBox("I'm still here")
    pressEnter()
    await vi.waitFor(() => expect(textarea().value).toBe("I'm still here"))
    expect(JSON.parse(storage.get('aiChatDraft:c1') ?? '').text).toBe("I'm still here")
  })

  it('puts the text back and reports the error when the send rejects', async () => {
    const report = vi.spyOn(console, 'error').mockImplementation(() => {})
    const failure = new Error('unreachable')
    render(<ChatInput onSend={() => Promise.reject(failure)} conversationId="c1" />)
    typeInBox('try this')
    pressEnter()
    await vi.waitFor(() => expect(textarea().value).toBe('try this'))
    expect(report).toHaveBeenCalledWith('Failed to send message:', failure)
    report.mockRestore()
  })

  it.each([
    ['nothing', () => undefined],
    ['true', () => true],
    ['a promise of true', () => Promise.resolve(true)],
    ['a value that is not false', () => 0],
  ])('leaves the box empty when the host answers %s', async (_answer, onSend) => {
    render(<ChatInput onSend={onSend} conversationId="c1" />)
    typeInBox('sent')
    pressEnter()
    await act(async () => {})
    expect(textarea().value).toBe('')
    expect(storage.has('aiChatDraft:c1')).toBe(false)
  })

  it('keeps what was typed while the send was out, under the text it puts back', async () => {
    let fail = (_ok: boolean) => {}
    const onSend = () => new Promise<boolean>((resolve) => (fail = resolve))
    render(<ChatInput onSend={onSend} conversationId="c1" />)
    typeInBox('first thought')
    pressEnter()
    typeInBox('second thought')
    await act(async () => fail(false))
    expect(textarea().value).toBe('first thought\n\nsecond thought')
  })

  it('replaces an entry recalled while the send was out', async () => {
    appendHistory('agents', 'older prompt')
    let fail = (_ok: boolean) => {}
    const onSend = () => new Promise<boolean>((resolve) => (fail = resolve))
    render(<ChatInput onSend={onSend} conversationId="c1" history={{ name: 'agents' }} />)
    typeInBox('failed prompt')
    pressEnter()
    pressUp()
    pressUp()
    expect(textarea().value).toBe('older prompt')
    await act(async () => fail(false))
    expect(textarea().value).toBe('failed prompt')
  })

  it('saves the text as the draft of the conversation it was sent from', async () => {
    let fail = (_ok: boolean) => {}
    const onSend = () => new Promise<boolean>((resolve) => (fail = resolve))
    const { rerender } = render(<ChatInput onSend={onSend} conversationId="c1" />)
    typeInBox('for the first conversation')
    pressEnter()
    rerender(<ChatInput onSend={onSend} conversationId="c2" />)
    await act(async () => fail(false))
    expect(textarea().value).toBe('')
    expect(JSON.parse(storage.get('aiChatDraft:c1') ?? '').text).toBe('for the first conversation')
    expect(storage.has('aiChatDraft:c2')).toBe(false)
  })

  it('does not overwrite a draft written in the conversation it was sent from', async () => {
    let fail = (_ok: boolean) => {}
    const onSend = () => new Promise<boolean>((resolve) => (fail = resolve))
    const { rerender } = render(<ChatInput onSend={onSend} conversationId="c1" />)
    typeInBox('sent text')
    pressEnter()
    rerender(<ChatInput onSend={onSend} conversationId="c2" />)
    storage.set('aiChatDraft:c1', JSON.stringify({ text: 'newer draft', savedAt: Date.now() }))
    await act(async () => fail(false))
    expect(JSON.parse(storage.get('aiChatDraft:c1') ?? '').text).toBe('newer draft')
  })

  it('still saves the draft when the box is gone by the time the send fails', async () => {
    let fail = (_ok: boolean) => {}
    const onSend = () => new Promise<boolean>((resolve) => (fail = resolve))
    const { unmount } = render(<ChatInput onSend={onSend} conversationId="c1" />)
    typeInBox('left behind')
    pressEnter()
    unmount()
    await act(async () => fail(false))
    expect(JSON.parse(storage.get('aiChatDraft:c1') ?? '').text).toBe('left behind')
  })

  it('leaves a newer draft alone when the box was replaced while the send was out', async () => {
    let fail = (_ok: boolean) => {}
    const onSend = () => new Promise<boolean>((resolve) => (fail = resolve))
    const { unmount } = render(<ChatInput onSend={onSend} conversationId="c1" />)
    typeInBox('sent text')
    pressEnter()
    unmount()
    render(<ChatInput onSend={onSend} conversationId="c1" />)
    typeInBox('newer draft')
    await act(async () => fail(false))
    expect(JSON.parse(storage.get('aiChatDraft:c1') ?? '').text).toBe('newer draft')
  })

  it('does not bring back text that must not be remembered', async () => {
    const history = { name: 'agents', skip: (text: string) => text.startsWith('/auth') }
    render(<ChatInput onSend={() => false} conversationId="c1" history={history} />)
    typeInBox('/auth secret-token')
    pressEnter()
    await act(async () => {})
    expect(textarea().value).toBe('')
    expect(storage.has('aiChatDraft:c1')).toBe(false)
  })

  it('drops the draft as it starts to hold what must not be remembered', () => {
    const history = { name: 'agents', skip: (text: string) => text.startsWith('/auth') }
    render(<ChatInput onSend={vi.fn()} conversationId="c1" history={history} />)
    typeInBox('/aut')
    expect(storage.has('aiChatDraft:c1')).toBe(true)
    typeInBox('/auth secret-token')
    expect(storage.has('aiChatDraft:c1')).toBe(false)
  })

  it('keeps both when two sends fail before the box renders', async () => {
    const fails: ((ok: boolean) => void)[] = []
    const onSend = () => new Promise<boolean>((resolve) => fails.push(resolve))
    render(<ChatInput onSend={onSend} conversationId="c1" />)
    typeInBox('first')
    pressEnter()
    typeInBox('second')
    pressEnter()
    await act(async () => {
      for (const fail of fails) {
        fail(false)
      }
    })
    expect(textarea().value).toBe('second\n\nfirst')
  })

  it('puts paste cards back so the same paste can be sent again', async () => {
    const saved = { id: 3, name: 'paste-3.txt', placeholder: '[Pasted #3]' }
    const upload = vi.fn().mockResolvedValue({ paste: saved })
    const onSend = vi.fn().mockResolvedValueOnce(false).mockResolvedValue(undefined)
    render(<ChatInput onSend={onSend} pastes={{ inlineMaxBytes: 1000, upload }} />)
    fireEvent.paste(textarea(), {
      clipboardData: { files: [], getData: () => 'x\n'.repeat(1200) },
    })
    await screen.findByText('paste-3.txt')
    typeInBox('summarize')
    pressEnter()
    await screen.findByText('paste-3.txt')
    expect(textarea().value).toBe('summarize')

    pressEnter()
    expect(upload).toHaveBeenCalledTimes(1)
    expect(onSend).toHaveBeenLastCalledWith(
      `summarize\n\n${saved.placeholder}`,
      undefined,
      undefined,
      [saved],
    )
    await act(async () => {})
    expect(screen.queryByText('paste-3.txt')).toBeNull()
  })

  it('puts attachments back with the tray open', async () => {
    const attachment = {
      id: 'a1',
      filename: 'trace.log',
      mimeType: 'text/plain',
      size: 12,
      uploaded: true,
    } as Attachment
    render(<ChatInput onSend={() => Promise.resolve(false)} conversationId="c1" />)
    pasteFiles([new File(['trace'], 'trace.log')])
    act(() => uploadProps.current?.onAttachmentsChange([attachment]))
    typeInBox('see attached')
    pressEnter()
    await vi.waitFor(() => expect(textarea().value).toBe('see attached'))
    expect(screen.getByTestId('attachment-upload')).toBeInTheDocument()
    expect(uploadProps.current?.attachments).toEqual([attachment])
  })

  it('returns focus once the host lets go of the box', async () => {
    let fail = (_ok: boolean) => {}
    const onSend = () => new Promise<boolean>((resolve) => (fail = resolve))
    const { rerender } = render(<ChatInput onSend={onSend} conversationId="c1" />)
    typeInBox('hold on')
    textarea().focus()
    pressEnter()
    // A browser takes focus off a box as it is disabled; jsdom leaves it there.
    textarea().blur()
    rerender(<ChatInput onSend={onSend} conversationId="c1" disabled />)
    await act(async () => fail(false))
    expect(textarea()).not.toHaveFocus()

    rerender(<ChatInput onSend={onSend} conversationId="c1" />)
    expect(textarea()).toHaveFocus()
  })

  it('leaves focus on what took it while the send was out', async () => {
    let fail = (_ok: boolean) => {}
    const onSend = () => new Promise<boolean>((resolve) => (fail = resolve))
    render(
      <>
        <input aria-label="search" />
        <ChatInput onSend={onSend} conversationId="c1" />
      </>,
    )
    typeInBox('hold on')
    pressEnter()
    screen.getByLabelText('search').focus()
    await act(async () => fail(false))
    expect(textarea().value).toBe('hold on')
    expect(screen.getByLabelText('search')).toHaveFocus()
  })
})

describe('ChatInput history', () => {
  const history = { name: 'agents' }
  const sendAll = (...texts: string[]) => {
    for (const text of texts) {
      typeInBox(text)
      pressEnter()
    }
  }

  it('walks back through what was sent and forward to an empty box', () => {
    render(<ChatInput onSend={vi.fn()} history={history} />)
    sendAll('first', 'second')
    pressUp()
    expect(textarea().value).toBe('second')
    pressUp()
    expect(textarea().value).toBe('first')
    pressUp()
    expect(textarea().value).toBe('first')
    pressDown()
    expect(textarea().value).toBe('second')
    pressDown()
    expect(textarea().value).toBe('')
  })

  it('recalls a send that failed', async () => {
    render(<ChatInput onSend={() => false} history={history} />)
    typeInBox('this one failed')
    pressEnter()
    await vi.waitFor(() => expect(textarea().value).toBe('this one failed'))
    typeInBox('')
    pressUp()
    expect(textarea().value).toBe('this one failed')
  })

  it('shares a history between composers of the same name, across reloads', () => {
    const { unmount } = render(<ChatInput onSend={vi.fn()} history={history} conversationId="c1" />)
    sendAll('from the first page')
    unmount()
    render(<ChatInput onSend={vi.fn()} history={history} conversationId="c2" />)
    pressUp()
    expect(textarea().value).toBe('from the first page')
  })

  it('keeps out what the host says must not be remembered', () => {
    const skip = (text: string) => text.startsWith('/auth')
    render(<ChatInput onSend={vi.fn()} history={{ name: 'agents', skip }} />)
    sendAll('kept', '/auth secret-token')
    expect(tabStorage.get('aiChatHistory:agents')).not.toContain('secret-token')
    pressUp()
    expect(textarea().value).toBe('kept')
  })

  it('remembers nothing without a history', () => {
    render(<ChatInput onSend={vi.fn()} />)
    sendAll('not remembered')
    pressUp()
    expect(textarea().value).toBe('')
    expect(tabStorage.size).toBe(0)
  })

  it('does not record a send with no text', () => {
    render(<ChatInput onSend={vi.fn()} allowEmpty history={history} />)
    pressEnter()
    expect(readHistory('agents')).toEqual([])
  })

  it('leaves the arrows to the caret in a draft', () => {
    render(<ChatInput onSend={vi.fn()} history={history} />)
    sendAll('sent')
    typeInBox('a draft')
    const notPrevented = pressUp()
    expect(notPrevented).toBe(true)
    expect(textarea().value).toBe('a draft')
  })

  it('hands the arrows back once the caret leaves the end of a recalled entry', () => {
    render(<ChatInput onSend={vi.fn()} history={history} />)
    sendAll('older', 'line one\nline two')
    pressUp()
    textarea().setSelectionRange(3, 3)
    expect(pressUp()).toBe(true)
    expect(textarea().value).toBe('line one\nline two')
  })

  it('treats an edited entry as a draft', () => {
    render(<ChatInput onSend={vi.fn()} history={history} />)
    sendAll('older', 'newer')
    pressUp()
    typeInBox('newer, edited')
    pressUp()
    expect(textarea().value).toBe('newer, edited')
  })

  it('reads an entry retyped after an edit as typing, not a recall', () => {
    const slash = { commands: [{ name: 'review' }], label: 'Commands' }
    render(<ChatInput onSend={vi.fn()} history={history} slash={slash} />)
    sendAll('/review')
    pressUp()
    expect(screen.queryByTestId('slash-menu')).toBeNull()
    typeInBox('/revie')
    typeInBox('/review')
    expect(screen.getByTestId('slash-menu')).toBeInTheDocument()
  })

  it('does not save a recalled entry as the draft', () => {
    render(<ChatInput onSend={vi.fn()} history={history} conversationId="c1" />)
    sendAll('sent')
    pressUp()
    expect(storage.has('aiChatDraft:c1')).toBe(false)
  })

  it('moves a sent recalled entry to the newest place', () => {
    render(<ChatInput onSend={vi.fn()} history={history} />)
    sendAll('older', 'newer')
    pressUp()
    pressUp()
    pressEnter()
    expect(readHistory('agents')).toEqual(['older', 'newer', 'older'])
  })

  it('leaves arrows with a modifier or inside a composition alone', () => {
    render(<ChatInput onSend={vi.fn()} history={history} />)
    sendAll('sent')
    pressUp({ shiftKey: true })
    pressUp({ metaKey: true })
    pressUp({ isComposing: true })
    expect(textarea().value).toBe('')
  })

  it('takes ↑ over from editing the last message, until there is nothing to recall', () => {
    const onEditLastMessage = vi.fn()
    render(<ChatInput onSend={vi.fn()} history={history} onEditLastMessage={onEditLastMessage} />)
    pressUp()
    expect(onEditLastMessage).toHaveBeenCalledTimes(1)
    sendAll('sent')
    pressUp()
    expect(textarea().value).toBe('sent')
    expect(onEditLastMessage).toHaveBeenCalledTimes(1)
  })

  it('opens no slash menu on a recalled command, and ↑ keeps walking past it', () => {
    const slash = { commands: [{ name: 'review' }], label: 'Commands' }
    render(<ChatInput onSend={vi.fn()} history={history} slash={slash} />)
    sendAll('older', '/review')
    pressUp()
    expect(textarea().value).toBe('/review')
    expect(screen.queryByTestId('slash-menu')).toBeNull()
    pressUp()
    expect(textarea().value).toBe('older')
  })

  it('leaves ↑ to the slash menu while a command is being typed', () => {
    const slash = { commands: [{ name: 'review' }, { name: 'plan' }], label: 'Commands' }
    render(<ChatInput onSend={vi.fn()} history={history} slash={slash} />)
    sendAll('sent')
    typeInBox('/')
    expect(screen.getByTestId('slash-menu')).toBeInTheDocument()
    pressUp()
    expect(textarea().value).toBe('/')
  })
})

describe('chatHistory', () => {
  it('skips a repeat of the newest entry', () => {
    appendHistory('h', 'same')
    appendHistory('h', 'same')
    expect(readHistory('h')).toEqual(['same'])
  })

  it('keeps the newest entries when it runs out of room', () => {
    for (let i = 0; i < HISTORY_MAX_ENTRIES + 5; i++) {
      appendHistory('h', `entry ${i}`)
    }
    const kept = readHistory('h')
    expect(kept).toHaveLength(HISTORY_MAX_ENTRIES)
    expect(kept.at(0)).toBe('entry 5')
    expect(kept.at(-1)).toBe(`entry ${HISTORY_MAX_ENTRIES + 4}`)
  })

  it('stays inside its character budget', () => {
    for (let i = 0; i < 20; i++) {
      appendHistory('h', `${i} `.padEnd(DRAFT_MAX_LENGTH, 'x'))
    }
    const kept = readHistory('h')
    expect(kept.join('').length).toBeLessThanOrEqual(HISTORY_MAX_CHARS)
    expect(kept.at(-1)?.startsWith('19 ')).toBe(true)
  })

  it('keeps a prompt too long to be a draft', () => {
    const long = 'x'.repeat(DRAFT_MAX_LENGTH + 1)
    appendHistory('h', long)
    expect(readHistory('h')).toEqual([long])
  })

  it('does not keep text over its budget', () => {
    appendHistory('h', 'x'.repeat(HISTORY_MAX_CHARS + 1))
    expect(readHistory('h')).toEqual([])
  })

  it('stays out of storage that outlives the tab', () => {
    appendHistory('h', 'temporary')
    expect([...storage.keys()].some((key) => key.startsWith('aiChatHistory:'))).toBe(false)
  })

  it.each([
    ['text that is not JSON', 'nonsense'],
    ['JSON that is not a list', '{"text":"x"}'],
    ['entries that are not text', '[1,{"text":2}]'],
  ])('reads %s as an empty history', (_what, raw) => {
    tabStorage.set('aiChatHistory:h', raw)
    expect(readHistory('h')).toEqual([])
  })
})

describe('ChatInput emoji shortcodes', () => {
  const typeKeys = (keys: string) => {
    for (const key of keys) {
      const el = textarea()
      const caret = el.selectionStart + key.length
      fireEvent.change(el, {
        target: {
          value: el.value.slice(0, el.selectionStart) + key + el.value.slice(el.selectionEnd),
          selectionStart: caret,
          selectionEnd: caret,
        },
      })
    }
  }

  it('turns a shortcode into its emoji as its closing colon is typed', () => {
    const onSend = vi.fn()
    render(<ChatInput onSend={onSend} conversationId="c1" />)
    typeKeys('look :eyes:')
    expect(textarea().value).toBe('look 👀')
    expect(JSON.parse(storage.get('aiChatDraft:c1') ?? '').text).toBe('look 👀')
    typeKeys(', ok')
    expect(textarea().value).toBe('look 👀, ok')
    pressEnter()
    expect(onSend).toHaveBeenCalledWith('look 👀, ok', undefined, undefined)
  })

  it('keeps the text after the caret, and the caret beside the emoji', () => {
    render(<ChatInput onSend={vi.fn()} />)
    typeInBox('see :eyes later')
    textarea().setSelectionRange('see :eyes'.length, 'see :eyes'.length)
    typeKeys(':!')
    expect(textarea().value).toBe('see 👀! later')
    expect(textarea().selectionStart).toBe('see 👀!'.length)
  })

  it('completes a shortcode in a recalled prompt', () => {
    render(<ChatInput onSend={vi.fn()} history={{ name: 'agents' }} />)
    typeInBox(':eyes')
    pressEnter()
    pressUp()
    typeKeys(':')
    expect(textarea().value).toBe('👀')
    expect(readHistory('agents')).toEqual([':eyes'])
  })

  it.each([
    [true, ':eyes:'],
    [false, '👀'],
  ])('with an input method composing %s, the closing colon leaves %j', (isComposing, want) => {
    render(<ChatInput onSend={vi.fn()} />)
    typeInBox(':eyes')
    fireEvent.input(textarea(), {
      target: { value: ':eyes:', selectionStart: 6, selectionEnd: 6 },
      isComposing,
    })
    expect(textarea().value).toBe(want)
  })

  it('leaves pasted, unknown and mid-word shortcodes as written', () => {
    render(<ChatInput onSend={vi.fn()} />)
    typeInBox(':eyes:')
    expect(textarea().value).toBe(':eyes:')
    typeInBox('')
    typeKeys(':notanemoji: https://example.com/:eyes:')
    expect(textarea().value).toBe(':notanemoji: https://example.com/:eyes:')
  })
})
