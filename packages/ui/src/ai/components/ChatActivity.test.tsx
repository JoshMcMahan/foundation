// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import { ChatConfigProvider, resolveChatConfig } from '../core/config'
import type { MessagePart, TokenUsage } from '../types'
import ChatActivity from './ChatActivity'

const chat = { isStreaming: true, tools: [{ id: 'stop_cluster', label: 'Stop a cluster' }] }
const stream: { streamingParts: MessagePart[]; streamingUsage: TokenUsage | null } = {
  streamingParts: [],
  streamingUsage: null,
}

vi.mock('../core/ChatProvider', () => ({
  useChat: () => chat,
  useChatStream: () => stream,
}))

function renderActivity() {
  return render(
    <ChatConfigProvider value={resolveChatConfig()}>
      <ChatActivity />
    </ChatConfigProvider>,
  )
}

beforeEach(() => {
  chat.isStreaming = true
  stream.streamingParts = []
  stream.streamingUsage = null
})

describe('ChatActivity', () => {
  it('names the tool the reply is running', () => {
    stream.streamingParts = [
      { kind: 'tool_call', id: 'c1', name: 'list_clusters', args: '{}', status: 'ok' },
      { kind: 'tool_call', id: 'c2', name: 'stop_cluster', args: '{}', status: 'running' },
    ]
    renderActivity()

    expect(screen.getByTestId('chat-activity-word')).toHaveTextContent('Stop a cluster…')
  })

  it('says it waits for an answer while a call asks first', () => {
    stream.streamingParts = [
      { kind: 'tool_call', id: 'c1', name: 'stop_cluster', args: '{}', status: 'waiting' },
      { kind: 'approval', id: 'c1', approvalKind: 'confirm', subject: 'call' },
    ]
    renderActivity()

    expect(screen.getByTestId('chat-activity-word')).toHaveTextContent('Waiting for your answer…')
  })

  it('shows nothing once the reply is done', () => {
    chat.isStreaming = false
    const { container } = renderActivity()

    expect(container).toBeEmptyDOMElement()
  })

  it('counts the tokens the reply has used, once the stream reports them', () => {
    stream.streamingUsage = { prompt_tokens: 48_200, completion_tokens: 3_400 }
    renderActivity()

    expect(screen.getByTestId('chat-activity')).toHaveTextContent('48.2K')
    expect(screen.getByTestId('chat-activity')).toHaveTextContent('3.4K')
  })
})
