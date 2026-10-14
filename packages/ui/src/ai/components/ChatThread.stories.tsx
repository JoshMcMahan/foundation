import type { Meta, StoryObj } from '@storybook/react-vite'
import { useMemo, useState } from 'react'
import { createMockChatAdapter } from '../adapter/mock'
import {
  makeAgentTurn,
  makeConversation,
  makeHybridTurn,
  makeLongConversation,
  makeStaticAdapter,
  StoryChat,
  StoryViewport,
  sendFromComposer,
} from '../stories/harness'
import ChatEmptyState from './ChatEmptyState'
import ChatLayout from './ChatLayout'
import ChatThread from './ChatThread'

const meta: Meta = {
  title: 'Chat/Thread',
  component: ChatThread,
  parameters: { layout: 'fullscreen' },
}

export default meta

export const Conversation: StoryObj = {
  render: () => (
    <StoryChat>
      <StoryViewport>
        <ChatThread conversationId="conv-1" />
      </StoryViewport>
    </StoryChat>
  ),
}

export const AgentConversation: StoryObj = {
  render: () => (
    <StoryChat
      adapter={makeStaticAdapter({
        conversations: [
          makeConversation({
            id: 'conv-agent',
            title: 'Agent session',
            messages: [
              {
                id: 'u-turn',
                role: 'user',
                content: 'Why is shard 12 failing?',
                conversationId: 'conv-agent',
              },
              { ...makeAgentTurn(), conversationId: 'conv-agent' },
            ],
          }),
        ],
      })}
      conversationId="conv-agent"
    >
      <StoryViewport>
        <ChatThread conversationId="conv-agent" />
      </StoryViewport>
    </StoryChat>
  ),
}

export const StreamingSimulation: StoryObj<{
  wordDelayMs: number
  reasoningMs: number
  replyWords: number
}> = {
  args: { wordDelayMs: 120, reasoningMs: 1500, replyWords: 60 },
  argTypes: {
    wordDelayMs: { control: { type: 'range', min: 10, max: 500 } },
    reasoningMs: { control: { type: 'range', min: 0, max: 8000 } },
    replyWords: { control: { type: 'range', min: 5, max: 400 } },
  },
  render: (args) => {
    const Adapterized = () => {
      const { wordDelayMs, reasoningMs, replyWords } = args
      const adapter = useMemo(
        () => makeStaticAdapter({ streaming: { wordDelayMs, reasoningMs, replyWords } }),
        // Adapterized is rebuilt whenever the story's args change.
        [],
      )
      return (
        <StoryChat adapter={adapter}>
          <StoryViewport>
            <ChatThread conversationId="conv-1" />
          </StoryViewport>
        </StoryChat>
      )
    }
    return <Adapterized />
  },
  play: async ({ canvasElement }) => {
    sendFromComposer(canvasElement, 'Stream me a reply, slowly.')
  },
}

// A reply streamed at the end of a long conversation, beside the list: a
// token should cost the reply it extends, not the turns above it, the
// composer or the list.
export const LongConversation: StoryObj<{
  turns: number
  wordDelayMs: number
  replyWords: number
}> = {
  args: { turns: 100, wordDelayMs: 40, replyWords: 200 },
  argTypes: {
    turns: { control: { type: 'range', min: 1, max: 500 } },
    wordDelayMs: { control: { type: 'range', min: 10, max: 500 } },
    replyWords: { control: { type: 'range', min: 5, max: 400 } },
  },
  render: (args) => {
    const Adapterized = () => {
      const { turns, wordDelayMs, replyWords } = args
      const adapter = useMemo(
        () =>
          makeStaticAdapter({
            conversations: [makeLongConversation(turns)],
            streaming: { wordDelayMs, reasoningMs: 0, replyWords },
          }),
        // Adapterized is rebuilt whenever the story's args change.
        [],
      )
      return (
        <StoryChat adapter={adapter}>
          <StoryViewport>
            <ChatLayout>
              <ChatThread conversationId="conv-1" />
            </ChatLayout>
          </StoryViewport>
        </StoryChat>
      )
    }
    return <Adapterized />
  },
  play: async ({ canvasElement }) => {
    sendFromComposer(canvasElement, 'One more, at length.')
  },
}

