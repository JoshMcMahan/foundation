import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, userEvent, within } from 'storybook/test'
import {
  makeAgentTurn,
  makeApprovalPart,
  makeEditDiffPart,
  makeMessage,
  makeSubagentParts,
  makeTodoSnapshot,
  makeToolCallPart,
  makeWriteFilePart,
  useStreamedText,
} from '../../stories/harness'
import { defaultChatStrings } from '../../strings'
import type { ToolCallStatus, ToolDecision } from '../../types'
import ActivityLine from './ActivityLine'
import AgentMessageParts from './AgentMessageParts'

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
        },
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
}> = {
  args: { kind: 'confirm', resolved: false, multiSelect: false, subject: 'command' },
  argTypes: {
    kind: { control: 'inline-radio', options: ['confirm', 'ask'] },
    subject: { control: 'inline-radio', options: ['command', 'code', 'path', 'call'] },
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
      canvas.getByRole('button', {
        name: args.kind === 'confirm' ? /provide feedback/ : /Write my own answer/,
      }),
    )
    const field = canvas.getByRole('textbox')
    await expect(field).toHaveFocus()
    await userEvent.type(
      field,
      args.kind === 'confirm' ? 'Scale the deployment to zero instead' : 'Only the failed shards',
    )
  },
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
}: {
  text: string
  live: boolean
  streamMs: number
}) {
  const streamed = useStreamedText(text, live ? streamMs : 1)
  const streaming = live && !streamed.done
  return (
    <AgentMessageParts
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
export const Reasoning: StoryObj<{ live: boolean; headings: boolean; streamMs: number }> = {
  args: { live: true, headings: true, streamMs: 6000 },
  argTypes: { streamMs: { control: { type: 'range', min: 1000, max: 20000, step: 500 } } },
  render: ({ live, headings, streamMs }) => (
    <LiveReasoning
      // Remounts on any change so the stream starts over.
      key={`${live}-${headings}-${streamMs}`}
      live={live}
      streamMs={streamMs}
      text={
        headings
          ? longThought
          : 'The locator resolves but stays invisible. Checking what gates the form.'
      }
    />
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
