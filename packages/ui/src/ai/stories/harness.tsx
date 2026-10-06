// Parameterized mock builders for the Storybook workshop. Every story drives
// these through Storybook args so polish work can be exercised against any
// state without a backend; new features add a factory (or a factory knob)
// here and a story that calls it. See ../../.storybook/CONTRIBUTING.md.
import type { ReactNode } from 'react'
import { useMemo } from 'react'
import type { ChatAdapter, StreamHandlers } from '../adapter/types'
import type { ComposerPastes, PasteUploadResult } from '../components/usePasteCards'
import { ChatProvider } from '../core/ChatProvider'
import type { ChatLinkProps, ChatUIConfig } from '../core/config'
import { countLines, utf8Bytes } from '../core/pastes'
import type {
  ApprovalPart,
  ChatMessage,
  ChatUser,
  Conversation,
  ConversationSummary,
  MessagePart,
  MessagePaste,
  ProviderIssue,
  SubagentPart,
  TodoItem,
  ToolCallPart,
  ToolCallStatus,
} from '../types'

const storyUser: ChatUser = {
  id: 'u-1',
  username: 'alice',
  name: 'Alice Example',
}

const LOREM =
  'The scheduler places the controller on the login node and fans partitions out across compute. Each turn streams through the same pipeline a real backend uses, so polish work here transfers directly.'

function words(count: number): string {
  const pool = LOREM.split(' ')
  const out: string[] = []
  for (let i = 0; i < count; i++) {
    out.push(pool[i % pool.length] as string)
  }
  return out.join(' ')
}

let idCounter = 0
function nextId(prefix: string): string {
  idCounter += 1
  return `${prefix}-${idCounter}`
}

export function makeMessage(overrides: Partial<ChatMessage>): ChatMessage {
  return {
    id: nextId('msg'),
    role: 'assistant',
    content: 'A reply.',
    timestamp: '2026-08-16T12:00:00Z',
    ...overrides,
  }
}

const MARKDOWN_TOUR = [
  'Here is a **markdown tour** covering the common shapes.\n\n```ts\nconst adapter = createMockChatAdapter()\nawait adapter.conversations.list()\n```\n\n| Partition | Nodes | State |\n|---|---|---|\n| compute | 12 | idle |\n| gpu | 4 | busy |\n\nInline math $E = mc^2$ and display math:\n\n$$\\sum_{i=1}^{n} x_i^2$$\n\n- [x] stream the reply\n- [ ] polish the renderer',
  'Second reply with `inline code`, a [link](https://example.com), and a list:\n\n1. First\n2. Second\n3. Third',
]

// Ages spread across the sidebar's date buckets, newest first.
const GROUP_AGES_DAYS = [0, 1, 3, 12, 45]

export function makeSummaries(options?: {
  count?: number
  sharedEvery?: number
  now?: string
}): ConversationSummary[] {
  const count = options?.count ?? 6
  const sharedEvery = options?.sharedEvery ?? 0
  const now = new Date(options?.now ?? '2026-08-16T12:00:00Z').getTime()
  const day = 24 * 60 * 60 * 1000
  return Array.from({ length: count }, (_, i) => {
    const ageDays = GROUP_AGES_DAYS[i % GROUP_AGES_DAYS.length] as number
    const shared = sharedEvery > 0 && i % sharedEvery === sharedEvery - 1
    return {
      id: `conv-${i + 1}`,
      title: shared ? `Shared cluster review ${i + 1}` : `Slurm sizing session ${i + 1}`,
      canCollaborate: shared,
      createdAt: new Date(now - ageDays * day - i * 60_000).toISOString(),
      isOwner: !shared,
      messageCount: 2,
      preview: 'How many nodes do I need…',
    }
  })
}

