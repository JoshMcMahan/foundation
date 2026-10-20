import type { Meta, StoryObj } from '@storybook/react-vite'
import { useMemo, useState } from 'react'
import { createMockChatAdapter } from '../adapter/mock'
import type { ToolRendererProps } from '../core/config'
import {
  makeAgentTurn,
  makeConversation,
  makeHeldCallTurn,
  makeHybridTurn,
  makeLongConversation,
  makeStaticAdapter,
  resumeHeldCall,
  StoryChat,
  StoryViewport,
  sendFromComposer,
  storyTeammate,
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

// A call that changes something waits for the reader: Allow resumes the
// reply with the call's result, Deny tells the model why.
export const HeldToolCall: StoryObj = {
  render: () => (
    <StoryChat
      adapter={{
        ...makeStaticAdapter({
          conversations: [
            makeConversation({
              id: 'conv-held',
              title: 'Stop gputraining',
              messages: makeHeldCallTurn(),
            }),
          ],
          tools: [
            {
              id: 'stop_cluster',
              label: 'Stop a cluster',
              description: 'Stops a cluster, keeping its disks',
              asksFirst: true,
            },
          ],
        }),
        streamCompletion: resumeHeldCall,
      }}
      conversationId="conv-held"
    >
      <StoryViewport>
        <ChatThread conversationId="conv-held" />
      </StoryViewport>
    </StoryChat>
  ),
}

function StopOrDestroyCard({ part, approval, onApprovalAnswer }: ToolRendererProps) {
  const [choice, setChoice] = useState<'stop_cluster' | 'destroy_cluster'>('stop_cluster')
  const name = (JSON.parse(part.args || '{}') as { clusterName?: string }).clusterName
  const pending = approval && !approval.resolved
  return (
    <div className="flex max-w-md flex-col gap-2 rounded-lg border theme-border p-3 text-sm">
      <div className="font-medium">{name}</div>
      {(['stop_cluster', 'destroy_cluster'] as const).map((tool) => (
        <label key={tool} className="flex items-start gap-2">
          <input
            type="radio"
            name={`choice-${part.id}`}
            checked={choice === tool}
            disabled={!pending}
            onChange={() => setChoice(tool)}
          />
          {tool === 'stop_cluster'
            ? 'Stop: keeps the disk, starts again in about 3 minutes'
            : 'Destroy: deletes everything it provisioned, keeps the definition'}
        </label>
      ))}
      {pending && onApprovalAnswer && (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() =>
              onApprovalAnswer(approval.id, {
                kind: 'confirm',
                allowed: true,
                ...(choice === part.name ? {} : { instead: choice }),
              })
            }
          >
            {choice === 'stop_cluster' ? 'Stop' : 'Destroy'}
          </button>
          <button
            type="button"
            onClick={() => onApprovalAnswer(approval.id, { kind: 'confirm', allowed: false })}
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  )
}

// A host draws its own tool: the held stop offers destroy in its place, and
// the answer resumes with the tool the reader chose.
export const HostDrawnToolCall: StoryObj = {
  render: () => (
    <StoryChat
      adapter={{
        ...makeStaticAdapter({
          conversations: [
            makeConversation({
              id: 'conv-held',
              title: 'Stop gputraining',
              messages: makeHeldCallTurn(),
            }),
          ],
        }),
        streamCompletion: resumeHeldCall,
      }}
      config={{
        slots: {
          toolRenderers: { stop_cluster: StopOrDestroyCard, destroy_cluster: StopOrDestroyCard },
        },
      }}
      conversationId="conv-held"
    >
      <StoryViewport>
        <ChatThread conversationId="conv-held" />
      </StoryViewport>
    </StoryChat>
  ),
}

function EditableStopCard({ part, approval, onApprovalAnswer }: ToolRendererProps) {
  const suggested = (JSON.parse(part.args || '{}') as { clusterName?: string }).clusterName ?? ''
  const [name, setName] = useState(suggested)
  const pending = approval && !approval.resolved
  return (
    <div className="flex max-w-md flex-col gap-2 rounded-lg border theme-border p-3 text-sm">
      <label className="flex flex-col gap-1">
        Cluster
        <input
          className="rounded border theme-border px-2 py-1"
          value={name}
          disabled={!pending}
          onChange={(e) => setName(e.target.value)}
        />
      </label>
      {pending && onApprovalAnswer && (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() =>
              onApprovalAnswer(approval.id, {
                kind: 'confirm',
                allowed: true,
                args: JSON.stringify({ clusterName: name }),
              })
            }
          >
            Stop
          </button>
          <button
            type="button"
            onClick={() => onApprovalAnswer(approval.id, { kind: 'confirm', allowed: false })}
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  )
}

// The model suggests the call's arguments and the reader can change them
// before allowing it; the call runs with theirs, and its line says so.
export const EditedToolCall: StoryObj = {
  render: () => (
    <StoryChat
      adapter={{
        ...makeStaticAdapter({
          conversations: [
            makeConversation({
              id: 'conv-held',
              title: 'Stop gputraining',
              messages: makeHeldCallTurn(),
            }),
          ],
        }),
        streamCompletion: resumeHeldCall,
      }}
      config={{ slots: { toolRenderers: { stop_cluster: EditableStopCard } } }}
      conversationId="conv-held"
    >
      <StoryViewport>
        <ChatThread conversationId="conv-held" />
      </StoryViewport>
    </StoryChat>
  ),
}

// The same call in a shared conversation Bob started: it runs with Bob's
// access, so only Bob may answer it, and the share note says the results
// are visible to the people it is shared with.
export const HeldToolCallSomeoneElseAsked: StoryObj = {
  render: () => (
    <StoryChat
      adapter={makeStaticAdapter({
        conversations: [
          {
            ...makeConversation({
              id: 'conv-held',
              title: 'Stop gputraining',
              messages: makeHeldCallTurn({ asker: storyTeammate }),
            }),
            isOwner: false,
            canCollaborate: true,
          },
        ],
        sharing: true,
        tools: [{ id: 'stop_cluster', label: 'Stop a cluster', asksFirst: true }],
      })}
      conversationId="conv-held"
    >
      <StoryViewport>
        <ChatThread conversationId="conv-held" />
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
