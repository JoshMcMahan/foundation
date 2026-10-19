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

  it("takes the host's reply over the provider's, null included", () => {
    const messages = [createMockMessage({ id: 'q', role: 'user' })]
    mockChat.streamingContent = 'provider text'
    messageRenders.length = 0
    render(<ChatMessageList messages={messages} allMessages={messages} streamingMessage={null} />)
    expect(messageRenders).toEqual(['q'])
  })
})
