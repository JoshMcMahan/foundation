// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { fireEvent, render } from '@testing-library/react'
import type { useChat, useChatStream } from '../core/ChatProvider'
import type { ApprovalPart, ChatMessage as Message, ToolCallPart } from '../types'
import ChatMessageList from './ChatMessageList'

type ChatState = ReturnType<typeof useChat> & ReturnType<typeof useChatStream>

const mockChat = {
  adapter: { attachments: undefined },
  isStreaming: true,
  isThinking: false,
  streamingContent: '',
  streamingReasoning: '',
  streamingParts: [],
  thinkingStartTime: null,
} as unknown as ChatState

const messageRenders: string[] = []

vi.mock('../core/ChatProvider', () => ({
  useChat: () => mockChat,
  useChatStream: () => mockChat,
}))

vi.mock('./ChatMessage', () => ({
  __esModule: true,
  default: (props: { message: Message }) => {
    messageRenders.push(props.message.id)
    return <div data-testid="chat-message" />
  },
}))

vi.mock('../ui/Markdown', () => ({
  __esModule: true,
  default: ({ children }: { children: string }) => <div>{children}</div>,
}))

vi.mock('./agent/AgentMessageParts', () => ({
  __esModule: true,
  default: () => <div data-testid="agent-parts" />,
}))

const createMockMessage = (overrides: Partial<Message> = {}): Message => ({
  id: `msg-${Math.random().toString(36).substring(7)}`,
  role: 'user',
  content: 'Test message content',
  ...overrides,
})

function renderStreaming(content: string) {
  const props = {
    messages: [createMockMessage({ id: 'm1' })],
    allMessages: [] as Message[],
  }
  const result = render(
    <ChatMessageList
      {...props}
      streamingMessage={createMockMessage({
        id: 'stream',
        role: 'assistant',
        content,
      })}
    />,
  )
  const rerenderStreaming = (nextContent: string) =>
    result.rerender(
      <ChatMessageList
        {...props}
        streamingMessage={createMockMessage({
          id: 'stream',
          role: 'assistant',
          content: nextContent,
        })}
      />,
    )
  const container = result.container.firstElementChild as HTMLElement
  return { container, rerenderStreaming }
}

function setDimensions(
  el: HTMLElement,
  { scrollHeight, clientHeight }: { scrollHeight: number; clientHeight: number },
) {
  Object.defineProperty(el, 'scrollHeight', {
    configurable: true,
    value: scrollHeight,
  })
  Object.defineProperty(el, 'clientHeight', {
    configurable: true,
    value: clientHeight,
  })
}

// Arms stick-to-bottom: a 1000px-tall document in a 400px viewport, scrolled
// to the very bottom, with a scroll event so the tracker records the position.
function armAtBottom(container: HTMLElement) {
  setDimensions(container, { scrollHeight: 1000, clientHeight: 400 })
  container.scrollTop = 600
  fireEvent.scroll(container)
}