export function makeConversation(overrides?: {
  id?: string
  title?: string
  messages?: ChatMessage[]
}): Conversation {
  const id = overrides?.id ?? 'conv-1'
  const messages = overrides?.messages ?? [
    makeMessage({
      role: 'user',
      content: 'Give me a markdown tour.',
      author: storyUser,
      conversationId: id,
    }),
    makeMessage({
      role: 'assistant',
      content: MARKDOWN_TOUR[0],
      model: 'mock:local/canned-small',
      conversationId: id,
    }),
    makeMessage({
      role: 'user',
      content: 'And a shorter one?',
      author: storyUser,
      conversationId: id,
    }),
    makeMessage({
      role: 'assistant',
      content: MARKDOWN_TOUR[1],
      model: 'mock:local/canned-small',
      reasoning: 'Weighing which markdown constructs are still missing…',
      reasoningDuration: 2300,
      conversationId: id,
    }),
  ]
  return {
    id,
    title: overrides?.title ?? 'Markdown tour',
    messages,
    isOwner: true,
    createdAt: '2026-08-16T11:00:00Z',
  }
}

export interface StreamingKnobs {
  wordDelayMs?: number
  reasoningMs?: number
  replyWords?: number
  // Tool calls streamed as onPart deltas before the reply: each starts
  // running, works for toolMs, then resolves (the last one fails when
  // failLastTool is set) — the live pipeline the backend drives.
  toolCalls?: number
  toolMs?: number
  failLastTool?: boolean
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('aborted', 'AbortError'))
      return
    }
    const timer = setTimeout(resolve, ms)
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer)
        reject(new DOMException('aborted', 'AbortError'))
      },
      { once: true },
    )
  })
}

const TOOL_SCRIPT = [
  { name: 'GrepSearch', args: { query: 'partition', path: 'internal/' } },
  { name: 'ReadFile', args: { path: 'internal/server/server.go' } },
  { name: 'Bash', args: { command: 'go test ./internal/server/...' } },
]

// Stream knobs.toolCalls scripted tool calls as onPart deltas, each running
// for toolMs before resolving (the last fails when failLastTool is set).
async function streamToolCalls(
  knobs: StreamingKnobs,
  handlers: StreamHandlers,
  signal?: AbortSignal,
): Promise<void> {
  const toolCalls = knobs.toolCalls ?? 0
  const toolMs = knobs.toolMs ?? 900
  for (let i = 0; i < toolCalls; i++) {
    const tool = TOOL_SCRIPT[i % TOOL_SCRIPT.length] as {
      name: string
      args: object
    }
    const id = nextId('story-tool')
    handlers.onPart?.({
      type: 'tool_start',
      id,
      name: tool.name,
      args: JSON.stringify(tool.args),
    })
    await sleep(toolMs, signal)
    const fails = knobs.failLastTool && i === toolCalls - 1
    handlers.onPart?.({
      type: 'tool_end',
      id,
      result: fails
        ? 'error: exit status 1\nExit code: 1'
        : `line ${i + 1}: match in internal/server/server.go\nExit code: 0`,
      ...(fails ? { isError: true } : {}),
    })
  }
}

