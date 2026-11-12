import type { Meta, StoryObj } from '@storybook/react-vite'
import { useMemo, useState } from 'react'
import { expect, userEvent, within } from 'storybook/test'
import { parseSubagentNotice, subagentDeliveryLine } from '../../agent/transcript'
import {
  makeAgentTurn,
  makeApprovalPart,
  makeEditDiffPart,
  makeImageAttachments,
  makeMessage,
  makeSubagentParts,
  makeTodoSnapshot,
  makeToolCallPart,
  makeWriteFilePart,
  StoryChat,
  useStreamedText,
} from '../../stories/harness'
import { defaultChatStrings } from '../../strings'
import type {
  ApprovalAnswerValue,
  ChatMessage,
  MessagePart,
  ToolCallPart,
  ToolCallStatus,
  ToolDecision,
} from '../../types'
import ActivityLine from './ActivityLine'
import AgentMessageParts, { ExpandAllProvider } from './AgentMessageParts'

const meta: Meta = {
  title: 'Chat/Agent transcript',
  component: AgentMessageParts,
  parameters: { layout: 'fullscreen' },
  // The transcript reads on the thread's panel and in its column, not across
  // the whole canvas.
  decorators: [
    (Story) => (
      <div style={{ minHeight: '100dvh', background: 'var(--theme-panel-bg)' }}>
        <div style={{ maxWidth: '50rem', margin: '0 auto', padding: '2.5rem 2rem' }}>
          <Story />
        </div>
      </div>
    ),
  ],
}

export default meta

const logAnswer = (id: string, answer: unknown) => console.info('[approval answer]', id, answer)

export const ToolCall: StoryObj<{
  name: string
  status: ToolCallStatus
  resultLines: number
  argChars: number
}> = {
  args: { name: 'Bash', status: 'ok', resultLines: 6, argChars: 0 },
  argTypes: {
    name: {
      control: 'select',
      options: ['Bash', 'GrepSearch', 'ReadFile', 'GlobSearch', 'WebFetch'],
    },
    status: { control: 'inline-radio', options: ['running', 'ok', 'error'] },
    resultLines: { control: { type: 'range', min: 0, max: 60 } },
    argChars: {
      control: { type: 'range', min: 0, max: 600 },
      description: 'Pad args to exercise elision',
    },
  },
  render: (args) => (
    <AgentMessageParts
      message={makeMessage({
        content: null,
        parts: [makeToolCallPart(args)],
      })}
    />
  ),
}

function estimatePresentation(part: ToolCallPart, message?: ChatMessage) {
  return {
    label: part.name === 'estimate_cost' ? 'Estimated resource cost' : 'Create resource',
    open:
      part.name !== 'estimate_cost' ||
      !message?.parts?.some((p) => p.kind === 'tool_call' && p.name === 'create_resource'),
  }
}

export const ContextualResult: StoryObj<{ awaitingApproval: boolean }> = {
  args: { awaitingApproval: false },
  argTypes: { awaitingApproval: { control: 'boolean' } },
  render: ({ awaitingApproval }) => (
    <StoryChat
      config={{
        slots: {
          toolPresentation: estimatePresentation,
          toolRenderers: {
            estimate_cost: () => <p>Estimated running cost: $0.21 per hour.</p>,
            create_resource: () => (
              <div className="space-y-2 rounded-md border theme-border p-3">
                <p>Estimated running cost: $0.21 per hour.</p>
                <p>Review the resource before allowing creation.</p>
              </div>
            ),
          },
        },
      }}
    >
      <AgentMessageParts
        message={makeMessage({
          content: null,
          parts: [
            {
              ...makeToolCallPart(),
              id: 'estimate',
              name: 'estimate_cost',
              args: '{}',
              result: '{"hourly":0.21}',
            },
            ...(awaitingApproval
              ? [
                  {
                    ...makeToolCallPart({ status: 'waiting' }),
                    id: 'create',
                    name: 'create_resource',
                    args: '{}',
                  },
                ]
              : []),
          ],
        })}
      />
    </StoryChat>
  ),
}

export const ContextualResultBeforeApproval: typeof ContextualResult = {
  ...ContextualResult,
  args: { awaitingApproval: true },
}

const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString()