describe('ChatMessageList stick-to-bottom', () => {
  it('follows the stream while the user sits at the bottom', () => {
    const { container, rerenderStreaming } = renderStreaming('a')
    armAtBottom(container)

    setDimensions(container, { scrollHeight: 1200, clientHeight: 400 })
    rerenderStreaming('ab')

    expect(container.scrollTop).toBe(1200)
  })

  it('keeps following after a wheel-down', () => {
    const { container, rerenderStreaming } = renderStreaming('a')
    armAtBottom(container)

    fireEvent.wheel(container, { deltaY: 40 })
    setDimensions(container, { scrollHeight: 1200, clientHeight: 400 })
    rerenderStreaming('ab')

    expect(container.scrollTop).toBe(1200)
  })

  it('releases on wheel-up and stays released within the threshold', () => {
    const { container, rerenderStreaming } = renderStreaming('a')
    armAtBottom(container)

    // A small wheel-up leaves the user within the 24px re-arm threshold; the
    // wheel release must win and the following scroll event must not re-arm.
    fireEvent.wheel(container, { deltaY: -10 })
    container.scrollTop = 590
    fireEvent.scroll(container)

    setDimensions(container, { scrollHeight: 1200, clientHeight: 400 })
    rerenderStreaming('ab')

    expect(container.scrollTop).toBe(590)
  })

  it('releases on scrolls past the threshold without a wheel event', () => {
    const { container, rerenderStreaming } = renderStreaming('a')
    armAtBottom(container)

    // Keyboard or scrollbar-drag scrolling produces only scroll events.
    container.scrollTop = 400
    fireEvent.scroll(container)

    setDimensions(container, { scrollHeight: 1200, clientHeight: 400 })
    rerenderStreaming('ab')

    expect(container.scrollTop).toBe(400)
  })

  it('re-arms when the user scrolls back down to the bottom', () => {
    const { container, rerenderStreaming } = renderStreaming('a')
    armAtBottom(container)

    fireEvent.wheel(container, { deltaY: -10 })
    container.scrollTop = 400
    fireEvent.scroll(container)

    container.scrollTop = 585
    fireEvent.scroll(container)

    setDimensions(container, { scrollHeight: 1200, clientHeight: 400 })
    rerenderStreaming('ab')

    expect(container.scrollTop).toBe(1200)
  })

  it('an upward scroll near the bottom never re-arms', () => {
    const { container, rerenderStreaming } = renderStreaming('a')
    armAtBottom(container)

    fireEvent.wheel(container, { deltaY: -10 })
    // Drift upward in tiny steps, every position within the threshold.
    container.scrollTop = 595
    fireEvent.scroll(container)
    container.scrollTop = 590
    fireEvent.scroll(container)

    setDimensions(container, { scrollHeight: 1200, clientHeight: 400 })
    rerenderStreaming('ab')

    expect(container.scrollTop).toBe(590)
  })

  it('releases on touch scrolling', () => {
    const { container, rerenderStreaming } = renderStreaming('a')
    armAtBottom(container)

    fireEvent.touchMove(container)
    container.scrollTop = 590
    fireEvent.scroll(container)

    setDimensions(container, { scrollHeight: 1200, clientHeight: 400 })
    rerenderStreaming('ab')

    expect(container.scrollTop).toBe(590)
  })
})

describe('ChatMessageList after a reply', () => {
  let resized: (() => void) | undefined

  beforeEach(() => {
    mockChat.isStreaming = false
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(callback: () => void) {
          resized = callback
        }
        observe() {}
        disconnect() {}
      },
    )
  })

  afterEach(() => {
    mockChat.isStreaming = true
    resized = undefined
    vi.unstubAllGlobals()
  })

  const renderDone = () => {
    const props = { allMessages: [] as Message[] }
    const result = render(
      <ChatMessageList {...props} messages={[createMockMessage({ id: 'm1' })]} />,
    )
    const container = result.container.firstElementChild as HTMLElement
    const addMessage = () =>
      result.rerender(
        <ChatMessageList
          {...props}
          messages={[createMockMessage({ id: 'm1' }), createMockMessage({ id: 'm2' })]}
        />,
      )
    return { container, addMessage }
  }

  it('scrolls only the list to a new message, never the page around it', () => {
    const scrollIntoView = vi.fn()
    Element.prototype.scrollIntoView = scrollIntoView
    const { container, addMessage } = renderDone()
    const scrollTo = vi.fn()
    container.scrollTo = scrollTo as typeof container.scrollTo
    armAtBottom(container)

    setDimensions(container, { scrollHeight: 1200, clientHeight: 400 })
    addMessage()

    expect(scrollTo).toHaveBeenCalledWith(expect.objectContaining({ top: 1200 }))
    expect(scrollIntoView).not.toHaveBeenCalled()
  })

  it('lets a reply that finished streaming take its row without entering again', () => {
    const user = createMockMessage({ id: 'm1' })
    const result = render(
      <ChatMessageList
        messages={[user]}
        allMessages={[]}
        isStreaming
        streamingMessage={createMockMessage({ id: 'stream', role: 'assistant', content: 'Done.' })}
      />,
    )
    const container = result.container.firstElementChild as HTMLElement
    const scrollTo = vi.fn()
    container.scrollTo = scrollTo as typeof container.scrollTo
    armAtBottom(container)

    result.rerender(
      <ChatMessageList
        messages={[user, createMockMessage({ id: 'm2', role: 'assistant', content: 'Done.' })]}
        allMessages={[]}
        isStreaming={false}
        streamingMessage={null}
      />,
    )

    const rows = result.getAllByTestId('chat-message')
    expect(rows).toHaveLength(2)
    expect(rows[1]?.parentElement).not.toHaveClass('animate-chat-enter')
    expect(scrollTo).not.toHaveBeenCalled()
  })

  it('still lets a new question enter', () => {
    const { container, addMessage } = renderDone()
    armAtBottom(container)
    addMessage()
    const rows = container.querySelectorAll('[data-testid="chat-message"]')
    expect(rows[1]?.parentElement).toHaveClass('animate-chat-enter')
  })

  it('follows a card that keeps growing while the reader sits at the bottom', () => {
    const { container } = renderDone()
    armAtBottom(container)

    setDimensions(container, { scrollHeight: 1300, clientHeight: 400 })
    resized?.()

    expect(container.scrollTop).toBe(1300)
  })

  it('keeps a row the reader just opened under the pointer', () => {
    const { container } = renderDone()
    armAtBottom(container)
    const before = container.scrollTop
    fireEvent.click(container.querySelector('[data-testid]') ?? container.firstElementChild!)

    setDimensions(container, { scrollHeight: 1300, clientHeight: 400 })
    resized?.()

    expect(container.scrollTop).toBe(before)
  })

  it('leaves the reader where they are once they scrolled up', () => {
    const { container } = renderDone()
    armAtBottom(container)
    fireEvent.wheel(container, { deltaY: -40 })
    container.scrollTop = 200
    fireEvent.scroll(container)

    setDimensions(container, { scrollHeight: 1300, clientHeight: 400 })
    resized?.()

    expect(container.scrollTop).toBe(200)
  })
})