// A deterministic adapter over fixed conversations, with tunable streaming.
export function makeStaticAdapter(options?: {
  conversations?: Conversation[]
  summaries?: ConversationSummary[]
  streaming?: StreamingKnobs
  sharing?: boolean
  providerIssues?: ProviderIssue[]
  attachments?: boolean
}): ChatAdapter {
  const conversations = options?.conversations ?? [makeConversation()]
  const summaries =
    options?.summaries ??
    conversations.map((c) => ({
      id: c.id,
      title: c.title ?? 'Untitled',
      canCollaborate: false,
      createdAt: c.createdAt ?? '2026-08-16T11:00:00Z',
      isOwner: true,
      messageCount: c.messages.length,
    }))
  const byId = new Map(conversations.map((c) => [c.id, c]))
  const knobs = options?.streaming ?? {}

  const adapter: ChatAdapter = {
    conversations: {
      async list() {
        return summaries
      },
      async get(id: string) {
        const conv = byId.get(id)
        if (!conv) {
          throw new Error(`no story conversation ${id}`)
        }
        return conv
      },
      async create(title?: string) {
        const id = nextId('conv')
        const conv: Conversation = { id, title: title ?? null, messages: [] }
        byId.set(id, conv)
        return {
          id,
          ...(title !== undefined ? { title } : {}),
          canCollaborate: false,
          createdAt: new Date().toISOString(),
          isOwner: true,
          messageCount: 0,
        }
      },
      async rename() {},
      async remove() {},
    },
    models: {
      async list() {
        return {
          models: [
            {
              id: 'mock:story/streaming',
              object: 'model' as const,
              created: 0,
              owned_by: 'story',
              provider: 'Story Provider',
              provider_name: 'story',
              provider_owner: 'mock',
              tool_calling_mode: 'none' as const,
            },
          ],
          unreachableSessions: [],
          providerIssues: options?.providerIssues ?? [],
        }
      },
    },
    async streamCompletion(req, handlers: StreamHandlers, signal) {
      const reasoningMs = knobs.reasoningMs ?? 1200
      const wordDelayMs = knobs.wordDelayMs ?? 120
      const replyWords = knobs.replyWords ?? 40
      if (reasoningMs > 0) {
        const steps = Math.max(1, Math.floor(reasoningMs / 200))
        for (let i = 0; i < steps; i++) {
          handlers.onReasoning?.('considering the canned options… ')
          await sleep(200, signal)
        }
      }
      await streamToolCalls(knobs, handlers, signal)
      const reply = words(replyWords)
      let content = ''
      for (const word of reply.split(' ')) {
        content += (content ? ' ' : '') + word
        handlers.onContent(`${word} `)
        await sleep(wordDelayMs, signal)
      }
      return {
        content,
        messageId: nextId('msg'),
        toolCalls: [],
        finishReason: 'stop',
        model: req.model,
        reasoning: '',
        responsesOutput: [],
      }
    },
  }

  if (options?.sharing) {
    adapter.sharing = {
      async listPermissions() {
        return [
          {
            id: 'p-1',
            team: 'g-1',
            teamName: 'HPC Admins',
            permission: 'collaborate',
            entireOrganization: false,
          },
          {
            id: 'p-2',
            team: null,
            teamName: null,
            permission: 'view',
            entireOrganization: true,
          },
        ]
      },
      async listGroups() {
        return [
          { id: 'g-1', name: 'HPC Admins' },
          { id: 'g-2', name: 'Research' },
          { id: 'g-3', name: 'Interns' },
        ]
      },
      async addPermission() {},
      async updatePermission() {},
      async removePermission() {},
    }
  }

  if (options?.attachments) {
    adapter.attachments = {
      async list() {
        return { attachments: [], total: 0, hasMore: false }
      },
      async upload() {
        throw new Error('uploads are not stubbed in the workshop')
      },
      async remove() {},
      downloadUrl: () => '#',
    }
  }
  return adapter
}

// ---- Agent transcript part factories ---------------------------------------

export function makeToolCallPart(options?: {
  name?: string | undefined
  status?: ToolCallStatus
  argChars?: number
  resultLines?: number
  startLine?: number
  command?: string
}): ToolCallPart {
  const name = options?.name ?? 'Bash'
  const status = options?.status ?? 'ok'
  const resultLines = options?.resultLines ?? 6
  const argPad = options?.argChars && options.argChars > 0 ? words(options.argChars / 6) : ''
  const args =
    name === 'Bash'
      ? JSON.stringify({
          command: options?.command ?? `grep -rn "partition" internal/ ${argPad}`.trim(),
        })
      : JSON.stringify({ path: 'internal/server/server.go', note: argPad })
  const result =
    status === 'error'
      ? `error: exit status 1\ncommand failed\nExit code: 1`
      : `${Array.from({ length: resultLines }, (_, i) => `line ${i + 1}: match in internal/server/server.go`).join('\n')}\nExit code: 0`
  return {
    kind: 'tool_call',
    id: nextId('tool'),
    name,
    args,
    status,
    ...(status === 'running' ? {} : { result }),
    ...(options?.startLine !== undefined ? { startLine: options.startLine } : {}),
  }
}