export const Decisions: StoryObj = {
  render: () => {
    const decided: [string, ToolDecision][] = [
      [
        'sbatch --partition=compute run_benchmark.sh',
        { status: 'approved', by: 'user', name: 'ana', at: minutesAgo(2) },
      ],
      [
        'rm -rf /scratch/old-runs',
        { status: 'denied', by: 'user', name: 'bob', at: minutesAgo(5) },
      ],
      [
        'ls /scratch/runs',
        {
          status: 'approved',
          by: 'auto-reviewer',
          at: minutesAgo(9),
          note: 'directory whitelisted for session',
          action: 'ls /scratch/runs',
        },
      ],
      [
        'scancel --user=ana',
        {
          status: 'denied',
          by: 'auto-reviewer',
          at: minutesAgo(12),
          reason: 'Cancels every job the user owns; the request was to cancel one benchmark job.',
        },
      ],
      [
        'kubectl delete ns staging',
        { status: 'timed_out', by: 'auto-reviewer', at: minutesAgo(20) },
      ],
      ['squeue -u ana', { status: 'expired', by: 'user', at: minutesAgo(70) }],
    ]
    return (
      <AgentMessageParts
        message={makeMessage({
          content: null,
          parts: decided.map(([command, decision]) => ({
            ...makeToolCallPart({
              command,
              resultLines: 2,
              status: decision.status === 'approved' ? 'ok' : 'error',
            }),
            ...(decision.status === 'approved' ? {} : { result: 'The call did not run.' }),
            decision,
          })),
        })}
      />
    )
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Allowed by ana')).toBeVisible()
    await expect(canvas.getByText('Denied by bob')).toBeVisible()
  },
}

export const ToolCallRun: StoryObj<{ calls: number; failLast: boolean }> = {
  name: 'Consecutive tool calls',
  args: { calls: 5, failLast: false },
  argTypes: {
    calls: { control: { type: 'range', min: 2, max: 12 } },
    failLast: { description: 'A failed member must never fold into a rollup' },
  },
  render: ({ calls, failLast }) => (
    <AgentMessageParts
      message={makeMessage({
        content: null,
        parts: Array.from({ length: calls }, (_, i) =>
          makeToolCallPart({
            ...((['GrepSearch', 'ReadFile', 'GlobSearch'] as const)[i % 3] === undefined
              ? {}
              : {
                  name: (['GrepSearch', 'ReadFile', 'GlobSearch'] as const)[i % 3],
                }),
            status: failLast && i === calls - 1 ? 'error' : 'ok',
            resultLines: 3 + (i % 4),
          }),
        ),
      })}
    />
  ),
}

const REPEATED_TOOLS = ['EditFile', 'WriteFile', 'ReadFile', 'Bash'] as const
type RepeatedTool = (typeof REPEATED_TOOLS)[number]

function repeatedCall(tool: RepeatedTool, i: number, failed: boolean, path: string): ToolCallPart {
  const calls: Record<RepeatedTool, { args: object; ok: string; error: string }> = {
    EditFile: {
      args: { path, old_string: `const retries = ${i}`, new_string: `const retries = ${i + 1}` },
      ok: `Edited ${path}`,
      error: `Error: old_string not found in ${path}`,
    },
    WriteFile: {
      args: { path, content: `package server\n\nconst retries = ${i + 1}\n` },
      ok: `Wrote 3 lines to ${path}`,
      error: `Error: permission denied: ${path}`,
    },
    ReadFile: {
      args: { path },
      ok: 'package server\n\nconst retries = 3',
      error: `Error: no such file: ${path}`,
    },
    Bash: {
      args: { command: `go test ./internal/server/ -run TestRetry${i + 1}` },
      ok: 'ok  \tinternal/server\t0.41s',
      error: 'FAIL\tinternal/server\t0.38s\nExit code: 1',
    },
  }
  const call = calls[tool]
  return {
    kind: 'tool_call',
    id: `repeated-${i}`,
    name: tool,
    args: JSON.stringify(call.args),
    status: failed ? 'error' : 'ok',
    result: failed ? call.error : call.ok,
  }
}