// A turn as the reader lives it: the reasoning streams in under a shimmering
// "Thinking" label with its latest lines fading in, then folds into "Thought
// for" while the answer streams below it. Remount to replay.
export const LiveReasoning: StoryObj<{
  reasoningMs: number
  wordDelayMs: number
  replyWords: number
}> = {
  args: { reasoningMs: 6000, wordDelayMs: 70, replyWords: 80 },
  argTypes: {
    reasoningMs: { control: { type: 'range', min: 1000, max: 20000, step: 500 } },
    wordDelayMs: { control: { type: 'range', min: 10, max: 300 } },
    replyWords: { control: { type: 'range', min: 5, max: 400 } },
  },
  render: (args) => {
    const Adapterized = () => {
      const { reasoningMs, wordDelayMs, replyWords } = args
      const adapter = useMemo(
        () =>
          makeStaticAdapter({
            conversations: [makeConversation({ id: 'conv-live', title: 'Build', messages: [] })],
            streaming: { reasoningMs, wordDelayMs, replyWords },
          }),
        // Adapterized is rebuilt whenever the story's args change.
        [],
      )
      return (
        <StoryChat adapter={adapter} conversationId="conv-live">
          <StoryViewport>
            <ChatThread conversationId="conv-live" />
          </StoryViewport>
        </StoryChat>
      )
    }
    return <Adapterized />
  },
  play: async ({ canvasElement }) => {
    sendFromComposer(canvasElement, 'Why does the build hang at step 380?')
  },
}

// A stored chat-surface turn with tool calls: parts render above the answer
// with the normal message chrome, unlike the parts-only agent transcript.
export const ToolCallConversation: StoryObj = {
  render: () => (
    <StoryChat
      adapter={makeStaticAdapter({
        conversations: [
          makeConversation({
            id: 'conv-tools',
            title: 'Workflow DAG',
            messages: [
              {
                id: 'u-dag',
                role: 'user',
                content: 'whats the diagram look like',
                conversationId: 'conv-tools',
              },
              { ...makeHybridTurn(), conversationId: 'conv-tools' },
            ],
          }),
        ],
      })}
      conversationId="conv-tools"
    >
      <StoryViewport>
        <ChatThread conversationId="conv-tools" />
      </StoryViewport>
    </StoryChat>
  ),
}

// Live pipeline: onPart deltas stream tool calls (running → resolved) between
// the thinking header and the reply, and the finished message keeps them.
export const StreamingToolCalls: StoryObj<{
  toolCalls: number
  toolMs: number
  failLastTool: boolean
  reasoningMs: number
  replyWords: number
}> = {
  args: {
    toolCalls: 3,
    toolMs: 900,
    failLastTool: false,
    reasoningMs: 1000,
    replyWords: 40,
  },
  argTypes: {
    toolCalls: { control: { type: 'range', min: 0, max: 6 } },
    toolMs: { control: { type: 'range', min: 100, max: 3000 } },
    reasoningMs: { control: { type: 'range', min: 0, max: 8000 } },
    replyWords: { control: { type: 'range', min: 5, max: 400 } },
  },
  render: (args) => {
    const Adapterized = () => {
      const { toolCalls, toolMs, failLastTool, reasoningMs, replyWords } = args
      const adapter = useMemo(
        () =>
          makeStaticAdapter({
            streaming: { toolCalls, toolMs, failLastTool, reasoningMs, replyWords },
          }),
        // Adapterized is rebuilt whenever the story's args change.
        [],
      )
      return (
        <StoryChat adapter={adapter}>
          <StoryViewport>
            <ChatThread conversationId="conv-1" />
          </StoryViewport>
        </StoryChat>
      )
    }
    return <Adapterized />
  },
  play: async ({ canvasElement }) => {
    sendFromComposer(canvasElement, 'Check the server tests before answering.')
  },
}

// Stateful navigation like the host app's: empty state until a conversation
// exists, then the thread. Full host wiring lives in packages/ai-chat-app.
function Playground() {
  const [conversationId, setConversationId] = useState<string | null>(null)
  const adapter = useMemo(() => createMockChatAdapter({ storageKey: 'workshop-playground' }), [])
  return (
    <StoryChat adapter={adapter} conversationId={conversationId} onNavigate={setConversationId}>
      <StoryViewport>
        <ChatLayout>
          {conversationId ? <ChatThread conversationId={conversationId} /> : <ChatEmptyState />}
        </ChatLayout>
      </StoryViewport>
    </StoryChat>
  )
}

export const MockPlayground: StoryObj = {
  name: 'Interactive playground (mock adapter)',
  render: () => <Playground />,
}