export function makeEditDiffPart(options?: { startLine?: number }): ToolCallPart {
  return {
    kind: 'tool_call',
    id: nextId('tool'),
    name: 'EditFile',
    args: JSON.stringify({
      file_path: 'internal/server/server.go',
      old_string: 'const idleTimeout = 60 * time.Second\nconst shutdownTimeout = 15 * time.Second',
      new_string:
        'const idleTimeout = 90 * time.Second\nconst shutdownTimeout = 30 * time.Second\nconst drainTimeout = 5 * time.Second',
    }),
    status: 'ok',
    result: 'Edited internal/server/server.go',
    startLine: options?.startLine ?? 31,
  }
}

export function makeWriteFilePart(): ToolCallPart {
  return {
    kind: 'tool_call',
    id: nextId('tool'),
    name: 'WriteFile',
    args: JSON.stringify({
      file_path: 'scripts/drain.sh',
      content: '#!/usr/bin/env bash\nset -euo pipefail\nkubectl drain "$1" --ignore-daemonsets\n',
    }),
    status: 'ok',
    result: 'Wrote 3 lines to scripts/drain.sh',
  }
}

const SUBAGENT_STATUSES = ['running', 'done', 'failed'] as const

export function makeSubagentParts(options?: { count?: number }): SubagentPart[] {
  const count = options?.count ?? 3
  return Array.from({ length: count }, (_, i) => {
    const status = SUBAGENT_STATUSES[i % SUBAGENT_STATUSES.length] ?? 'running'
    return {
      kind: 'subagent' as const,
      id: nextId('sub'),
      status,
      agentType: i % 2 === 0 ? 'Explore' : 'general-purpose',
      color: i % 2 === 0 ? 'cyan' : 'magenta',
      background: i === 1,
      description: `Investigate shard ${i + 1} timeouts`,
      actions: [
        'Reading packages/e2e/playwright.config.ts',
        'Grepping for retry markers',
        `Checking shard ${i + 1} artifacts`,
      ],
      ...(status === 'done' ? { summary: `Shard ${i + 1}: flake, passed on retry` } : {}),
      ...(status === 'failed' ? { summary: 'Timed out fetching artifacts' } : {}),
    }
  })
}

export function makeApprovalPart(options?: {
  kind?: 'confirm' | 'ask'
  resolved?: boolean
  multiSelect?: boolean
}): ApprovalPart {
  const kind = options?.kind ?? 'confirm'
  const base: ApprovalPart =
    kind === 'confirm'
      ? {
          kind: 'approval',
          id: nextId('appr'),
          approvalKind: 'confirm',
          toolName: 'Bash',
          command: 'kubectl delete pod web-frontend-7d9f --grace-period=0',
          reason: 'Command deletes a running pod',
          agent: 'main',
          mode: 'accept-edits',
        }
      : {
          kind: 'approval',
          id: nextId('appr'),
          approvalKind: 'ask',
          question: 'Which shards should I retry?',
          header: 'Retry scope',
          multiSelect: options?.multiSelect ?? false,
          options: [
            { label: 'Shard 4', description: 'instance-selector failures' },
            {
              label: 'Shard 12',
              description: 'publish-cloud-cluster failures',
            },
            { label: 'All shards', description: 'full re-run (slow)' },
          ],
        }
  if (options?.resolved) {
    base.resolved = true
    base.answer = kind === 'confirm' ? 'Allowed once' : 'Shard 4'
  }
  return base
}