export const RepeatedCalls: StoryObj<{
  tool: RepeatedTool
  calls: number
  failed: number
  samePath: boolean
}> = {
  name: 'Repeated calls to one tool',
  args: { tool: 'EditFile', calls: 4, failed: 1, samePath: false },
  argTypes: {
    tool: { control: 'select', options: [...REPEATED_TOOLS] },
    calls: { control: { type: 'range', min: 2, max: 12 } },
    failed: {
      control: { type: 'range', min: 0, max: 12 },
      description:
        'Failures land between successes first: reads and commands that succeed back to back fold into a summary of the run instead of this row. When every call failed, the row says the tool failed.',
    },
    samePath: { description: 'Writes and reads count files, so calls to one file count once' },
  },
  render: ({ tool, calls, failed, samePath }) => {
    const odd = Array.from({ length: Math.floor(calls / 2) }, (_, i) => i * 2 + 1)
    const even = Array.from({ length: Math.ceil(calls / 2) }, (_, i) => i * 2).reverse()
    const failing = new Set([...odd, ...even].slice(0, failed))
    return (
      <AgentMessageParts
        message={makeMessage({
          content: null,
          parts: Array.from({ length: calls }, (_, i) =>
            repeatedCall(
              tool,
              i,
              failing.has(i),
              samePath ? 'internal/server/server.go' : `internal/server/retry${i + 1}.go`,
            ),
          ),
        })}
      />
    )
  },
}

export const ReviewedRun: StoryObj = {
  name: 'Reviewed calls in a run',
  render: () => {
    const allowed: ToolDecision = {
      status: 'approved',
      by: 'auto-reviewer',
      at: minutesAgo(1),
      reason: 'Read-only listing inside the workspace.',
    }
    return (
      <AgentMessageParts
        message={makeMessage({
          content: null,
          parts: [
            {
              ...makeToolCallPart({ name: 'GrepSearch', resultLines: 3 }),
              args: JSON.stringify({ pattern: 'retention' }),
            },
            { ...makeToolCallPart({ command: 'ls -la runs/', resultLines: 4 }), decision: allowed },
            {
              ...makeToolCallPart({ name: 'ReadFile', resultLines: 5 }),
              args: JSON.stringify({ path: 'runs/README.md' }),
            },
            {
              ...makeToolCallPart({ command: 'du -sh runs/*', resultLines: 2 }),
              decision: allowed,
            },
            {
              ...makeToolCallPart({ command: 'rm -rf /scratch/old-runs', status: 'error' }),
              result: 'The call did not run.',
              decision: {
                status: 'denied',
                by: 'auto-reviewer',
                at: minutesAgo(1),
                reason: 'Deleting shared scratch was not asked for.',
              },
            },
            {
              ...makeToolCallPart({ name: 'GlobSearch', resultLines: 2 }),
              args: JSON.stringify({ pattern: 'runs/**/*.log' }),
            },
            {
              ...makeToolCallPart({ name: 'ReadFile', resultLines: 3 }),
              args: JSON.stringify({ path: 'runs/cleanup.sh' }),
            },
          ],
        })}
      />
    )
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Denied by the auto-reviewer')).toBeVisible()
    await userEvent.click(canvas.getByRole('button', { name: /ran 2 shell commands/ }))
    await expect(canvas.getAllByText('Allowed by the auto-reviewer')[0]).toBeVisible()
  },
}

export const EveryRunFolded: StoryObj<{ failed: boolean; running: boolean }> = {
  name: 'Every run folded',
  args: { failed: true, running: false },
  argTypes: {
    failed: { description: 'A failed call folds with the rest, with no success mark on the row' },
    running: { description: 'The row reads as under way and the call shows below it' },
  },
  render: ({ failed, running }) => (
    <AgentMessageParts
      foldEveryRun
      message={makeMessage({
        content: null,
        parts: [
          {
            ...makeToolCallPart({ name: 'ReadFile', status: 'ok', resultLines: 4 }),
            args: JSON.stringify({ path: 'internal/server/server.go' }),
          },
          makeToolCallPart({ name: 'Bash', status: failed ? 'error' : 'ok', resultLines: 3 }),
          {
            ...makeToolCallPart({
              name: 'GrepSearch',
              status: running ? 'running' : 'ok',
              resultLines: 2,
            }),
            args: JSON.stringify({ pattern: 'partition' }),
          },
        ],
      })}
    />
  ),
}