describe('ChatMessageList working indicator', () => {
  const toolPart: ToolCallPart = {
    kind: 'tool_call',
    id: 'tool-1',
    name: 'search',
    args: '{}',
    status: 'ok',
  }

  afterEach(() => {
    mockChat.streamingParts = []
  })

  const renderTurn = (streamingMessage?: Message) =>
    render(
      <ChatMessageList
        messages={[createMockMessage({ id: 'm1' })]}
        allMessages={[]}
        streamingMessage={streamingMessage ?? null}
      />,
    )

  it('stays visible after a tool call has streamed', () => {
    mockChat.streamingParts = [toolPart]

    const { queryByText } = renderTurn()

    expect(queryByText('Thinking…')).toBeInTheDocument()
  })

  it('is visible before any tool call', () => {
    const { queryByText } = renderTurn()

    expect(queryByText('Thinking…')).toBeInTheDocument()
  })

  it('goes away while an approval is waiting on the user', () => {
    const approval: ApprovalPart = {
      kind: 'approval',
      id: 'approval-1',
      approvalKind: 'confirm',
      toolName: 'bash',
    }
    mockChat.streamingParts = [toolPart, approval]

    const { queryByText } = renderTurn()

    expect(queryByText('Thinking…')).not.toBeInTheDocument()
  })

  it('comes back once the approval is answered', () => {
    const approval: ApprovalPart = {
      kind: 'approval',
      id: 'approval-1',
      approvalKind: 'confirm',
      toolName: 'bash',
      resolved: true,
    }
    mockChat.streamingParts = [toolPart, approval]

    const { queryByText } = renderTurn()

    expect(queryByText('Thinking…')).toBeInTheDocument()
  })

  it('goes away once the answer starts streaming', () => {
    mockChat.streamingParts = [toolPart]

    const { queryByText } = renderTurn(
      createMockMessage({ id: 'stream', role: 'assistant', content: 'hi' }),
    )

    expect(queryByText('Thinking…')).not.toBeInTheDocument()
  })
})