export function makeTodoSnapshot(options?: { pending?: number; completed?: number }): MessagePart {
  const pending = options?.pending ?? 2
  const completed = options?.completed ?? 2
  const todos: TodoItem[] = [
    ...Array.from({ length: completed }, (_, i) => ({
      content: `Port summary logic for tool ${i + 1}`,
      status: 'completed' as const,
    })),
    {
      content: 'Render rollup folding',
      status: 'in_progress' as const,
      activeForm: 'Rendering rollup folding',
    },
    ...Array.from({ length: pending }, (_, i) => ({
      content: `Polish diff emphasis pass ${i + 1}`,
      status: 'pending' as const,
    })),
  ]
  return { kind: 'todo_snapshot', todos }
}

export function makeAgentTurn(): ChatMessage {
  return makeMessage({
    role: 'assistant',
    content: null,
    model: 'demo-agent',
    parts: [
      { kind: 'text', text: 'Looking into the failing shard now.' },
      {
        kind: 'reasoning',
        text: 'The locator resolves but stays invisible — checking what gates the form.',
        durationMs: 3400,
      },
      makeToolCallPart({ name: 'GrepSearch', status: 'ok', resultLines: 4 }),
      makeToolCallPart({ name: 'ReadFile', status: 'ok', resultLines: 3 }),
      makeToolCallPart({ status: 'ok', resultLines: 8 }),
      makeEditDiffPart(),
      {
        kind: 'warning',
        text: 'The e2e budget is a ceiling — the fix must make the work faster.',
      },
      ...makeSubagentParts({ count: 2 }),
      makeApprovalPart({ kind: 'confirm', resolved: true }),
      makeTodoSnapshot(),
      {
        kind: 'text',
        text: 'Fixed: the form no longer gates on the slow asset. Verifying next.',
      },
    ],
  })
}

// A chat-surface turn: tool calls in parts alongside flat content, the way an
// OpenAI-compatible backend stores a tool-loop reply. Renders as tool blocks
// above the answer with the normal message chrome (copy, regenerate, meta).
export function makeHybridTurn(): ChatMessage {
  return makeMessage({
    role: 'assistant',
    content: 'The registered `helloworld` workflow has one job, `first`, and no dependencies.',
    model: 'mock:local/canned-small',
    reasoning: 'The user wants the DAG — fetch the workflow and render it.',
    reasoningDuration: 8000,
    parts: [
      {
        kind: 'tool_call',
        id: nextId('tool'),
        name: 'get_workflow',
        args: JSON.stringify({ name: 'helloworld' }),
        status: 'ok',
        result: '1 jobs, 0 edges',
      },
      {
        kind: 'tool_call',
        id: nextId('tool'),
        name: 'show_in_viewer',
        args: JSON.stringify({ kind: 'workflow_dag', target: 'helloworld' }),
        status: 'ok',
        result: 'inline DAG + link for helloworld',
      },
    ],
  })
}

// ---- Paste factories -------------------------------------------------------

export function makePasteText(lines: number): string {
  return Array.from(
    { length: lines },
    (_, i) =>
      `[${String(Math.floor(i / 60)).padStart(2, '0')}:${String(i % 60).padStart(2, '0')}] step ${i + 1}/${lines}: compiling internal/server/server.go`,
  ).join('\n')
}

export function makePaste(id: number, text: string, options?: { inline?: boolean }): MessagePaste {
  const lines = countLines(text)
  return {
    placeholder: `[Pasted text #${id} +${lines} lines]`,
    id,
    lines,
    bytes: utf8Bytes(text),
    ...(options?.inline ? { inline: true, text } : {}),
  }
}

/** How the stub host answers an upload; `saving` never answers. */
export type PasteOutcome = 'saved' | 'saving' | 'refused' | 'unsupported'