export const EditDiff: StoryObj<{ startLine: number }> = {
  args: { startLine: 31 },
  argTypes: { startLine: { control: { type: 'number', min: 1 } } },
  render: ({ startLine }) => (
    <AgentMessageParts
      message={makeMessage({
        content: null,
        parts: [makeEditDiffPart({ startLine }), makeWriteFilePart()],
      })}
    />
  ),
}

export const LargeEditDiff: StoryObj<{ lines: number }> = {
  name: 'Edit too large to diff exactly',
  args: { lines: 5000 },
  argTypes: {
    lines: {
      control: { type: 'range', min: 1000, max: 50000, step: 1000 },
      description: 'Lines rewritten, each one changed',
    },
  },
  render: ({ lines }) => (
    <AgentMessageParts
      message={makeMessage({
        content: null,
        parts: [makeEditDiffPart({ startLine: 1, rewriteLines: lines })],
      })}
    />
  ),
}

export const Subagents: StoryObj<{ count: number }> = {
  args: { count: 3 },
  argTypes: { count: { control: { type: 'range', min: 1, max: 8 } } },
  render: ({ count }) => (
    <AgentMessageParts
      message={makeMessage({
        content: null,
        parts: makeSubagentParts({ count }),
      })}
    />
  ),
}

export const Approvals: StoryObj<{
  kind: 'confirm' | 'ask'
  resolved: boolean
  multiSelect: boolean
  subject: 'command' | 'code' | 'path' | 'call'
  namedDirectory: boolean
  questions: number
  chat: boolean
}> = {
  args: {
    kind: 'confirm',
    resolved: false,
    multiSelect: false,
    subject: 'command',
    namedDirectory: false,
    questions: 1,
    chat: false,
  },
  argTypes: {
    kind: { control: 'inline-radio', options: ['confirm', 'ask'] },
    subject: { control: 'inline-radio', options: ['command', 'code', 'path', 'call'] },
    namedDirectory: { control: 'boolean', if: { arg: 'subject', eq: 'path' } },
    questions: { control: { type: 'range', min: 1, max: 4 } },
  },
  render: (args) => (
    <AgentMessageParts
      message={makeMessage({
        content: null,
        parts: [makeApprovalPart(args)],
      })}
      onApprovalAnswer={logAnswer}
    />
  ),
}

// A path confirm whose directory option says which directory it opens.
export const ApprovalNamingItsDirectory: typeof Approvals = {
  ...Approvals,
  args: { ...Approvals.args, subject: 'path', namedDirectory: true },
}

// Denying with a reason: the field takes focus, says what it is for, and Enter
// sends it.
export const ApprovalFeedback: StoryObj<{ kind: 'confirm' | 'ask' }> = {
  args: { kind: 'confirm' },
  argTypes: { kind: { control: 'inline-radio', options: ['confirm', 'ask'] } },
  render: (args) => (
    <AgentMessageParts
      message={makeMessage({ content: null, parts: [makeApprovalPart(args)] })}
      onApprovalAnswer={logAnswer}
    />
  ),
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await userEvent.click(
      args.kind === 'confirm'
        ? canvas.getByRole('button', { name: /provide feedback/ })
        : canvas.getByRole('textbox', { name: 'Your answer' }),
    )
    const field = canvas.getByRole('textbox')
    await expect(field).toHaveFocus()
    await userEvent.type(
      field,
      args.kind === 'confirm' ? 'Scale the deployment to zero instead' : 'Only the failed shards',
    )
  },
}

// Settles the card on an answer, as a host does.
function AskRoundTrip({
  questions,
  multiSelect,
  previews = false,
}: {
  questions: number
  multiSelect: boolean
  previews?: boolean
}) {
  const ask = useMemo(
    () => makeApprovalPart({ kind: 'ask', questions, multiSelect, previews }),
    [questions, multiSelect, previews],
  )
  const [answer, setAnswer] = useState<ApprovalAnswerValue | null>(null)
  const message = useMemo(() => {
    const part =
      answer?.kind === 'ask'
        ? {
            ...ask,
            resolved: true,
            answers: answer.answers,
            ...(answer.chat ? { chat: true } : {}),
          }
        : ask
    return makeMessage({ content: null, parts: [part] })
  }, [ask, answer])
  return (
    <AgentMessageParts
      message={message}
      onApprovalAnswer={(id, value) => {
        logAnswer(id, value)
        setAnswer(value)
      }}
    />
  )
}

