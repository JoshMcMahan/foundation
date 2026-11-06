// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { ChatMessage as Message, MessagePart } from '../types'
import SessionView from './SessionView'

const chat = {
  adapter: { attachments: undefined },
  isStreaming: false,
  stopStreaming: vi.fn(),
  isThinking: false,
  streamingContent: '',
  streamingReasoning: '',
  streamingParts: [],
  thinkingStartTime: null,
}

vi.mock('../core/ChatProvider', () => ({
  useChat: () => chat,
  useChatStream: () => chat,
  useChatModelName: () => undefined,
}))

vi.mock('./ChatInput', () => ({
  __esModule: true,
  default: () => <div data-testid="composer" />,
}))

vi.mock('../ui/Markdown', () => ({
  __esModule: true,
  default: ({ children }: { children: string }) => <div>{children}</div>,
}))

const read: MessagePart = {
  kind: 'tool_call',
  id: 't1',
  name: 'ReadFile',
  args: '{"path":"a.ts"}',
  status: 'ok',
  result: 'out',
}
const turn: Message = { id: 'a1', role: 'assistant', parts: [read] }

describe('SessionView foldEveryRun', () => {
  it('reaches a finished message', () => {
    render(<SessionView sessionKey="s1" messages={[turn]} onSend={vi.fn()} foldEveryRun />)
    expect(screen.getByTestId('tool-rollup')).toHaveTextContent('Read 1 file')
  })

  it('reaches the streaming message', () => {
    render(
      <SessionView
        sessionKey="s1"
        messages={[]}
        streamingMessage={turn}
        onSend={vi.fn()}
        foldEveryRun
      />,
    )
    expect(screen.getByTestId('tool-rollup')).toHaveTextContent('Read 1 file')
  })

  it('leaves a lone call unfolded without it', () => {
    render(<SessionView sessionKey="s1" messages={[turn]} onSend={vi.fn()} />)
    expect(screen.queryByTestId('tool-rollup')).toBeNull()
    expect(screen.getByTestId('tool-call-part')).toBeInTheDocument()
  })
})