// A host that stores pastes. Uploads answer with `outcomes` in order, and
// save once those run out.
export function makeComposerPastes(options?: {
  inlineMaxBytes?: number
  uploadMs?: number
  outcomes?: PasteOutcome[]
}): ComposerPastes {
  const outcomes = [...(options?.outcomes ?? [])]
  let saved = 0
  return {
    inlineMaxBytes: options?.inlineMaxBytes ?? 4_000,
    async upload(text): Promise<PasteUploadResult> {
      const outcome = outcomes.shift() ?? 'saved'
      if (outcome === 'saving') {
        return new Promise(() => {})
      }
      await sleep(options?.uploadMs ?? 600)
      if (outcome === 'refused') {
        return {
          error: 'The session stopped before the paste was saved. Start it and paste again.',
        }
      }
      if (outcome === 'unsupported') {
        return { unsupported: true }
      }
      saved += 1
      return { paste: makePaste(saved, text) }
    },
  }
}

// Untrusted paste events never insert text, so only pastes the composer turns
// into cards show up.
export function pasteIntoComposer(canvasElement: HTMLElement, text: string) {
  const textarea = canvasElement.querySelector('textarea')
  if (!textarea) {
    return
  }
  const clipboardData = new DataTransfer()
  clipboardData.setData('text/plain', text)
  textarea.dispatchEvent(
    new ClipboardEvent('paste', { clipboardData, bubbles: true, cancelable: true }),
  )
}

// ---- Provider harness ------------------------------------------------------

/** A chat link that stays inside Storybook; external targets open in a new tab. */
function storyChatLink(onNavigate?: (id: string | null) => void) {
  return function StoryChatLink({ target, className, title, onClick, children }: ChatLinkProps) {
    if (target.kind === 'external') {
      return (
        <a href={target.href} target="_blank" rel="noreferrer" className={className} title={title}>
          {children}
        </a>
      )
    }
    return (
      <a
        href={target.kind === 'conversation' ? `#${target.id}` : `#${target.kind}`}
        className={className}
        title={title}
        onClick={(e) => {
          e.preventDefault()
          onClick?.(e)
          if (target.kind === 'conversation') {
            onNavigate?.(target.id)
          }
        }}
      >
        {children}
      </a>
    )
  }
}

const noopNavigation = {
  toConversation() {},
  toNewChat() {},
}

const consoleNotify = {
  success(m: string) {
    console.info('[notify.success]', m)
  },
  error(m: string) {
    console.info('[notify.error]', m)
  },
  info(m: string) {
    console.info('[notify.info]', m)
  },
}

// Stories are excluded from the stylesheet's `@source` scan so their classes
// never ship, which means a utility used only here has no rule. Height comes
// from an inline style so the story viewport cannot depend on that scan.
export function StoryViewport({ children }: { children: ReactNode }) {
  return <div style={{ height: '100dvh' }}>{children}</div>
}

export function StoryChat({
  adapter,
  config,
  conversationId = 'conv-1',
  onNavigate,
  children,
}: {
  adapter?: ChatAdapter
  config?: ChatUIConfig
  conversationId?: string | null
  onNavigate?: (id: string | null) => void
  children: ReactNode
}) {
  const resolved = useMemo(() => adapter ?? makeStaticAdapter(), [adapter])
  const resolvedConfig = useMemo(
    () => ({ LinkComponent: storyChatLink(onNavigate), ...config }),
    [config, onNavigate],
  )
  const navigation = useMemo(
    () =>
      onNavigate
        ? {
            toConversation: (id: string) => onNavigate(id),
            toNewChat: () => onNavigate(null),
          }
        : noopNavigation,
    [onNavigate],
  )
  return (
    <ChatProvider
      adapter={resolved}
      currentUser={storyUser}
      navigation={navigation}
      notify={consoleNotify}
      activeConversationId={conversationId}
      config={resolvedConfig}
    >
      {children}
    </ChatProvider>
  )
}
