import type { Meta, StoryObj } from '@storybook/react-vite'
import {
  makeAgentTurn,
  makeApprovalPart,
  makeEditDiffPart,
  makeMessage,
  makeSubagentParts,
  makeTodoSnapshot,
  makeToolCallPart,
  makeWriteFilePart,
} from '../../stories/harness'
import type { ToolCallStatus } from '../../types'
import ActivityLine, { activityWords } from './ActivityLine'
import AgentMessageParts from './AgentMessageParts'

const meta: Meta = {
  title: 'Chat/Agent transcript',
  component: AgentMessageParts,
  parameters: { layout: 'padded' },
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
}> = {
  args: { kind: 'confirm', resolved: false, multiSelect: false },
  argTypes: {
    kind: { control: 'inline-radio', options: ['confirm', 'ask'] },
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

export const Reasoning: StoryObj<{ streaming: boolean; headings: boolean }> = {
  args: { streaming: false, headings: true },
  render: ({ streaming, headings }) => (
    <AgentMessageParts
      message={makeMessage({
        role: 'assistant',
        content: null,
        parts: [
          {
            kind: 'reasoning',
            text: headings
              ? longThought
              : 'The locator resolves but stays invisible. Checking what gates the form.',
            ...(streaming ? {} : { durationMs: 41_000 }),
          },
        ],
      })}
      isStreaming={streaming}
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
    word: { control: 'select', options: [...activityWords] },
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
