import type { Meta, StoryObj } from '@storybook/react-vite'
import { type CSSProperties, useMemo, useState } from 'react'
import { userEvent, within } from 'storybook/test'
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
import type { ToolCallPart, ToolPresentation } from '../types'
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

/** A theme whose panel color is translucent: the composer dock and the jump
 *  pill still hide the thread scrolling under them. */
export const TranslucentPanel: StoryObj = {
  render: () => (
    <StoryChat>
      <StoryViewport>
        <div
          className="flex h-full min-h-0 flex-col"
          style={{ '--theme-panel-bg': 'rgb(255 255 255 / 0.9)' } as CSSProperties}
        >
          <ChatThread conversationId="conv-1" />
        </div>
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

// The server refuses the first answer before anything streams, as when the
// call was answered elsewhere: the call asks again beside the error, and the
// next answer goes through.
export const HeldToolCallRefused: StoryObj = {
  render: () => {
    let refused = false
    return (
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
          streamCompletion: async (req, handlers, signal) => {
            if (!refused) {
              refused = true
              throw new Error("Couldn't reach the server. Check your connection and try again.")
            }
            return resumeHeldCall(req, handlers, signal)
          },
        }}
        conversationId="conv-held"
      >
        <StoryViewport>
          <ChatThread conversationId="conv-held" />
        </StoryViewport>
      </StoryChat>
    )
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(await canvas.findByText('Yes, allow this call'))
    await canvas.findByText(/Couldn't reach the server/)
  },
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

function CostRows({ part }: ToolRendererProps) {
  if (part.status !== 'ok' || !part.result) {
    return null
  }
  const rows = JSON.parse(part.result) as [string, string][]
  if (rows.length === 0) {
    return null
  }
  return (
    <table className="w-full max-w-md text-xs">
      <tbody>
        {rows.map(([name, cost]) => (
          <tr key={name} className="border-b theme-border">
            <td className="py-1">{name}</td>
            <td className="py-1 text-right tabular-nums">{cost}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

const costCall = (allocation: string, status: 'ok' | 'error', result: string) => ({
  kind: 'tool_call' as const,
  id: `cost-${allocation}-${status}`,
  name: 'cost_summary',
  args: JSON.stringify({ allocation, groupBy: ['resource'] }),
  status,
  result,
})

// One tool called again and again folds into a single row that counts the
// calls and failures; what the host drew for each call stays in view, and a
// call that drew nothing shows nothing until the row opens.
export const RepeatedToolCalls: StoryObj = {
  render: () => {
    const adapter = makeStaticAdapter({
      conversations: [
        makeConversation({
          id: 'conv-costs',
          title: 'What is billing me',
          messages: [
            {
              id: 'u-costs',
              role: 'user',
              content: 'whats billing me?',
              conversationId: 'conv-costs',
            },
            {
              id: 'a-costs',
              role: 'assistant',
              conversationId: 'conv-costs',
              model: 'mock:story/streaming',
              timestamp: '2026-08-16T11:00:00Z',
              tokensUsed: { prompt_tokens: 61000, completion_tokens: 1200, total_tokens: 62200 },
              content:
                'Most of it is two test clusters (~$1.50/day each), plus snapshots (~$0.40/day) that have run for months.',
              parts: [
                costCall('research', 'error', 'StartDate is required'),
                costCall('platform', 'error', 'StartDate is required'),
                costCall('teaching', 'error', 'StartDate is required'),
                costCall(
                  'research',
                  'ok',
                  JSON.stringify([
                    ['slurm-a', '$45.22'],
                    ['snapshots', '$0.40'],
                  ]),
                ),
                costCall('platform', 'ok', JSON.stringify([['gpu-train', '$12.07']])),
                costCall('teaching', 'ok', '[]'),
              ],
            },
          ],
        }),
      ],
    })
    return (
      <StoryChat
        adapter={{
          ...adapter,
          models: {
            ...adapter.models,
            async list() {
              const listed = await adapter.models.list()
              return {
                ...listed,
                models: listed.models.map((m) => ({ ...m, name: 'Story Large' })),
              }
            },
          },
        }}
        config={{ slots: { toolRenderers: { cost_summary: CostRows } } }}
        conversationId="conv-costs"
      >
        <StoryViewport>
          <ChatThread conversationId="conv-costs" />
        </StoryViewport>
      </StoryChat>
    )
  },
}

// The host names its calls in words: the narration, then "Checked costs for 3
// allocations" folding the calls, each opening to its table and arguments,
// then the answer.
function costPresentation(part: ToolCallPart): ToolPresentation | undefined {
  if (part.name !== 'cost_summary') {
    return undefined
  }
  const { allocation } = JSON.parse(part.args || '{}') as { allocation?: string }
  const rows = part.status === 'ok' ? (JSON.parse(part.result || '[]') as string[][]) : []
  return {
    label:
      part.status === 'running'
        ? `Checking costs for ${allocation}`
        : `Checked costs for ${allocation}`,
    summary: rows.length
      ? `${rows.length} ${rows.length === 1 ? 'resource' : 'resources'}`
      : 'No spend this period',
    group: (n) => `Checked costs for ${n} allocations`,
    rollup: (n) => `checked costs for ${n} allocations`,
  }
}

export const NamedToolCalls: StoryObj = {
  render: () => {
    const adapter = makeStaticAdapter({
      conversations: [
        makeConversation({
          id: 'conv-named',
          title: 'What is billing me',
          messages: [
            {
              id: 'u-named',
              role: 'user',
              content: 'whats billing me?',
              conversationId: 'conv-named',
            },
            {
              id: 'a-named',
              role: 'assistant',
              conversationId: 'conv-named',
              model: 'mock:story/streaming',
              timestamp: '2026-08-16T11:00:00Z',
              content: 'Most of it is two test clusters in research, about $1.50 a day each.',
              parts: [
                { kind: 'text', text: 'Checking what each allocation spent this month.' },
                costCall(
                  'research',
                  'ok',
                  JSON.stringify([
                    ['slurm-a', '$45.22'],
                    ['snapshots', '$0.40'],
                  ]),
                ),
                costCall('platform', 'ok', JSON.stringify([['gpu-train', '$12.07']])),
                costCall('teaching', 'ok', '[]'),
              ],
            },
          ],
        }),
      ],
    })
    return (
      <StoryChat
        adapter={adapter}
        config={{
          slots: { toolRenderers: { cost_summary: CostRows }, toolPresentation: costPresentation },
        }}
        conversationId="conv-named"
      >
        <StoryViewport>
          <ChatThread conversationId="conv-named" />
        </StoryViewport>
      </StoryChat>
    )
  },
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

// A reply that says what it will check, checks, then answers: the sentence
// stays above the calls it led into while the reply streams, as it does once
// the reply is saved.
export const NarratedToolCalls: StoryObj = {
  render: () => {
    const Adapterized = () => {
      const adapter = useMemo(
        () =>
          makeStaticAdapter({
            streaming: {
              narration: 'Checking the server tests and the partition config first.',
              toolCalls: 2,
              toolMs: 700,
              reasoningMs: 0,
              replyWords: 60,
              wordDelayMs: 40,
            },
          }),
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