// A lone question: a pick only chooses, and Send sends it.
export const AskQuestion: StoryObj<{ multiSelect: boolean }> = {
  args: { multiSelect: false },
  render: ({ multiSelect }) => <AskRoundTrip questions={1} multiSelect={multiSelect} />,
}

// Several questions, one tab each; a pick or Enter moves on.
export const AskQuestions: StoryObj<{ questions: number; multiSelect: boolean }> = {
  args: { questions: 4, multiSelect: false },
  argTypes: { questions: { control: { type: 'range', min: 2, max: 4 } } },
  render: (args) => <AskRoundTrip {...args} />,
  play: async ({ canvasElement, args }) => {
    if (args.multiSelect || args.questions < 3) {
      return
    }
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: /Shard 4/ }))
    await expect(canvas.getByRole('tab', { name: 'Runners' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    await userEvent.click(canvas.getByRole('button', { name: /Hosted/ }))
    await userEvent.type(
      await canvas.findByPlaceholderText('Type your answer…'),
      'Only the failed shards{Enter}',
    )
  },
}

// The pane follows focus or a resting pointer, and stacks in a narrow card.
export const AskPreviews: StoryObj<{ questions: number }> = {
  args: { questions: 1 },
  argTypes: { questions: { control: { type: 'range', min: 1, max: 4 } } },
  render: ({ questions }) => <AskRoundTrip questions={questions} multiSelect={false} previews />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.hover(canvas.getByRole('button', { name: /Shard 12/ }))
    await expect(
      await canvas.findByRole('region', { name: 'Preview: Shard 12' }),
    ).toBeInTheDocument()
    await userEvent.type(canvas.getByRole('textbox', { name: 'Notes' }), 'Only the flaky jobs')
  },
}

// An ask the reader can't answer here: someone else's, or one the card can't read.
export const AskReadOnly: StoryObj<{ questions: number; waitingOn: string }> = {
  args: { questions: 2, waitingOn: 'Dana' },
  argTypes: { questions: { control: { type: 'range', min: 0, max: 4 } } },
  render: ({ questions, waitingOn }) => (
    <AgentMessageParts
      message={makeMessage({
        content: null,
        parts: [
          {
            ...makeApprovalPart({ kind: 'ask', questions }),
            ...(waitingOn ? { waitingOn } : {}),
          },
        ],
      })}
    />
  ),
}

export const TodoChecklist: StoryObj<{ pending: number; completed: number }> = {
  args: { pending: 2, completed: 2 },
  argTypes: {
    pending: { control: { type: 'range', min: 0, max: 8 } },
    completed: { control: { type: 'range', min: 0, max: 8 } },
  },
  render: (args) => (
    <AgentMessageParts
      message={makeMessage({
        content: null,
        parts: [makeTodoSnapshot(args)],
      })}
    />
  ),
}

export const Notices: StoryObj = {
  render: () => (
    <AgentMessageParts
      message={makeMessage({
        content: null,
        parts: [
          { kind: 'notice', text: 'Session resumed from checkpoint.' },
          { kind: 'warning', text: 'Hook rewrote the tool arguments.' },
          { kind: 'error', text: 'The provider returned a 429; retrying.' },
        ],
      })}
    />
  ),
}

const longThought = [
  '**Planning responsive layout for long settings**',
  'The menu hard-codes a 24-cell label column, so long labels spill.',
  '**Investigating git branch mismatch**',
  'The session reported the feature branch but the checkout is on canary.',
  '**Refining note wrapping and styling approach**',
  'Wrap at the label edge and indent continuation lines.',
].join('\n\n')