describe('ChatMessageList queued messages', () => {
  it('offers removal only for the queued messages the host says can go', () => {
    const onRemoveQueued = vi.fn()
    const { getAllByRole } = render(
      <ChatMessageList
        messages={[]}
        allMessages={[]}
        queuedMessages={[createMockMessage({ id: 'steered' }), createMockMessage({ id: 'queued' })]}
        onRemoveQueued={onRemoveQueued}
        canRemoveQueued={(id) => id === 'queued'}
      />,
    )
    const buttons = getAllByRole('button', { name: 'Remove queued message' })
    expect(buttons).toHaveLength(1)
    fireEvent.click(buttons[0]!)
    expect(onRemoveQueued).toHaveBeenCalledWith('queued')
  })

  it('says when each queued message reaches the model', () => {
    const queued = [createMockMessage({ id: 'steered' }), createMockMessage({ id: 'queued' })]
    const { getAllByTestId, rerender } = render(
      <ChatMessageList
        messages={[]}
        allMessages={[]}
        queuedMessages={queued}
        canRemoveQueued={(id) => id === 'queued'}
        queueDelivery="nextStep"
      />,
    )
    expect(getAllByTestId('queued-status').map((el) => el.textContent)).toEqual([
      'Sent to the running turn',
      'Queued · reaches the agent after its current step',
    ])

    rerender(<ChatMessageList messages={[]} allMessages={[]} queuedMessages={queued} />)
    expect(getAllByTestId('queued-status').map((el) => el.textContent)).toEqual([
      'Queued · sends when this reply finishes',
      'Queued · sends when this reply finishes',
    ])

    rerender(
      <ChatMessageList
        messages={[]}
        allMessages={[]}
        queuedMessages={queued}
        queueDelivery={(id) => (id === 'steered' ? 'nextStep' : 'afterReply')}
      />,
    )
    expect(getAllByTestId('queued-status').map((el) => el.textContent)).toEqual([
      'Queued · reaches the agent after its current step',
      'Queued · sends when this reply finishes',
    ])
  })
})

describe('ChatMessageList as a log', () => {
  it('is a labeled live log, busy while a reply streams', () => {
    const { getByRole, rerender } = render(
      <ChatMessageList messages={[createMockMessage({ id: 'm1' })]} allMessages={[]} />,
    )
    const log = getByRole('log', { name: 'Conversation' })
    expect(log).toHaveAttribute('aria-busy', 'true')
    rerender(
      <ChatMessageList
        messages={[createMockMessage({ id: 'm1' })]}
        allMessages={[]}
        isStreaming={false}
        label="Agent session"
      />,
    )
    expect(getByRole('log', { name: 'Agent session' })).not.toHaveAttribute('aria-busy')
  })
})

describe('ChatMessageList while a reply streams', () => {
  afterEach(() => {
    mockChat.streamingContent = ''
    mockChat.isStreaming = true
  })

  it("shows the provider's reply without re-rendering the conversation per token", () => {
    const messages = [
      createMockMessage({ id: 'q', role: 'user' }),
      createMockMessage({ id: 'a', role: 'assistant' }),
    ]
    mockChat.streamingContent = 'One'
    const { rerender } = render(<ChatMessageList messages={messages} allMessages={messages} />)
    expect(messageRenders.filter((id) => id === 'streaming')).toHaveLength(1)
    messageRenders.length = 0
    mockChat.streamingContent = 'One two'
    rerender(<ChatMessageList messages={messages} allMessages={messages} />)
    expect(messageRenders).toEqual(['streaming'])
  })

  it('streams the reply inside the parts once they carry its text', () => {
    mockChat.streamingContent = 'Checking costs.'
    mockChat.streamingParts = [
      { kind: 'text', text: 'Checking costs.' },
      { kind: 'tool_call', id: 't1', name: 'cost_summary', args: '{}', status: 'running' },
    ]
    messageRenders.length = 0
    render(<ChatMessageList messages={[createMockMessage({ id: 'm1' })]} allMessages={[]} />)
    expect(messageRenders).not.toContain('streaming')
    mockChat.streamingContent = ''
    mockChat.streamingParts = []
  })

  it("takes the host's reply over the provider's, null included", () => {
    const messages = [createMockMessage({ id: 'q', role: 'user' })]
    mockChat.streamingContent = 'provider text'
    messageRenders.length = 0
    render(<ChatMessageList messages={messages} allMessages={messages} streamingMessage={null} />)
    expect(messageRenders).toEqual(['q'])
  })
})