function LiveReasoning({
  text,
  live,
  streamMs,
  foldEveryRun,
}: {
  text: string
  live: boolean
  streamMs: number
  foldEveryRun: boolean
}) {
  const streamed = useStreamedText(text, live ? streamMs : 1)
  const streaming = live && !streamed.done
  return (
    <AgentMessageParts
      foldEveryRun={foldEveryRun}
      message={makeMessage({
        role: 'assistant',
        content: null,
        parts: [
          {
            kind: 'reasoning',
            text: live ? streamed.text : text,
            ...(streaming ? {} : { durationMs: streamMs }),
          },
          ...(streaming
            ? []
            : [{ kind: 'text' as const, text: 'Wrapped the labels and indented continuations.' }]),
        ],
      })}
      isStreaming={streaming}
    />
  )
}

// The thought streams in under a shimmering label, showing its latest lines,
// then folds to the label once the answer starts. Remount to replay.
export const Reasoning: StoryObj<{
  live: boolean
  headings: boolean
  streamMs: number
  foldEveryRun: boolean
}> = {
  args: { live: true, headings: true, streamMs: 6000, foldEveryRun: false },
  argTypes: {
    streamMs: { control: { type: 'range', min: 1000, max: 20000, step: 500 } },
    foldEveryRun: {
      description: 'Drawn as a terminal does: the whole thought shows while it streams',
    },
  },
  render: ({ live, headings, streamMs, foldEveryRun }) => (
    <LiveReasoning
      // Remounts on any change so the stream starts over.
      key={`${live}-${headings}-${streamMs}-${foldEveryRun}`}
      live={live}
      streamMs={streamMs}
      foldEveryRun={foldEveryRun}
      text={
        headings
          ? longThought
          : 'The locator resolves but stays invisible. Checking what gates the form.'
      }
    />
  ),
}

const REJECTED = (feedback: string) =>
  `The user doesn't want to proceed with this tool use. The tool use was rejected (eg. if it was a file edit, the new_string was NOT written to the file). To tell you how to proceed, the user said:\n${feedback}`
const UNATTENDED =
  'Permission for this tool use was denied. It requires approval, and this session has no approval surface — nobody can answer a permission prompt here — so it was denied automatically. What required approval: rm -rf build'

export const CallsThatDidNotRun: StoryObj<{ feedback: string; failedLines: number }> = {
  name: 'Declined, unattended, stopped and failed calls',
  args: { feedback: 'keep the old name', failedLines: 20 },
  argTypes: { failedLines: { control: { type: 'range', min: 1, max: 40 } } },
  render: ({ feedback, failedLines }) => {
    const edit = makeEditDiffPart()
    const editArgs = (path: string, oldText: string, newText: string) =>
      JSON.stringify({ path, old_string: oldText, new_string: newText })
    const blocks: MessagePart[] = [
      {
        ...edit,
        args: editArgs('internal/server/server.go', 'idle = 60\n', 'idle = 90\n'),
        result: REJECTED(feedback),
      },
      { ...makeToolCallPart({ name: 'ReadFile' }), result: REJECTED('') },
      { ...makeToolCallPart({ command: 'rm -rf build' }), status: 'error', result: UNATTENDED },
      {
        ...makeToolCallPart({ command: 'sleep 600' }),
        result: 'The user interrupted Bash before it finished.',
      },
      {
        ...makeToolCallPart({ command: 'make test' }),
        status: 'error',
        result: `${Array.from({ length: failedLines }, (_, i) => `FAIL case_${i + 1}`).join('\n')}\nExit code: 2`,
      },
      {
        ...edit,
        args: editArgs('plans/rollout.md', '- [ ] ship\n', '- [x] ship\n'),
        result: 'Edited plans/rollout.md',
        foldDiff: true,
      },
      {
        ...edit,
        args: editArgs('internal/server/server.go', 'retries = 1\n', 'retries = 3\n'),
        result: 'Edited internal/server/server.go',
        argsRewritten: true,
      },
    ]
    // One message each, so no block folds into its neighbors.
    return (
      <div>
        {blocks.map((part, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: a fixed list
          <AgentMessageParts key={i} message={makeMessage({ content: null, parts: [part] })} />
        ))}
      </div>
    )
  },
}

export const SubagentOutcomes: StoryObj<{ reviewing: number; launched: number }> = {
  name: 'Subagent outcomes',
  args: { reviewing: 1, launched: 3 },
  argTypes: {
    reviewing: { control: { type: 'range', min: 0, max: 4 } },
    launched: { control: { type: 'range', min: 1, max: 6 } },
  },
  render: ({ reviewing, launched }) => (
    <AgentMessageParts
      message={makeMessage({
        content: null,
        parts: [
          {
            kind: 'subagent',
            id: 'a1',
            status: 'running',
            description: 'Audit the config loader',
            actions: ['Read config.go'],
            reviewing,
          },
          {
            kind: 'subagent',
            id: 'a2',
            status: 'failed',
            description: 'Rerun the flaky suite',
            interrupted: true,
            summary: '4 tool uses',
          },
          {
            kind: 'subagent',
            id: 'a3',
            status: 'done',
            description: 'Summarize the PR',
            summary: '1 tool use',
            report: 'The PR changes the retry budget only.',
          },
          ...[
            'Sweep logs',
            'Profile startup',
            'Check links',
            'Scan deps',
            'Lint docs',
            'Map routes',
          ]
            .slice(0, launched)
            .map(
              (description, i): MessagePart => ({
                kind: 'subagent',
                id: `bg-${i}`,
                status: 'running',
                background: true,
                description,
                color:
                  (['blue', 'green', 'purple', 'orange', 'cyan', 'pink'] as const)[i] ?? 'blue',
              }),
            ),
        ],
      })}
    />
  ),
}

const notice = (raw: string): MessagePart => {
  const n = parseSubagentNotice(raw)
  return n
    ? { kind: 'notice', text: subagentDeliveryLine(n), ...(n.body ? { detail: n.body } : {}) }
    : { kind: 'notice', text: raw }
}

export const TranscriptExtras: StoryObj = {
  name: 'Images, command output, plans and background notices',
  render: () => (
    <AgentMessageParts
      message={makeMessage({
        content: null,
        parts: [
          { kind: 'image', images: makeImageAttachments().slice(0, 2) },
          {
            kind: 'notice',
            text: '! git status --short',
            detail: '```\n M go.mod\n?? notes.md\n```',
            open: true,
          },
          {
            kind: 'approval',
            id: 'plan',
            approvalKind: 'plan',
            plan: '## Plan\n\n1. Raise the retry budget.\n2. Add a test for the second retry.',
            resolved: true,
            answer: 'Approved',
            canAllowDirectory: false,
          },
          notice(
            '[Background subagent task-2 (Audit the config loader) completed after 2m59s]\nNo issues found.',
          ),
          notice(
            '[Background subagent task-3 (Rerun the flaky suite) failed after 41s]\nThe runner timed out.',
          ),
          notice(
            '[Message from subagent task-4 (Map routes) — it is still working]\nHalf way through.',
          ),
          notice('[Background command bash-1 (npm test) exited with code 1]'),
        ],
      })}
    />
  ),
}

export const ExpandAll: StoryObj<{ expandAll: boolean }> = {
  name: 'Every block opened at once',
  args: { expandAll: true },
  argTypes: {
    expandAll: {
      description: 'Opens or closes every block at once; each still toggles on its own',
    },
  },
  render: ({ expandAll }) => (
    <ExpandAllProvider value={expandAll}>
      <AgentMessageParts message={makeAgentTurn()} foldEveryRun onApprovalAnswer={logAnswer} />
    </ExpandAllProvider>
  ),
}

export const FullAgentTurn: StoryObj = {
  render: () => <AgentMessageParts message={makeAgentTurn()} onApprovalAnswer={logAnswer} />,
}

export const Activity: StoryObj<{
  word: string
  minutesRunning: number
  inputTokens: number
  outputTokens: number
  stoppable: boolean
}> = {
  args: {
    word: 'Percolating',
    minutesRunning: 11,
    inputTokens: 48_200,
    outputTokens: 3_400,
    stoppable: true,
  },
  argTypes: {
    word: { control: 'select', options: [...defaultChatStrings.activity.words] },
    minutesRunning: { control: { type: 'range', min: 0, max: 90 } },
  },
  render: ({ word, minutesRunning, inputTokens, outputTokens, stoppable }) => (
    <ActivityLine
      word={word}
      startedAt={new Date(Date.now() - minutesRunning * 60_000).toISOString()}
      inputTokens={inputTokens}
      outputTokens={outputTokens}
      onStop={stoppable ? () => console.info('[stop turn]') : undefined}
    />
  ),
}
