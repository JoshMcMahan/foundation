import { describe, expect, it } from 'vitest'
import {
  appendOwnMessage,
  appendShellRun,
  appendSteeredMessage,
  applyStreamEvent,
  approvalAnswerBody,
  approvalToPart,
  bashRunning,
  dropMessage,
  type GoalNotice,
  historyToMessages,
  initialTranscript,
  liveSessionStatus,
  markQueued,
  pendingApprovals,
  pendingMessages,
  type RecapNotice,
  resolveApprovalEverywhere,
  resumeCursor,
  reviewingCount,
  type TranscriptState,
  type TranscriptWords,
  turnRunning,
  turnVerb,
} from './transcript'
import type { SessionApprovalRequest, SessionHistoryItem, SessionStreamEvent } from './types'

const goalNotice: GoalNotice = (p) =>
  p.err ? `failed: ${p.err}` : `${p.outcome ?? 'continuing'} after ${p.turns}`

const recapNotice: RecapNotice = (recap) => `Recap: ${recap}`

const item = (
  kind: SessionHistoryItem['kind'],
  rest: Partial<SessionHistoryItem> = {},
): SessionHistoryItem => ({ kind, ...rest })

const ev = (
  seq: number,
  type: string,
  rest: Partial<SessionStreamEvent> = {},
): SessionStreamEvent => ({ seq, type, ...rest })

function toolCalls(state: TranscriptState) {
  return (state.streaming?.parts ?? []).filter((p) => p.kind === 'tool_call')
}

describe('historyToMessages', () => {
  it('groups non-user records into one assistant message and pairs results positionally', () => {
    const messages = historyToMessages([
      item('user', { text: 'list files' }),
      item('thinking', { text: 'plan' }),
      item('tool_call', { toolName: 'Bash', toolArgs: '{"command":"ls"}' }),
      item('tool_call', { toolName: 'Read', toolArgs: '{"path":"a"}' }),
      item('tool_result', { text: 'a b c' }),
      item('tool_result', { text: 'Error: not found' }),
      item('assistant', { text: 'done' }),
      item('user', { text: 'thanks' }),
    ])
    expect(messages.map((m) => m.role)).toEqual(['user', 'assistant', 'user'])
    const parts = messages[1]?.parts ?? []
    expect(parts.map((p) => p.kind)).toEqual(['reasoning', 'tool_call', 'tool_call', 'text'])
    const [, bash, read] = parts
    expect(bash).toMatchObject({ name: 'Bash', status: 'ok', result: 'a b c' })
    expect(read).toMatchObject({ name: 'Read', status: 'error' })
  })

  it('classifies recorded slash commands as pseudo user messages and tags main-session text', () => {
    const [cmd, fromMain] = historyToMessages([
      item('user', { text: '<command-input>/help</command-input>' }),
      item('user', { text: 'hello', fromMain: true }),
    ])
    expect(cmd?.pseudo).toBe('command-input')
    expect(fromMain?.author?.username).toBe('main session')
  })

  it('draws a recorded ! run as the command with its output, ahead of the reply', () => {
    const messages = historyToMessages([
      item('user', {
        text: '<shell-input>cat x</shell-input>\n<shell-stdout>has ``` and </shell-stdout> inside\n</shell-stdout>',
      }),
      item('assistant', { text: 'x looks fine' }),
    ])
    expect(messages).toHaveLength(1)
    expect(messages[0]?.parts).toEqual([
      {
        kind: 'notice',
        text: '! cat x',
        detail: '````\nhas ``` and </shell-stdout> inside\n````',
        // The terminal prints a command's output under it, not behind a toggle.
        open: true,
      },
      { kind: 'text', text: 'x looks fine' },
    ])
  })

  it('keeps the indentation a ! run printed on its first line', () => {
    const [msg] = historyToMessages([
      item('user', {
        text: '<shell-input>git status --short</shell-input>\n<shell-stdout>\n M a.go\n?? b.go\n</shell-stdout>',
      }),
    ])
    expect(msg?.parts?.[0]).toMatchObject({
      detail: '```\n M a.go\n?? b.go\n```',
    })
  })

  it('draws a Task as a subagent block and keeps hidden tools from stealing results', () => {
    const [msg] = historyToMessages([
      item('tool_call', { toolName: 'TodoWrite', toolArgs: '{"todos":[]}' }),
      item('tool_call', {
        toolName: 'Task',
        toolArgs: '{"description":"Inventory routes","prompt":"p","subagent_type":"default"}',
      }),
      item('tool_call', { toolName: 'ReadFile', toolArgs: '{"path":"a"}' }),
      item('tool_result', { text: 'Todos have been modified successfully.' }),
      item('tool_result', { text: 'Bottom line: 21 routes remain.\nmore' }),
      item('tool_result', { text: 'contents' }),
    ])
    const parts = msg?.parts ?? []
    expect(parts.map((p) => p.kind)).toEqual(['subagent', 'tool_call'])
    expect(parts[0]).toMatchObject({
      status: 'done',
      description: 'Inventory routes',
      summary: 'Bottom line: 21 routes remain.',
    })
    expect(parts[1]).toMatchObject({ status: 'ok', result: 'contents' })
  })

  it('records a question asked before several per call with its result, and a plan as its body', () => {
    const [msg] = historyToMessages([
      item('tool_call', {
        toolName: 'AskUserQuestion',
        toolArgs: '{"question":"Ship it?"}',
      }),
      item('tool_result', { text: 'Yes' }),
      item('tool_call', {
        toolName: 'ExitPlanMode',
        toolArgs: '{"plan":"# Plan"}',
      }),
      item('tool_result', { text: 'approved' }),
    ])
    expect(msg?.parts).toEqual([
      expect.objectContaining({
        kind: 'approval',
        approvalKind: 'ask',
        questions: [{ question: 'Ship it?' }],
        resolved: true,
        answer: 'Yes',
      }),
      { kind: 'text', text: '# Plan' },
    ])
  })

  it('records every question with its recorded answer and notes, and pairs the results after it', () => {
    const [msg] = historyToMessages([
      item('tool_call', {
        toolName: 'AskUserQuestion',
        toolArgs: '{"questions":[{"question":"Ship it?"},{"question":"When?"}]}',
        decision: {
          callId: 'c1',
          by: 'user',
          status: 'approved',
          at: '2026-10-21T00:00:00Z',
          answers: [
            {
              question: 'Ship it?',
              picked: ['Yes'],
              text: 'after lunch',
              notes: 'once the freeze lifts',
            },
            { question: 'When?' },
          ],
        },
      }),
      item('tool_result', {
        text: 'The user answered: "Ship it?"="Yes, after lunch". Read the answers carefully.',
      }),
      item('tool_call', { toolName: 'Bash', toolArgs: '{"command":"make"}' }),
      item('tool_result', { text: 'built' }),
    ])
    expect(msg?.parts).toEqual([
      {
        kind: 'approval',
        id: expect.any(String),
        approvalKind: 'ask',
        questions: [{ question: 'Ship it?' }, { question: 'When?' }],
        canAllowDirectory: false,
        resolved: true,
        answers: [
          {
            picked: ['Yes'],
            text: 'after lunch',
            notes: 'once the freeze lifts',
          },
          {},
        ],
      },
      expect.objectContaining({
        kind: 'tool_call',
        name: 'Bash',
        result: 'built',
      }),
    ])
  })

  it('leaves a question still waiting to its pending approval', () => {
    const state = initialTranscript({
      status: 'awaiting_approval',
      history: [
        item('user', { text: 'deploy it' }),
        item('assistant', { text: 'Let me confirm.' }),
        item('tool_call', {
          toolName: 'AskUserQuestion',
          toolArgs: '{"questions":[{"question":"Ship it?"}]}',
        }),
      ],
      approvals: [
        {
          id: 'ap1',
          kind: 'ask',
          createdAt: '2026-10-21T00:00:00Z',
          callId: 'c1',
          questions: [{ question: 'Ship it?' }],
        },
      ],
    })
    const cards = (state.streaming?.parts ?? []).filter((p) => p.kind === 'approval')
    expect(cards).toEqual([expect.objectContaining({ id: 'ap1' })])
  })

  it('records an ask the reader chose to chat about', () => {
    const [msg] = historyToMessages([
      item('tool_call', {
        toolName: 'AskUserQuestion',
        toolArgs: '{"questions":[{"question":"Ship it?"}]}',
        decision: {
          callId: 'c1',
          by: 'user',
          status: 'denied',
          at: '2026-10-21T00:00:00Z',
          answers: [{ question: 'Ship it?' }],
        },
      }),
      item('tool_result', {
        text: 'The user wants to clarify these questions.',
      }),
    ])
    expect(msg?.parts?.[0]).toMatchObject({
      resolved: true,
      answers: [{}],
      chat: true,
    })
  })

  it('reduces a delivered subagent report to its delivery line and drops a silent one', () => {
    const [msg] = historyToMessages([
      item('notice', {
        text: '[Message from subagent task-4 (Routes) — it is still working]\nHalf way there.\n(pass task-4 as task_id to send it direction)',
      }),
      item('notice', {
        text: '[Background subagent task-1 (x) was interrupted by the user and returned no result]',
      }),
      item('notice', { text: 'plain notice' }),
    ])
    expect(msg?.parts).toEqual([
      {
        kind: 'notice',
        text: 'Message from Routes',
        detail: 'Half way there.',
      },
      { kind: 'notice', text: 'plain notice' },
    ])
  })

  it('shows who settled a recorded call', () => {
    const at = '2026-10-19T12:00:00Z'
    const messages = historyToMessages([
      item('tool_call', {
        toolName: 'Bash',
        toolArgs: '{"command":"sbatch run.sh"}',
        callId: 'c1',
        decision: {
          callId: 'c1',
          by: 'user',
          username: 'ana',
          status: 'approved',
          note: 'directory whitelisted for session',
          at,
        },
      }),
      item('tool_result', { text: 'Submitted batch job 42' }),
    ])
    expect(messages[0]?.parts?.[0]).toMatchObject({
      kind: 'tool_call',
      decision: {
        status: 'approved',
        by: 'user',
        name: 'ana',
        note: 'directory whitelisted for session',
        at,
      },
    })
  })

  it("carries the auto-reviewer's rationale as the reason", () => {
    const [message] = historyToMessages([
      item('tool_call', {
        toolName: 'Bash',
        toolArgs: '{"command":"scancel --user=ana"}',
        decision: {
          callId: 'c1',
          by: 'auto-reviewer',
          status: 'denied',
          rationale: 'Cancels every job the user owns.',
          at: '2026-10-19T12:00:00Z',
        },
      }),
    ])
    expect(message?.parts?.[0]).toMatchObject({
      decision: { reason: 'Cancels every job the user owns.' },
    })
  })

  it('closes open tool calls unless the turn is still live', () => {
    const history = [item('tool_call', { toolName: 'Bash', toolArgs: '{}' })]
    expect(historyToMessages(history)[0]?.parts?.[0]).toMatchObject({
      status: 'error',
      result: 'interrupted',
    })
    expect(historyToMessages(history, { finalizeOpen: false })[0]?.parts?.[0]).toMatchObject({
      status: 'running',
    })
  })

  it('renders plan views from the plan body and goal records as notices', () => {
    const [msg] = historyToMessages(
      [
        item('plan_view', { text: 'saw plan', planBody: '# Plan' }),
        // What the daemon files: the loop step as JSON.
        item('goal_progress', {
          text: '{"turns":1,"condition":"DONE","outcome":"achieved","elapsedMs":6557,"tokens":28190}',
        }),
        item('goal_progress', { text: '{"turns":1,"reason":"not yet"}' }),
        item('goal_progress', { text: '{"err":"model unavailable"}' }),
        item('goal_progress', { text: '{"outcome":"stopped"}' }),
      ],
      { goalNotice },
    )
    expect(msg?.parts).toEqual([
      { kind: 'text', text: '# Plan' },
      { kind: 'notice', text: 'achieved after 1' },
      { kind: 'notice', text: 'continuing after 1' },
      { kind: 'notice', text: 'failed: model unavailable' },
    ])
  })

  it("shows a /goal or /plan as the user's message with its answer under it", () => {
    const messages = historyToMessages([
      item('assistant', { text: 'step one' }),
      item('goal_view', { toolName: '/goal pause', text: 'Goal paused: DONE' }),
      item('plan_view', {
        toolName: '/plan',
        text: 'plans/a.md',
        planBody: '# Plan',
      }),
    ])
    // The answer hangs under the command, as the terminal draws it, not as a reply.
    expect(messages.map((m) => m.role)).toEqual(['assistant', 'user', 'user'])
    expect(messages[1]).toMatchObject({
      content: '/goal pause',
      commandAnswer: { text: 'Goal paused: DONE' },
    })
    expect(messages[2]).toMatchObject({
      content: '/plan',
      commandAnswer: { text: 'plans/a.md', document: '# Plan' },
    })
  })

  it('shows a /compact with its summary folded under it, as the terminal does', () => {
    const messages = historyToMessages(
      [
        item('compaction', {
          toolName: '/compact keep the API',
          text: '# Summary',
        }),
        item('compaction', { text: '# Later' }),
      ],
      {
        compactionNotice: {
          command: 'Compacted',
          automatic: 'Compacted the conversation',
        },
      },
    )
    expect(messages.map((m) => m.role)).toEqual(['user', 'assistant'])
    expect(messages[0]).toMatchObject({
      content: '/compact keep the API',
      commandAnswer: { text: 'Compacted', detail: '# Summary' },
    })
    // An automatic compaction has no command to hang off.
    expect(messages[1]?.parts).toEqual([
      { kind: 'notice', text: 'Compacted the conversation', detail: '# Later' },
    ])
  })

  it('shows each recap after the reply it follows', () => {
    const history = [
      item('user', { text: 'add a session recap' }),
      item('assistant', { text: 'Done.' }),
      item('turn_end'),
      item('recap', { text: 'Adding a session recap; next, run the tests.' }),
      item('user', { text: 'now the setting' }),
    ]
    const messages = historyToMessages(history, { recapNotice })
    expect(messages.map((m) => m.role)).toEqual(['user', 'assistant', 'user'])
    expect(messages[1]?.parts).toEqual([
      { kind: 'text', text: 'Done.' },
      {
        kind: 'notice',
        text: 'Recap: Adding a session recap; next, run the tests.',
      },
    ])
  })
})

describe('initialTranscript', () => {
  it('seeds the cursor from lastSeq and surfaces pending approvals', () => {
    const state = initialTranscript({
      status: 'awaiting_approval',
      history: [item('user', { text: 'rm it' })],
      approvals: [
        {
          id: 'ap1',
          kind: 'confirm',
          createdAt: '2026-09-09T00:00:00Z',
          command: 'rm -rf build',
        },
      ],
      lastSeq: 41,
    })
    expect(state.cursor).toBe(41)
    expect(state.streaming?.parts?.[0]).toMatchObject({
      kind: 'approval',
      id: 'ap1',
      approvalKind: 'confirm',
      command: 'rm -rf build',
    })
  })
})

describe('applyStreamEvent', () => {
  const empty: TranscriptState = {
    messages: [],
    streaming: null,
    cursor: 10,
    turnEnded: false,
    queued: [],
    steered: [],
    notes: [],
    turnStartedAt: null,
  }

  it('drops replayed frames at or below the cursor and advances on new ones', () => {
    const stale = applyStreamEvent(empty, ev(10, 'chunk', { content: 'old' }))
    expect(stale.state).toBe(empty)
    const fresh = applyStreamEvent(empty, ev(11, 'chunk', { content: 'new' }))
    expect(fresh.state.cursor).toBe(11)
    expect(fresh.state.streaming?.parts).toEqual([{ kind: 'text', text: 'new' }])
  })

  it('handles replay_truncated by type before any seq dedupe', () => {
    const { effects, state } = applyStreamEvent(empty, ev(10, 'replay_truncated'))
    expect(effects).toEqual([{ type: 'refetch' }])
    expect(state.cursor).toBe(10)
  })

  it('turns seq-0 notices into transient effects without touching the cursor', () => {
    const { effects, state } = applyStreamEvent(
      empty,
      ev(0, 'notice', { content: 'live elsewhere' }),
    )
    expect(effects).toEqual([{ type: 'notice', text: 'live elsewhere', warn: false }])
    expect(state.cursor).toBe(10)
  })

  // A hook that rewrote a call's input sends its whole new arguments.
  it('pairs tool_update and tool_end with the newest running call of that name', () => {
    let state = empty
    for (const e of [
      ev(11, 'tool_start', { name: 'Bash', args: '{"c":"rm -rf /"}' }),
      ev(12, 'tool_start', { name: 'Read', args: '{}' }),
      ev(13, 'tool_update', { name: 'Bash', args: '{"c":"ls"}' }),
      ev(14, 'tool_end', { name: 'Read', result: 'text' }),
      ev(15, 'tool_end', { name: 'Bash', result: 'boom', isError: true }),
    ]) {
      state = applyStreamEvent(state, e).state
    }
    const [bash, read] = toolCalls(state)
    expect(bash).toMatchObject({
      id: '11',
      args: '{"c":"ls"}',
      status: 'error',
      result: 'boom',
    })
    expect(read).toMatchObject({ id: '12', status: 'ok', result: 'text' })
  })

  it('reads a failure the result reports in its text, as replay does', () => {
    let state = empty
    for (const e of [
      ev(11, 'tool_start', { name: 'Bash', args: '{"command":"false"}' }),
      ev(12, 'tool_end', { name: 'Bash', result: 'boom\nExit code: 1' }),
    ]) {
      state = applyStreamEvent(state, e).state
    }
    const [replayed] = historyToMessages([
      item('tool_call', { toolName: 'Bash', toolArgs: '{"command":"false"}' }),
      item('tool_result', { text: 'boom\nExit code: 1' }),
    ])
    expect(toolCalls(state)).toMatchObject([{ status: 'error' }])
    expect(replayed?.parts).toMatchObject([{ status: 'error' }])
  })

  it('ends the call a tool_end names when a batch of the same tool ends out of order', () => {
    let state = empty
    for (const e of [
      ev(11, 'tool_start', { name: 'Read', args: '{}', callId: 'c1' }),
      ev(12, 'tool_start', { name: 'Read', args: '{}', callId: 'c2' }),
      ev(13, 'tool_end', { name: 'Read', result: 'first', callId: 'c1' }),
      ev(14, 'tool_end', { name: 'Read', result: 'second', callId: 'c2' }),
    ]) {
      state = applyStreamEvent(state, e).state
    }
    expect(toolCalls(state)).toMatchObject([
      { id: 'c1', status: 'ok', result: 'first' },
      { id: 'c2', status: 'ok', result: 'second' },
    ])
  })

  it('puts a live decision on the call it names and skips one still under review', () => {
    const decision = (status: 'reviewing' | 'denied') => ({
      callId: 'c2',
      by: 'auto-reviewer' as const,
      status,
      at: '2026-10-19T12:00:00Z',
    })
    let state = empty
    for (const e of [
      ev(11, 'tool_start', { name: 'Bash', args: '{}', callId: 'c1' }),
      ev(12, 'tool_start', { name: 'Bash', args: '{}', callId: 'c2' }),
      ev(13, 'decision', { decision: decision('reviewing') }),
    ]) {
      state = applyStreamEvent(state, e).state
    }
    expect(toolCalls(state).some((p) => 'decision' in p)).toBe(false)
    state = applyStreamEvent(state, ev(14, 'decision', { decision: decision('denied') })).state
    const [first, second] = toolCalls(state)
    expect(first).not.toHaveProperty('decision')
    expect(second).toMatchObject({
      id: 'c2',
      decision: { status: 'denied', by: 'auto-reviewer' },
    })
  })

  it('moves the streaming message into history on done', () => {
    const state = applyStreamEvent(empty, ev(11, 'tool_start', { name: 'Bash', args: '{}' })).state
    const { state: done, effects } = applyStreamEvent(state, ev(12, 'done'))
    expect(done.streaming).toBeNull()
    expect(done.messages).toHaveLength(1)
    expect(done.messages[0]?.parts?.[0]).toMatchObject({
      status: 'error',
      result: 'interrupted',
    })
    expect(effects).toEqual([])
  })

  it('ends a stopped turn with the interrupted notice rather than an error', () => {
    for (const closing of [
      ev(12, 'error', {
        content: 'stream error: context canceled',
        interrupted: true,
      }),
      // Daemons before the flag send only the canceled context's text.
      ev(12, 'error', {
        content: 'stream error after partial output: context canceled',
      }),
    ]) {
      const running = applyStreamEvent(empty, ev(11, 'chunk', { content: 'un' })).state
      const { state } = applyStreamEvent(running, closing)
      expect(state.streaming).toBeNull()
      expect(state.messages[0]?.parts?.at(-1)).toEqual({
        kind: 'notice',
        text: 'Request interrupted by the user.',
      })
    }
    const failed = applyStreamEvent(
      applyStreamEvent(empty, ev(11, 'chunk', { content: 'un' })).state,
      ev(12, 'error', { content: 'model unavailable' }),
    ).state
    expect(failed.messages[0]?.parts?.at(-1)).toEqual({
      kind: 'error',
      text: 'model unavailable',
    })
  })

  it('does not repeat an interruption a snapshot recorded before its closing frame', () => {
    for (const status of ['running', 'idle'] as const) {
      const seeded = initialTranscript({
        status,
        lastSeq: 11,
        turnId: 'second',
        history: [
          item('user', { text: 'help me choose' }),
          item('tool_call', {
            toolName: 'AskUserQuestion',
            toolArgs: '{"questions":[{"question":"Which option?"}]}',
          }),
          item('tool_result', { text: 'The user answered: option one.' }),
          item('assistant', {
            text: '[Request interrupted by the user.]',
            turnId: 'first',
          }),
          item('turn_end'),
        ],
      })
      const { state } = applyStreamEvent(
        seeded,
        ev(12, 'error', {
          content: 'context canceled',
          interrupted: true,
          turnId: 'first',
        }),
      )
      expect(state.streaming).toBeNull()
      expect(state.turnEnded).toBe(true)
      expect(state.messages).toHaveLength(2)
      expect(state.messages[1]?.parts).toEqual([
        expect.objectContaining({ kind: 'approval', resolved: true }),
        { kind: 'notice', text: 'Request interrupted by the user.' },
      ])

      const nextTurn = applyStreamEvent(
        state,
        ev(13, 'user_message', { content: 'another request', turnId: 'second' }),
      ).state
      const stoppedAgain = applyStreamEvent(
        nextTurn,
        ev(14, 'error', {
          content: 'context canceled',
          interrupted: true,
          turnId: 'second',
        }),
      ).state
      expect(stoppedAgain.messages).toHaveLength(4)
      expect(stoppedAgain.messages[3]?.parts).toEqual([
        { kind: 'notice', text: 'Request interrupted by the user.' },
      ])
    }
  })

  it('does not repeat a saved failure when its closing frame follows the snapshot', () => {
    const text = "You've hit your limit"
    for (const status of ['running', 'idle'] as const) {
      const seeded = initialTranscript({
        status,
        lastSeq: 11,
        turnId: 'second',
        history: [
          item('user', { text: 'continue the task' }),
          item('error', { text, turnId: 'first' }),
          item('turn_end'),
        ],
      })
      const { state } = applyStreamEvent(
        seeded,
        ev(12, 'error', { content: text, turnId: 'first' }),
      )
      expect(state.streaming).toBeNull()
      expect(state.turnEnded).toBe(true)
      expect(state.messages).toHaveLength(2)
      expect(state.messages[1]?.parts).toEqual([{ kind: 'error', text }])

      const nextTurn = applyStreamEvent(
        state,
        ev(13, 'user_message', { content: 'try again', turnId: 'second' }),
      ).state
      const failedAgain = applyStreamEvent(
        nextTurn,
        ev(14, 'error', { content: text, turnId: 'second' }),
      ).state
      expect(failedAgain.messages).toHaveLength(4)
      expect(failedAgain.messages[3]?.parts).toEqual([{ kind: 'error', text }])
    }
  })

  it.each([false, true])(
    'keeps identical live failures from distinct turns without a user-message echo (interrupted: %s)',
    (interrupted) => {
      for (const withTurnIds of [false, true]) {
        const content = interrupted ? 'context canceled' : 'paste no longer exists'
        const first = applyStreamEvent(
          empty,
          ev(11, 'error', {
            content,
            interrupted,
            ...(withTurnIds ? { turnId: 'first' } : {}),
          }),
        ).state
        const second = applyStreamEvent(
          first,
          ev(12, 'error', {
            content,
            interrupted,
            ...(withTurnIds ? { turnId: 'second' } : {}),
          }),
        ).state
        expect(second.messages).toHaveLength(2)
        expect(second.messages[1]?.parts).toEqual(first.messages[0]?.parts)
        expect(second.streaming).toBeNull()
      }
    },
  )

  it.each(
    (['running', 'idle'] as const).flatMap((status) =>
      [undefined, 'old-turn'].flatMap((sourceTurnId) =>
        [undefined, 'new-turn'].flatMap((eventTurnId) =>
          [false, true].map((interrupted) => ({
            status,
            sourceTurnId,
            eventTurnId,
            interrupted,
          })),
        ),
      ),
    ),
  )(
    'keeps a distinct promptless failure after a $status snapshot (source: $sourceTurnId, event: $eventTurnId, interrupted: $interrupted)',
    ({ status, sourceTurnId, eventTurnId, interrupted }) => {
      const content = interrupted ? 'context canceled' : 'model unavailable'
      const seeded = initialTranscript({
        status,
        lastSeq: 11,
        turnId: 'new-turn',
        history: [
          item('user', { text: 'continue' }),
          interrupted
            ? item('assistant', {
                text: '[Request interrupted by the user.]',
                ...(sourceTurnId ? { turnId: sourceTurnId } : {}),
              })
            : item('error', {
                text: content,
                ...(sourceTurnId ? { turnId: sourceTurnId } : {}),
              }),
          item('turn_end'),
        ],
      })
      const failed = applyStreamEvent(
        seeded,
        ev(12, 'error', {
          content,
          interrupted,
          ...(eventTurnId ? { turnId: eventTurnId } : {}),
        }),
      ).state
      const terminal = interrupted
        ? { kind: 'notice', text: 'Request interrupted by the user.' }
        : { kind: 'error', text: content }
      expect(failed.messages.flatMap((m) => m.parts ?? [])).toEqual([terminal, terminal])
      expect(failed.streaming).toBeNull()
    },
  )

  it('consumes a snapshot terminal match before another turn fails identically', () => {
    for (const status of ['running', 'idle'] as const) {
      for (const interrupted of [false, true]) {
        const content = interrupted ? 'context canceled' : 'model unavailable'
        const seeded = initialTranscript({
          status,
          lastSeq: 11,
          turnId: 'first',
          history: [
            item('user', { text: 'continue' }),
            interrupted
              ? item('assistant', {
                  text: '[Request interrupted by the user.]',
                  turnId: 'first',
                })
              : item('error', { text: content, turnId: 'first' }),
            item('turn_end'),
          ],
        })
        const stateUpdate = applyStreamEvent(
          seeded,
          ev(12, 'state', { state: { model: 'model' } }),
        ).state
        const closed = applyStreamEvent(
          stateUpdate,
          ev(13, 'error', { content, interrupted, turnId: 'first' }),
        ).state
        expect(closed.messages).toHaveLength(2)
        const failedAgain = applyStreamEvent(
          closed,
          ev(14, 'error', { content, interrupted, turnId: 'second' }),
        ).state
        expect(failedAgain.messages).toHaveLength(3)
        expect(failedAgain.messages[2]?.parts).toEqual(closed.messages[1]?.parts)
        expect(failedAgain.streaming).toBeNull()
      }
    }
  })

  it('consumes snapshot terminal eligibility when a hidden tool starts a new turn', () => {
    for (const status of ['running', 'idle'] as const) {
      const content = 'model unavailable'
      const seeded = initialTranscript({
        status,
        lastSeq: 11,
        turnId: 'second',
        history: [item('error', { text: content, turnId: 'first' })],
      })
      const started = applyStreamEvent(
        seeded,
        ev(12, 'tool_start', {
          name: 'TodoWrite',
          args: '{}',
          turnId: 'second',
        }),
      ).state
      const failed = applyStreamEvent(started, ev(13, 'error', { content, turnId: 'second' })).state
      expect(failed.messages.flatMap((m) => m.parts ?? [])).toEqual([
        { kind: 'error', text: content },
        { kind: 'error', text: content },
      ])
    }
  })

  it("echoes another window's message before its turn and re-targets on cleared", () => {
    const { state } = applyStreamEvent(
      empty,
      ev(11, 'user_message', { content: 'from the terminal' }),
    )
    expect(state.messages).toEqual([
      expect.objectContaining({ role: 'user', content: 'from the terminal' }),
    ])
    const { effects } = applyStreamEvent(
      state,
      ev(12, 'cleared', { newId: '20260909-130000-bbbb' }),
    )
    expect(effects).toEqual([{ type: 'cleared', newId: '20260909-130000-bbbb' }])
  })

  it('resolves approvals wherever they live', () => {
    let state = applyStreamEvent(
      empty,
      ev(11, 'approval_request', {
        approval: {
          id: 'ap1',
          kind: 'ask',
          createdAt: '2026-09-09T00:00:00Z',
          questions: [{ question: 'which?', options: [{ label: 'a' }] }],
        },
      }),
    ).state
    state = applyStreamEvent(state, ev(12, 'approval_resolved', { approvalId: 'ap1' })).state
    expect(state.streaming?.parts?.[0]).toMatchObject({
      kind: 'approval',
      approvalKind: 'ask',
      resolved: true,
    })
  })

  it('settles an ask card with its recorded answers, wherever they were given', () => {
    let state = applyStreamEvent(
      empty,
      ev(11, 'approval_request', {
        approval: {
          id: 'ap1',
          kind: 'ask',
          createdAt: '2026-09-09T00:00:00Z',
          callId: 'c1',
          questions: [{ question: 'Ship it?' }, { question: 'When?' }],
        },
      }),
    ).state
    state = applyStreamEvent(
      state,
      ev(12, 'decision', {
        decision: {
          callId: 'c1',
          by: 'user',
          status: 'approved',
          at: '2026-09-09T00:00:01Z',
          answers: [{ question: 'Ship it?', picked: ['Yes'] }, { question: 'When?' }],
        },
      }),
    ).state
    expect(state.streaming?.parts?.[0]).toMatchObject({
      resolved: true,
      answers: [{ picked: ['Yes'] }, {}],
    })
  })

  it('appends streamed reasoning and text into single parts', () => {
    let state = empty
    for (const e of [
      ev(11, 'reasoning', { content: 'thi' }),
      ev(12, 'reasoning', { content: 'nk' }),
      ev(13, 'chunk', { content: 'he' }),
      ev(14, 'chunk', { content: 'llo' }),
    ]) {
      state = applyStreamEvent(state, e).state
    }
    expect(state.streaming?.parts).toMatchObject([
      { kind: 'reasoning', text: 'think' },
      { kind: 'text', text: 'hello' },
    ])
  })

  it('times a thought from when its step began until the reply starts, as the terminal does', () => {
    let time = ''
    const now = () => `2026-11-11T${time}.000Z`
    let state = empty
    const at = (t: string, e: SessionStreamEvent) => {
      time = t
      state = applyStreamEvent(state, e, { now }).state
    }
    at('12:00:00', ev(11, 'user_message', { content: 'go' }))
    at('12:00:02', ev(12, 'reasoning', { content: 'plan' }))
    at('12:00:05', ev(13, 'reasoning', { content: ' more' }))
    at('12:00:07', ev(14, 'chunk', { content: 'done' }))
    // The step opened at the message, before the first thinking token arrived.
    expect(state.streaming?.parts?.[0]).toMatchObject({
      kind: 'reasoning',
      durationMs: 7000,
    })
  })

  // The response restreams from the start, so its text and thinking go; the
  // tool the turn already ran is not part of what is being replayed.
  it('retracts the in-flight text and thinking but keeps earlier tool calls', () => {
    let state = empty
    for (const e of [
      ev(11, 'tool_start', { name: 'Bash', args: '{}' }),
      ev(12, 'tool_end', { name: 'Bash', result: 'ok' }),
      ev(13, 'reasoning', { content: 'think' }),
      ev(14, 'chunk', { content: 'hello' }),
      ev(15, 'retract'),
    ]) {
      state = applyStreamEvent(state, e).state
    }
    expect(state.streaming?.parts).toHaveLength(1)
    expect(state.streaming?.parts?.[0]).toMatchObject({ kind: 'tool_call' })
  })

  // Retracting whatever is last would delete the tool card instead.
  it('leaves a tool call alone when nothing was streamed after it', () => {
    let state = empty
    for (const e of [ev(11, 'tool_start', { name: 'Bash', args: '{}' }), ev(12, 'retract')]) {
      state = applyStreamEvent(state, e).state
    }
    expect(state.streaming?.parts).toHaveLength(1)
  })

  // The echo can arrive before the response that names the turn.
  it('drops our own message echo matched by text when the turn id is not known yet', () => {
    const sent = appendOwnMessage(empty, 'run the tests')
    const after = applyStreamEvent(
      sent,
      ev(11, 'user_message', { content: 'run the tests', turnId: 't-9' }),
      { ownTexts: new Set(['run the tests']) },
    ).state
    expect(after.messages).toHaveLength(1)
  })
})

describe('pastes', () => {
  const empty: TranscriptState = {
    messages: [],
    streaming: null,
    cursor: 10,
    turnEnded: false,
    queued: [],
    steered: [],
    notes: [],
    turnStartedAt: null,
  }
  const file = {
    placeholder: '[Pasted text #1 +900 lines]',
    id: 1,
    lines: 900,
    bytes: 90_000,
  }

  it('keeps the pastes a history item names', () => {
    const [message] = historyToMessages([
      item('user', { text: `read ${file.placeholder}`, pastes: [file] }),
    ])
    expect(message).toMatchObject({
      content: `read ${file.placeholder}`,
      pastes: [file],
    })
  })

  // The composer showed a card, but the daemon had a bigger window by the
  // time the turn ran and sent the paste inline.
  it("takes the echo's word on how our own paste was sent", () => {
    const text = `read ${file.placeholder}`
    const sent = appendOwnMessage(empty, text, 'own-1', [file])
    const inline = { ...file, inline: true, text: 'the paste' }
    const after = applyStreamEvent(
      sent,
      ev(11, 'user_message', {
        content: text,
        turnId: 't-1',
        pastes: [inline],
      }),
      { ownTurnIds: new Set(['t-1']) },
    ).state
    expect(after.messages).toHaveLength(1)
    expect(after.messages[0]?.pastes).toEqual([inline])
  })

  // The daemon found no saved paste for the placeholder, so the model read it
  // as text; the message must not keep showing a card for it.
  it('drops our own paste when the echo names none', () => {
    const text = `read ${file.placeholder}`
    const sent = appendOwnMessage(empty, text, 'own-1', [file])
    const after = applyStreamEvent(sent, ev(11, 'user_message', { content: text, turnId: 't-1' }), {
      ownTurnIds: new Set(['t-1']),
    }).state
    expect(after.messages).toHaveLength(1)
    expect(after.messages[0]?.pastes ?? null).toBeNull()
  })

  it('shows the pastes of a message another window sent', () => {
    const after = applyStreamEvent(
      empty,
      ev(11, 'user_message', { content: file.placeholder, pastes: [file] }),
    ).state
    expect(after.messages[0]?.pastes).toEqual([file])
  })

  it("takes the note's word on how a paste steered into the turn was sent", () => {
    const text = `also ${file.placeholder}`
    const inline = { ...file, inline: true, text: 'the paste' }
    let state = applyStreamEvent(empty, ev(11, 'chunk', { content: 'working' })).state
    state = appendSteeredMessage(state, text, 'own-1', [file])
    state = applyStreamEvent(state, ev(12, 'user_note', { content: text, pastes: [inline] }), {
      echoOf: 'own-1',
    }).state
    expect(state.notes).toMatchObject([{ id: 'own-1', pastes: [inline] }])
  })

  it('shows the pastes of a note another window steered in', () => {
    const working = applyStreamEvent(empty, ev(11, 'chunk', { content: 'working' })).state
    const after = applyStreamEvent(
      working,
      ev(12, 'user_note', { content: file.placeholder, pastes: [file] }),
    ).state
    expect(after.notes[0]?.pastes).toEqual([file])
  })
})

describe('images', () => {
  const empty: TranscriptState = {
    messages: [],
    streaming: null,
    cursor: 10,
    turnEnded: false,
    queued: [],
    steered: [],
    notes: [],
    turnStartedAt: null,
  }
  const image = { mime: 'image/png', data: 'iVBORw0KGgo=' }
  const preview = 'data:image/png;base64,iVBORw0KGgo='
  const shown = {
    id: preview,
    previewUrl: preview,
    contentType: 'image/png',
    size: 8,
  }

  it('shows the images a history item carried', () => {
    const [message] = historyToMessages([
      item('user', { text: 'look at [Image #1]', images: [image] }),
    ])
    expect(message?.attachments).toMatchObject([shown])
  })

  it('shows the images of a message another window sent', () => {
    const after = applyStreamEvent(
      empty,
      ev(11, 'user_message', { content: '[Image #1]', images: [image] }),
    ).state
    expect(after.messages[0]?.attachments).toMatchObject([shown])
  })

  it('adds the images to our own message when its echo arrives', () => {
    const text = 'this one [Image #1]'
    const sent = appendOwnMessage(empty, text, 'own-1')
    const after = applyStreamEvent(
      sent,
      ev(11, 'user_message', { content: text, turnId: 't-1', images: [image] }),
      { ownTurnIds: new Set(['t-1']) },
    ).state
    expect(after.messages).toHaveLength(1)
    expect(after.messages[0]?.attachments).toMatchObject([shown])
  })

  it('shows the images of a note steered into the turn', () => {
    const working = applyStreamEvent(empty, ev(11, 'chunk', { content: 'working' })).state
    const after = applyStreamEvent(
      working,
      ev(12, 'user_note', { content: '[Image #1]', images: [image] }),
    ).state
    expect(after.notes[0]?.attachments).toMatchObject([shown])
  })

  it('adds the images to our own steered note when it is handed over', () => {
    const text = 'also [Image #1]'
    let state = applyStreamEvent(empty, ev(11, 'chunk', { content: 'working' })).state
    state = appendSteeredMessage(state, text, 'own-1')
    state = applyStreamEvent(state, ev(12, 'user_note', { content: text, images: [image] }), {
      echoOf: 'own-1',
    }).state
    expect(state.notes).toMatchObject([{ id: 'own-1', attachments: [shown] }])
  })

  it('leaves out an image whose type is not an image', () => {
    const [message] = historyToMessages([
      item('user', {
        text: '[Image #1] [Image #2]',
        images: [{ mime: 'application/octet-stream', data: 'AAAA' }, image],
      }),
    ])
    expect(message?.attachments).toMatchObject([shown])
    expect(message?.attachments).toHaveLength(1)
  })

  describe('at full size', () => {
    const digest = 'ab'.repeat(32)
    const original = { originalMime: 'image/webp', originalSize: 2_400_000 }
    const first = { ...image, ...original, ref: `${digest}-0` }
    const second = { ...image, ...original, ref: `${digest}-1` }
    const imageUrl = (ref: string) => `/api/code/machines/m/sessions/s/images/${ref}`
    const full = (ref: string) => ({
      ...shown,
      id: imageUrl(ref),
      contentType: 'image/webp',
      size: 2_400_000,
    })

    it('opens each image from the original its ref names, keeping the preview as its thumbnail', () => {
      const state = initialTranscript(
        {
          status: 'idle',
          history: [item('user', { text: 'twice', images: [first, second] })],
        },
        { imageUrl },
      )
      expect(state.messages[0]?.attachments).toEqual([
        { ...full(first.ref), filename: '', uploadedAt: '' },
        { ...full(second.ref), filename: '', uploadedAt: '' },
      ])
    })

    it('opens the images of messages and notes from the feed at full size', () => {
      let state = applyStreamEvent(
        empty,
        ev(11, 'user_message', { content: '[Image #1]', images: [first] }),
        { imageUrl },
      ).state
      expect(state.messages[0]?.attachments).toMatchObject([full(first.ref)])
      state = appendSteeredMessage(state, 'also [Image #1]', 'own-1')
      state = applyStreamEvent(
        state,
        ev(12, 'user_note', { content: 'also [Image #1]', images: [second] }),
        { echoOf: 'own-1', imageUrl },
      ).state
      expect(state.notes).toMatchObject([{ id: 'own-1', attachments: [full(second.ref)] }])
    })

    it('opens an image from its preview when nothing serves its original', () => {
      const [message] = historyToMessages([
        item('user', { text: '[Image #1] [Image #2]', images: [first, image] }),
      ])
      expect(message?.attachments).toMatchObject([shown, shown])
      const [served] = historyToMessages(
        [
          item('user', {
            text: '[Image #1] [Image #2]',
            images: [first, image],
          }),
        ],
        { imageUrl },
      )
      expect(served?.attachments).toMatchObject([full(first.ref), shown])
    })
  })
})

describe('live turn seeding', () => {
  type Detail = Parameters<typeof initialTranscript>[0]
  const runningDetail = (
    history: SessionHistoryItem[],
    status: Detail['status'] = 'running',
  ): Detail => ({
    status,
    history,
    lastSeq: 10,
    ...(status === 'running' ? { turnId: 't0' } : {}),
  })

  it('continues an in-flight turn so its tool_end completes the open call', () => {
    const state = initialTranscript(
      runningDetail([
        item('user', { text: 'build it' }),
        item('tool_call', { toolName: 'Bash', toolArgs: '{"command":"make"}' }),
      ]),
    )
    // The open call must be on the streaming message, not stranded in history.
    expect(state.messages).toHaveLength(1)
    expect(state.streaming?.parts?.[0]).toMatchObject({
      kind: 'tool_call',
      status: 'running',
    })

    const after = applyStreamEvent(state, ev(11, 'tool_end', { name: 'Bash', result: 'ok' })).state
    expect(after.streaming?.parts?.[0]).toMatchObject({
      status: 'ok',
      result: 'ok',
    })
  })

  it('ends the in-flight call a live tool_end names among calls history drew', () => {
    const state = initialTranscript(
      runningDetail([
        item('user', { text: 'read both' }),
        item('tool_call', { toolName: 'Read', toolArgs: '{}', callId: 'c1' }),
        item('tool_call', { toolName: 'Read', toolArgs: '{}', callId: 'c2' }),
      ]),
    )
    const after = applyStreamEvent(
      state,
      ev(11, 'tool_end', { name: 'Read', result: 'first', callId: 'c1' }),
    ).state
    expect(toolCalls(after)).toMatchObject([
      { id: 'c1', status: 'ok', result: 'first' },
      { id: 'c2', status: 'running' },
    ])
  })

  it('reports the fetched status until a turn is seen to end', () => {
    // A turn that has produced no output yet seeds no streaming message.
    const midTurn = initialTranscript(runningDetail([item('user', { text: 'go' })]))
    expect(midTurn.streaming).toBeNull()
    expect(liveSessionStatus('running', midTurn)).toBe('running')

    const streaming = applyStreamEvent(midTurn, ev(11, 'chunk', { content: 'hi' })).state
    expect(liveSessionStatus('running', streaming)).toBe('running')

    const done = applyStreamEvent(streaming, ev(12, 'done')).state
    expect(liveSessionStatus('running', done)).toBe('idle')

    // Another window starting a turn is not the session going idle.
    const reopened = applyStreamEvent(done, ev(13, 'user_message', { content: 'again' })).state
    expect(liveSessionStatus('running', reopened)).toBe('running')
  })

  it('reads a pending approval as awaiting_approval and leaves live_elsewhere alone', () => {
    const withApproval = applyStreamEvent(
      initialTranscript(runningDetail([item('user', { text: 'rm' })])),
      ev(11, 'approval_request', {
        approval: {
          id: 'ap1',
          kind: 'confirm',
          createdAt: '2026-09-09T00:00:00Z',
          command: 'rm -rf build',
        },
      }),
    ).state
    expect(liveSessionStatus('running', withApproval)).toBe('awaiting_approval')
    expect(liveSessionStatus('live_elsewhere', withApproval)).toBe('live_elsewhere')
  })

  it.each([
    ev(11, 'turn_start', { turnId: 't1' }),
    ev(11, 'user_message', { turnId: 't1', content: 'go' }),
  ])('reads a turn $type opened as running before it says anything', (opener) => {
    const opened = applyStreamEvent(initialTranscript(runningDetail([], 'idle')), opener).state
    expect(opened.streaming).toBeNull()
    expect(turnRunning(opened)).toBe(true)
    expect(liveSessionStatus('idle', opened)).toBe('running')
  })

  it('ends a turn on its done even when it streamed nothing', () => {
    const midTurn = initialTranscript({
      ...runningDetail([item('user', { text: 'go' })]),
      turnStartedAt: '2026-09-22T10:00:00.000Z',
    })
    const done = applyStreamEvent(midTurn, ev(11, 'done')).state
    expect(liveSessionStatus('running', done)).toBe('idle')
  })

  it('leaves the turn alone while another window drives a subagent', () => {
    let state = applyStreamEvent(
      initialTranscript(runningDetail([], 'idle')),
      ev(11, 'turn_start', { turnId: 't1' }),
    ).state
    for (const childEvent of [
      ev(12, 'chunk', { id: 'sub-1', turnId: 'c1', content: 'child reply' }),
      ev(13, 'done', { id: 'sub-1', turnId: 'c1' }),
    ]) {
      state = applyStreamEvent(state, childEvent).state
    }
    expect(turnRunning(state)).toBe(true)
    expect(state.streaming).toBeNull()
    expect(state.cursor).toBe(13)
  })

  it('seeds no turn when a snapshot taken just after its done names none', () => {
    const seeded = initialTranscript({
      status: 'running',
      history: [item('user', { text: 'go' }), item('assistant', { text: 'hi' })],
      lastSeq: 10,
      turnStartedAt: '2026-09-22T10:00:00.000Z',
    })
    expect(seeded.streaming).toBeNull()
    expect(seeded.turnStartedAt).toBeNull()
    expect(liveSessionStatus('running', seeded)).toBe('idle')
  })

  it('seeds a goal between its turns with its last reply finished', () => {
    const between = initialTranscript({
      status: 'running',
      history: [item('user', { text: 'go' }), item('assistant', { text: 'step one' })],
      lastSeq: 10,
      goal: { active: true, checking: true },
    })
    expect(between.streaming).toBeNull()
    // No turn ends to say the check is over; the goal's own state does.
    expect(liveSessionStatus('running', between, { active: true })).toBe('idle')

    let next = applyStreamEvent(between, ev(11, 'turn_start', { turnId: 't2' })).state
    next = applyStreamEvent(next, ev(12, 'chunk', { content: 'step two' })).state
    expect(next.messages.at(-1)?.parts).toEqual([
      expect.objectContaining({ kind: 'text', text: 'step one' }),
    ])
    expect(next.streaming?.parts).toEqual([
      expect.objectContaining({ kind: 'text', text: 'step two' }),
    ])
  })

  it('lists the approvals still waiting, without the answered ones', () => {
    const asked = applyStreamEvent(
      initialTranscript(runningDetail([item('user', { text: 'pick' })])),
      ev(11, 'approval_request', {
        approval: {
          id: 'ask1',
          kind: 'ask',
          createdAt: '2026-09-09T00:00:00Z',
          questions: [{ question: 'Which database?' }],
        },
      }),
    ).state
    expect(pendingApprovals(asked).map((p) => p.approvalKind)).toEqual(['ask'])
    const answered = applyStreamEvent(
      asked,
      ev(12, 'approval_resolved', { approvalId: 'ask1' }),
    ).state
    expect(pendingApprovals(answered)).toEqual([])
  })
})

describe('turn timing', () => {
  const at = (n: number) => `2026-09-22T10:00:${String(n).padStart(2, '0')}.000Z`
  const clock = (n: number) => ({ now: () => at(n) })

  it("takes the fetch's word for when a turn already running began", () => {
    const running = initialTranscript({
      status: 'running',
      history: [item('user', { text: 'go' })],
      turnId: 't0',
      turnStartedAt: at(5),
    })
    expect(running.turnStartedAt).toBe(at(5))

    // A stale timestamp on an idle session dates nothing.
    const idle = initialTranscript({
      status: 'idle',
      history: [item('user', { text: 'go' })],
      turnStartedAt: at(5),
    })
    expect(idle.turnStartedAt).toBeNull()
  })

  it('dates a turn from the message that started it and clears it when the turn ends', () => {
    let state = initialTranscript({ status: 'idle', history: [] })
    state = applyStreamEvent(state, ev(1, 'user_message', { content: 'again' }), clock(10)).state
    expect(state.turnStartedAt).toBe(at(10))

    // The first token keeps the message's time; it does not restart the clock.
    state = applyStreamEvent(state, ev(2, 'chunk', { content: 'hi' }), clock(12)).state
    expect(state.turnStartedAt).toBe(at(10))

    state = applyStreamEvent(state, ev(3, 'done'), clock(20)).state
    expect(state.turnStartedAt).toBeNull()
  })

  it('dates a turn adopted from its first frame when no message announced it', () => {
    const state = applyStreamEvent(
      initialTranscript({ status: 'idle', history: [] }),
      ev(1, 'tool_start', { name: 'Bash', args: '{}' }),
      clock(30),
    ).state
    expect(state.turnStartedAt).toBe(at(30))
  })

  it('leaves a turn undated when the fetch did not know either', () => {
    const state = initialTranscript({
      status: 'running',
      history: [item('user', { text: 'go' })],
      turnId: 't0',
    })
    expect(state.turnStartedAt).toBeNull()
    // A frame mid-turn is not when the turn began.
    const after = applyStreamEvent(state, ev(11, 'chunk', { content: 'hi' }), clock(40)).state
    expect(after.turnStartedAt).toBeNull()

    // The next turn is dated from its own start.
    const done = applyStreamEvent(after, ev(12, 'done'), clock(41)).state
    const next = applyStreamEvent(
      done,
      ev(13, 'tool_start', { name: 'Bash', args: '{}' }),
      clock(50),
    ).state
    expect(next.turnStartedAt).toBe(at(50))
  })
})

describe('a turn waiting for a usage limit to reset', () => {
  const running = () =>
    initialTranscript({
      status: 'running',
      history: [item('user', { text: 'go' })],
      turnId: 't0',
      turnStartedAt: '2026-11-06T18:00:00.000Z',
      lastSeq: 10,
    })
  const wait = (seq: number, waiting: boolean, rest = {}) =>
    ev(seq, 'usage_limit_wait', {
      turnId: 't0',
      content: waiting ? 'Waiting for usage limit reset' : '',
      ...rest,
    })

  it('waits from the frame that says so until the frame that ends the wait', () => {
    let state = applyStreamEvent(running(), wait(11, true)).state
    expect(state.waitingForUsageLimit).toBe(true)
    expect(turnRunning(state)).toBe(true)

    state = applyStreamEvent(state, wait(12, false)).state
    expect(state.waitingForUsageLimit).toBe(false)
    expect(turnRunning(state)).toBe(true)
  })

  it('knows when the wait ends from the frame, until the wait or the turn is over', () => {
    const resumeAt = '2026-11-11T21:43:00Z'
    let state = applyStreamEvent(running(), wait(11, true, { resumeAt })).state
    expect(state.usageLimitResumeAt).toBe(resumeAt)

    state = applyStreamEvent(state, wait(12, false)).state
    expect(state.usageLimitResumeAt).toBeNull()

    state = applyStreamEvent(state, wait(13, true, { resumeAt })).state
    state = applyStreamEvent(state, ev(14, 'done')).state
    expect(state.usageLimitResumeAt).toBeNull()
  })

  it('waits without a time when the daemon gives none', () => {
    const state = applyStreamEvent(running(), wait(11, true)).state
    expect(state.waitingForUsageLimit).toBe(true)
    expect(state.usageLimitResumeAt).toBeNull()
  })

  it('stops waiting when the turn ends, stopped or not', () => {
    for (const end of [
      ev(12, 'done'),
      ev(12, 'error', { content: 'context canceled', interrupted: true }),
    ]) {
      const waiting = applyStreamEvent(running(), wait(11, true)).state
      expect(applyStreamEvent(waiting, end).state.waitingForUsageLimit).toBe(false)
    }
  })

  it("leaves a subagent's wait to the subagent", () => {
    const state = applyStreamEvent(running(), wait(11, true, { id: 'task-1' })).state
    expect(state.waitingForUsageLimit).toBeFalsy()
  })

  it("takes the fetch's word for a turn already waiting, but not an idle one's", () => {
    const resumeAt = '2026-11-11T21:43:00Z'
    const waiting = initialTranscript({
      status: 'running',
      history: [item('user', { text: 'go' })],
      turnId: 't0',
      waitingForUsageLimit: true,
      usageLimitResumeAt: resumeAt,
    })
    expect(waiting.waitingForUsageLimit).toBe(true)
    expect(waiting.usageLimitResumeAt).toBe(resumeAt)
    const idle = initialTranscript({
      status: 'idle',
      history: [item('user', { text: 'go' })],
      waitingForUsageLimit: true,
      usageLimitResumeAt: resumeAt,
    })
    expect(idle.waitingForUsageLimit).toBe(false)
    expect(idle.usageLimitResumeAt).toBeNull()
  })
})

describe('approval mapping', () => {
  const confirm = (extra: Partial<SessionApprovalRequest>) =>
    approvalToPart({
      id: 'ap1',
      kind: 'confirm',
      createdAt: '2026-09-10T00:00:00Z',
      ...extra,
    })

  it('names the tool and words the confirm for what it approves', () => {
    expect(confirm({ tool: 'Bash', command: 'make' })).toMatchObject({
      toolName: 'Bash',
      subject: 'command',
    })
    expect(confirm({ tool: 'NotebookRun', command: 'df.head()' })).toMatchObject({
      toolName: 'NotebookRun',
      subject: 'code',
    })
    expect(
      confirm({
        tool: 'ReadFile',
        command: 'ReadFile /etc/hosts',
        reason: 'file is outside the workspace',
      }),
    ).toMatchObject({ toolName: 'ReadFile', subject: 'path' })
    expect(
      confirm({
        tool: 'mcp__tickets__create',
        command: 'mcp__tickets__create {}',
      }),
    ).toMatchObject({ toolName: 'mcp__tickets__create', subject: 'call' })
  })

  it('infers the subject from the reason when the daemon does not name the tool', () => {
    expect(confirm({ command: 'df.head()', reason: 'code in the notebook kernel' })).toMatchObject({
      subject: 'code',
    })
    const part = confirm({ command: 'rm -rf build' })
    expect(part.subject).toBe('command')
    expect(part.toolName).toBeUndefined()
  })

  it('offers the directory grant only on a file outside the workspace', () => {
    expect(
      confirm({
        tool: 'ReadFile',
        command: 'ReadFile /etc/hosts',
        reason: 'file is outside the workspace',
      }).canAllowDirectory,
    ).toBe(true)
    expect(confirm({ command: 'rm -rf build' }).canAllowDirectory).toBe(false)
    expect(confirm({ tool: 'NotebookRun', command: 'df.head()' }).canAllowDirectory).toBe(false)
    expect(
      approvalToPart({
        id: 'ap1',
        kind: 'ask',
        createdAt: '2026-09-10T00:00:00Z',
      }).canAllowDirectory,
    ).toBe(false)
  })

  it('sends a confirm as allowed plus the directory grant or the deny message', () => {
    expect(approvalAnswerBody({ kind: 'confirm', allowed: true, allowDir: true })).toEqual({
      allowed: true,
      allowDir: true,
    })
    expect(approvalAnswerBody({ kind: 'confirm', allowed: true })).toEqual({
      allowed: true,
    })
    expect(approvalAnswerBody({ kind: 'confirm', allowed: false, allowDir: true })).toEqual({
      allowed: false,
    })
    expect(
      approvalAnswerBody({
        kind: 'confirm',
        allowed: false,
        denyMessage: 'not that one',
      }),
    ).toEqual({ allowed: false, denyMessage: 'not that one' })
  })

  it("maps every question of an ask with its options' previews, and none from a daemon that asks without them", () => {
    const ask = (extra: Partial<SessionApprovalRequest>) =>
      approvalToPart({
        id: 'ap1',
        kind: 'ask',
        createdAt: '2026-09-10T00:00:00Z',
        ...extra,
      })
    const part = ask({
      callId: 'c1',
      questions: [
        {
          question: 'Which db?',
          header: 'Database',
          options: [
            {
              label: 'Postgres',
              description: 'Relational',
              preview: '| id | name |',
            },
          ],
        },
        {
          question: 'Which checks?',
          multiSelect: true,
          options: [{ label: 'Lint' }],
        },
        { question: 'Anything else?', options: null },
      ],
    })
    expect(part.toolCallId).toBe('c1')
    expect(part.questions).toEqual([
      {
        question: 'Which db?',
        header: 'Database',
        options: [
          {
            label: 'Postgres',
            description: 'Relational',
            preview: '| id | name |',
          },
        ],
      },
      {
        question: 'Which checks?',
        multiSelect: true,
        options: [{ label: 'Lint' }],
      },
      { question: 'Anything else?' },
    ])
    expect(ask({}).questions).toEqual([])
  })

  it('sends an ask answer as the picks, text and notes of each question, carrying chat only when set', () => {
    expect(
      approvalAnswerBody({
        kind: 'ask',
        answers: [{ picked: ['B'], notes: 'but bigger' }, {}],
      }),
    ).toEqual({ answers: [{ picked: ['B'], notes: 'but bigger' }, {}] })
    expect(approvalAnswerBody({ kind: 'ask', answers: [{ text: 'hm' }], chat: true })).toEqual({
      answers: [{ text: 'hm' }],
      chat: true,
    })
  })

  it('resolves an approval that has already moved into history', () => {
    const withApproval = applyStreamEvent(
      {
        messages: [],
        streaming: null,
        cursor: 0,
        turnEnded: false,
        queued: [],
        steered: [],
        notes: [],
        turnStartedAt: null,
      },
      ev(1, 'approval_request', {
        approval: {
          id: 'ap1',
          kind: 'confirm',
          createdAt: '2026-09-10T00:00:00Z',
          command: 'ls',
        },
      }),
    ).state
    const finished = applyStreamEvent(withApproval, ev(2, 'done')).state
    expect(finished.streaming).toBeNull()

    const resolved = resolveApprovalEverywhere(finished, 'ap1')
    expect(resolved.messages[0]?.parts?.[0]).toMatchObject({
      kind: 'approval',
      resolved: true,
    })
  })
})

describe('sending a message', () => {
  const empty: TranscriptState = {
    messages: [],
    streaming: null,
    cursor: 10,
    turnEnded: false,
    queued: [],
    steered: [],
    notes: [],
    turnStartedAt: null,
  }

  it('shows the sent message once, dropping the daemon echo of our own turn', () => {
    // The daemon broadcasts user_message to every watcher, including the sender.
    const sent = appendOwnMessage(empty, 'run the tests')
    expect(sent.messages).toHaveLength(1)
    expect(sent.messages[0]).toMatchObject({
      role: 'user',
      content: 'run the tests',
    })

    const afterEcho = applyStreamEvent(
      sent,
      ev(11, 'user_message', { content: 'run the tests', turnId: 't-1' }),
      { ownTurnIds: new Set(['t-1']) },
    ).state
    expect(afterEcho.messages).toHaveLength(1)
  })

  it('still shows a message another window sent', () => {
    const state = applyStreamEvent(
      empty,
      ev(11, 'user_message', { content: 'from the terminal', turnId: 't-2' }),
      { ownTurnIds: new Set(['t-1']) },
    ).state
    expect(state.messages).toHaveLength(1)
    expect(state.messages[0]).toMatchObject({ content: 'from the terminal' })
  })

  it('shows an echo carrying no turn id, since it cannot be attributed', () => {
    const state = applyStreamEvent(empty, ev(11, 'user_message', { content: 'untagged' }), {
      ownTurnIds: new Set(['t-1']),
    }).state
    expect(state.messages).toHaveLength(1)
  })

  it('shows a ! run the page made, with no output block when it printed nothing', () => {
    const state = appendShellRun(empty, 'touch a', '\n')
    expect(state.messages).toHaveLength(1)
    expect(state.messages[0]).toMatchObject({
      role: 'assistant',
      parts: [{ kind: 'notice', text: '! touch a' }],
    })
    expect(state.messages[0]?.parts?.[0]).not.toHaveProperty('detail')
  })
})

describe('resumeCursor', () => {
  // The daemon stamps an event before the agent records it, so a prompt sent
  // with `create` is in neither the seeded history nor a replay past lastSeq.
  it('resumes from the start when the seeded history is empty', () => {
    expect(resumeCursor({ history: [], lastSeq: 1789420264286084 } as never)).toBe(0)
    expect(resumeCursor({ lastSeq: 42 } as never)).toBe(0)
  })

  it('resumes past what it seeded when there is history', () => {
    expect(
      resumeCursor({
        history: [{ kind: 'user', text: 'hi' }],
        lastSeq: 99,
      } as never),
    ).toBe(99)
  })
})

describe('sending while a turn runs', () => {
  it('queues the message behind the live turn instead of closing it', () => {
    let state: TranscriptState = {
      messages: [],
      streaming: null,
      cursor: 0,
      turnEnded: false,
      queued: [],
      steered: [],
      notes: [],
      turnStartedAt: null,
    }
    state = applyStreamEvent(state, ev(1, 'tool_start', { name: 'Task', args: '{}' })).state
    const sent = appendOwnMessage(state, 'continue', 'own-1')
    expect(toolCalls(sent).map((p) => p.status)).toEqual(['running'])
    expect(sent.streaming).toBe(state.streaming)
    expect(sent.queued.map((m) => m.content)).toEqual(['continue'])
    expect(sent.messages).toHaveLength(0)

    const refused = dropMessage(sent, 'own-1')
    expect(refused.queued).toHaveLength(0)

    // Still waiting when the live turn ends: it joins when its own turn starts.
    const ended = applyStreamEvent(sent, ev(2, 'done', {})).state
    expect(ended.streaming).toBeNull()
    expect(ended.queued.map((m) => m.content)).toEqual(['continue'])
    expect(ended.messages.map((m) => m.role)).toEqual(['assistant'])

    const started = applyStreamEvent(
      ended,
      ev(3, 'user_message', { content: 'continue', turnId: 't2' }),
      { ownTurnIds: new Set(['t2']) },
    ).state
    expect(started.queued).toHaveLength(0)
    expect(started.messages.map((m) => m.id)).toEqual([ended.messages[0]?.id, 'own-1'])
  })
})

describe('a message sent while nothing runs', () => {
  const idle: TranscriptState = {
    messages: [],
    streaming: null,
    cursor: 0,
    turnEnded: true,
    queued: [],
    steered: [],
    notes: [],
    turnStartedAt: null,
  }

  it('runs its turn from the send, through the echo, to the turn end', () => {
    let state = appendOwnMessage(idle, 'go', 'own-1')
    expect(turnRunning(state)).toBe(true)
    expect(liveSessionStatus('idle', state)).toBe('running')

    state = applyStreamEvent(state, ev(1, 'user_message', { content: 'go', turnId: 't1' }), {
      echoOf: 'own-1',
    }).state
    expect(turnRunning(state)).toBe(true)

    state = applyStreamEvent(state, ev(2, 'done', { turnId: 't1' })).state
    expect(turnRunning(state)).toBe(false)
  })

  it('leaves nothing running when the machine refuses it', () => {
    const refused = dropMessage(appendOwnMessage(idle, 'go', 'own-1'), 'own-1')
    expect(refused.messages).toHaveLength(0)
    expect(turnRunning(refused)).toBe(false)
    expect(liveSessionStatus('running', refused)).toBe('idle')
  })

  it('leaves the turn it queued behind running when it is taken back', () => {
    const queued = markQueued(appendOwnMessage(idle, 'go', 'own-1'), 'own-1')
    const withdrawn = dropMessage(queued, 'own-1')
    expect(withdrawn.queued).toHaveLength(0)
    expect(turnRunning(withdrawn)).toBe(true)
  })
})

describe('messages sent while a turn runs', () => {
  const idle: TranscriptState = {
    messages: [],
    streaming: null,
    cursor: 0,
    turnEnded: false,
    queued: [],
    steered: [],
    notes: [],
    turnStartedAt: null,
  }
  const run = (state: TranscriptState, events: SessionStreamEvent[]) =>
    events.reduce(
      (s, e) => applyStreamEvent(s, e, { ownTurnIds: new Set(['t2', 't3']) }).state,
      state,
    )
  const transcriptText = (state: TranscriptState) =>
    state.messages.map((m) =>
      m.role === 'user'
        ? `user:${m.content}`
        : `assistant:${(m.parts ?? []).map((p) => ('text' in p ? p.text : p.kind)).join('')}`,
    )

  it('keeps queued turns waiting, in order, until each one starts', () => {
    let state = run(idle, [ev(1, 'chunk', { content: 'one' })])
    state = appendOwnMessage(state, 'second', 'own-2')
    state = appendOwnMessage(state, 'third', 'own-3')
    state = run(state, [
      ev(2, 'done'),
      ev(3, 'user_message', { content: 'second', turnId: 't2' }),
      ev(4, 'chunk', { content: 'two' }),
      ev(5, 'done'),
    ])
    expect(transcriptText(state)).toEqual(['assistant:one', 'user:second', 'assistant:two'])
    expect(state.queued.map((m) => m.content)).toEqual(['third'])

    state = run(state, [ev(6, 'user_message', { content: 'third', turnId: 't3' })])
    expect(transcriptText(state).at(-1)).toBe('user:third')
    expect(state.queued).toHaveLength(0)
  })

  it('forgets queued turns the daemon discarded on an interrupt', () => {
    let state = run(idle, [ev(1, 'chunk', { content: 'one' })])
    state = appendOwnMessage(state, 'second', 'own-2')
    state = run(state, [
      ev(2, 'notice', {
        content: 'interrupted: discarded 1 queued message(s)',
      }),
      ev(3, 'error', { content: 'stream error: context canceled' }),
    ])
    expect(state.queued).toHaveLength(0)
    expect(state.messages.some((m) => m.content === 'second')).toBe(false)
  })

  it('places a steered message where the model next speaks after reading it', () => {
    let state = run(idle, [ev(1, 'tool_start', { name: 'Bash', args: '{}' })])
    state = appendSteeredMessage(state, 'also run the tests', 'own-1')
    expect(pendingMessages(state).map((m) => m.id)).toEqual(['own-1'])

    state = run(state, [
      ev(2, 'tool_end', { name: 'Bash', result: 'ok' }),
      ev(3, 'user_note', { content: 'also run the tests' }),
    ])
    expect(state.steered).toHaveLength(0)
    expect(state.notes.map((m) => m.id)).toEqual(['own-1'])
    expect(state.messages).toHaveLength(0)
    expect(turnRunning(state)).toBe(true)

    state = run(state, [ev(4, 'chunk', { content: 'running them' })])
    expect(state.messages.map((m) => m.role)).toEqual(['assistant', 'user'])
    expect(state.messages[1]?.id).toBe('own-1')
    expect(state.streaming?.parts).toEqual([{ kind: 'text', text: 'running them' }])
    expect(pendingMessages(state)).toHaveLength(0)
  })

  it('keeps a note pending, and the turn running, past a tool the transcript hides', () => {
    let state = run(idle, [ev(1, 'chunk', { content: 'working' })])
    state = appendSteeredMessage(state, 'and the docs', 'own-1')
    state = run(state, [
      ev(2, 'user_note', { content: 'and the docs' }),
      ev(3, 'tool_start', { name: 'TodoWrite', args: '{}' }),
    ])
    expect(turnRunning(state)).toBe(true)
    expect(state.notes.map((m) => m.id)).toEqual(['own-1'])

    state = run(state, [ev(4, 'chunk', { content: 'on it' })])
    expect(transcriptText(state)).toEqual(['assistant:working', 'user:and the docs'])
  })

  it('places a queued message by the send it echoes, not the text echoed', () => {
    let state = run(idle, [ev(1, 'chunk', { content: 'one' })])
    state = appendOwnMessage(state, '/mcp__docs__search go', 'own-2')
    state = run(state, [ev(2, 'done')])
    state = applyStreamEvent(
      state,
      ev(3, 'user_message', {
        content: 'Search the docs for go',
        turnId: 't2',
      }),
      { ownTurnIds: new Set(['t2']), echoOf: 'own-2' },
    ).state
    expect(state.queued).toHaveLength(0)
    expect(state.messages.map((m) => m.id).at(-1)).toBe('own-2')
  })

  it('places a note taken during the final answer after that answer', () => {
    const state = run(idle, [
      ev(1, 'chunk', { content: 'first' }),
      // Typed in the terminal, so there is no steered copy here.
      ev(2, 'user_note', { content: 'and the docs' }),
      ev(3, 'chunk', { content: 'got it' }),
      ev(4, 'done'),
    ])
    expect(transcriptText(state)).toEqual([
      'assistant:first',
      'user:and the docs',
      'assistant:got it',
    ])
  })

  it('places steered text a daemon never reported once the turn ends cleanly', () => {
    let state = run(idle, [ev(1, 'chunk', { content: 'working' })])
    state = appendSteeredMessage(state, 'also the docs', 'own-1')
    const stopped = run(state, [ev(2, 'error', { content: 'stream error: context canceled' })])
    expect(stopped.steered.map((m) => m.id)).toEqual(['own-1'])
    const done = run(state, [ev(2, 'done')])
    expect(transcriptText(done)).toEqual(['assistant:working', 'user:also the docs'])
    expect(done.steered).toHaveLength(0)
  })

  it('counts a turn that has been handed a note as running before it replies', () => {
    const handed = run(idle, [
      ev(1, 'user_message', { content: 'go' }),
      ev(2, 'user_note', { content: 'left over from last turn' }),
    ])
    expect(handed.streaming).toBeNull()
    expect(turnRunning(handed)).toBe(true)
    expect(liveSessionStatus('idle', handed)).toBe('running')
    const done = run(handed, [ev(3, 'done')])
    expect(transcriptText(done)).toEqual(['user:go', 'user:left over from last turn'])
    expect(turnRunning(done)).toBe(false)
  })

  it('offers the background only while a Bash call runs', () => {
    const reading = run(idle, [ev(1, 'tool_start', { name: 'Read' })])
    expect(bashRunning(reading)).toBe(false)
    const both = run(reading, [ev(2, 'tool_start', { name: 'Bash', args: '{"command":"make"}' })])
    expect(bashRunning(both)).toBe(true)
    const moved = run(both, [
      ev(3, 'tool_end', {
        name: 'Bash',
        result: 'Command was moved to the background by the user',
      }),
    ])
    expect(bashRunning(moved)).toBe(false)
    expect(bashRunning(null)).toBe(false)
  })
})

describe('goal events', () => {
  const idle: TranscriptState = {
    messages: [],
    streaming: null,
    cursor: 0,
    turnEnded: true,
    queued: [],
    steered: [],
    notes: [],
    turnStartedAt: null,
  }

  it('reads a goal check as running until the model answers, even once the goal is paused', () => {
    expect(liveSessionStatus('idle', idle, { active: true, checking: true })).toBe('running')
    expect(liveSessionStatus('idle', idle, { paused: true, checking: true })).toBe('running')
    expect(liveSessionStatus('idle', idle, { active: true })).toBe('idle')
  })

  it('files a step between turns on its own, without opening a turn', () => {
    const { state } = applyStreamEvent(
      idle,
      ev(1, 'goal', {
        goalProgress: {
          outcome: 'achieved',
          turns: 2,
          elapsedMs: 90_000,
          tokens: 512,
        },
      }),
      { goalNotice },
    )
    expect(state.streaming).toBeNull()
    expect(state.messages.at(-1)?.parts).toEqual([{ kind: 'notice', text: 'achieved after 2' }])
    expect(liveSessionStatus('idle', state)).toBe('idle')
  })

  it('adds a step to the turn it arrives in, and ignores a quiet stop', () => {
    let state = applyStreamEvent(idle, ev(1, 'chunk', { content: 'working' })).state
    state = applyStreamEvent(state, ev(2, 'goal', { goalProgress: { turns: 1 } }), {
      goalNotice,
    }).state
    expect(state.streaming?.parts?.at(-1)).toEqual({
      kind: 'notice',
      text: 'continuing after 1',
    })
    const quiet = applyStreamEvent(state, ev(3, 'goal', { goalProgress: { outcome: 'stopped' } }), {
      goalNotice,
    }).state
    expect(quiet.streaming?.parts).toEqual(state.streaming?.parts)
  })
})

describe('terminal parity', () => {
  const empty: TranscriptState = {
    messages: [],
    streaming: null,
    cursor: 10,
    turnEnded: true,
    queued: [],
    steered: [],
    notes: [],
    turnStartedAt: null,
  }
  const run = (events: SessionStreamEvent[], from = empty, options = {}) =>
    events.reduce((s, e) => applyStreamEvent(s, e, options).state, from)
  const words: TranscriptWords = {
    goalDetail: (p) => `Goal: ${p.condition}\n\nReason: ${p.reason}`,
    turnEnd: (te, verb, waiting) =>
      waiting
        ? `Waiting for ${te.pendingAgents} background agents`
        : `${verb} for ${te.durationMs}ms`,
    planAnswer: (path, opened) => (opened ? `Opened ${path}` : path),
    deliveryLine: (n) =>
      `${n.interim ? 'message' : n.failed ? 'failed' : 'done'}: ${n.description}`,
  }
  const notice = (state: TranscriptState) =>
    [...state.messages, ...(state.streaming ? [state.streaming] : [])]
      .flatMap((m) => m.parts ?? [])
      .filter((p) => p.kind === 'notice')

  it('keeps a subagent running through a message it sends, and shows the message', () => {
    const state = run([
      ev(11, 'subagent_start', {
        id: 'task-1',
        name: 'Map routes',
        background: true,
      }),
      ev(12, 'subagent_delivered', {
        id: 'task-1',
        notice: '[Message from subagent task-1 (Map routes) — it is still working]\nHalf way.',
      }),
    ])
    const parts = state.streaming?.parts ?? []
    expect(parts.find((p) => p.kind === 'subagent')).toMatchObject({
      status: 'running',
    })
    expect(parts.find((p) => p.kind === 'notice')).toMatchObject({
      detail: 'Half way.',
    })
  })

  it('keeps a failed subagent failed when its report arrives', () => {
    const state = run([
      ev(11, 'subagent_start', {
        id: 'task-2',
        name: 'Audit',
        background: true,
      }),
      ev(12, 'subagent_end', {
        id: 'task-2',
        isError: true,
        result: 'no access',
      }),
      ev(13, 'subagent_delivered', {
        id: 'task-2',
        notice: '[Background subagent task-2 (Audit) failed after 41s]\nError: no access',
      }),
    ])
    expect(state.streaming?.parts?.find((p) => p.kind === 'subagent')).toMatchObject({
      status: 'failed',
    })
  })

  it('ends a subagent on its card when its end comes after the turn closed, without opening a turn', () => {
    const state = run([
      ev(11, 'subagent_start', {
        id: 'task-3',
        name: 'Sweep',
        background: true,
      }),
      ev(12, 'done'),
      ev(13, 'subagent_action', { id: 'task-3', content: 'Read a.go' }),
      ev(14, 'subagent_end', { id: 'task-3', result: '2 tool uses' }),
    ])
    expect(state.streaming).toBeNull()
    expect(state.messages.at(-1)?.parts).toMatchObject([
      {
        kind: 'subagent',
        status: 'done',
        actions: ['Read a.go'],
        summary: '2 tool uses',
      },
    ])
  })

  it('keeps one card for a subagent moved to the background', () => {
    const state = run([
      ev(11, 'subagent_start', { id: 'task-4', name: 'Profile' }),
      ev(12, 'subagent_start', {
        id: 'task-4',
        name: 'Profile',
        background: true,
      }),
    ])
    expect(state.streaming?.parts?.filter((p) => p.kind === 'subagent')).toHaveLength(1)
  })

  it('reads a call a stop cut off the way its record replays', () => {
    const live = run([
      ev(11, 'tool_start', {
        name: 'Bash',
        args: '{"command":"sleep 9"}',
        callId: 'c1',
      }),
      ev(12, 'error', { interrupted: true }),
    ])
    const [replayed] = historyToMessages([
      item('tool_call', {
        toolName: 'Bash',
        toolArgs: '{"command":"sleep 9"}',
        callId: 'c1',
      }),
      item('tool_result', {
        text: 'The user interrupted Bash before it finished.',
      }),
    ])
    const liveCall = live.messages.at(-1)?.parts?.find((p) => p.kind === 'tool_call')
    expect(liveCall).toMatchObject({
      status: 'ok',
      result: 'The user interrupted Bash before it finished.',
    })
    expect(replayed?.parts?.[0]).toMatchObject({
      status: liveCall?.status,
      result: liveCall?.result,
    })
  })

  it('replaces a call’s arguments a hook rewrote, so an edit keeps its diff', () => {
    const state = run([
      ev(11, 'tool_start', {
        name: 'EditFile',
        args: '{"path":"a.go","old_string":"a","new_string":"b"}',
      }),
      ev(12, 'tool_update', {
        name: 'EditFile',
        args: '{"path":"a.go","old_string":"a","new_string":"c"}',
      }),
    ])
    const call = state.streaming?.parts?.[0]
    expect(call?.kind === 'tool_call' && JSON.parse(call.args)).toEqual({
      path: 'a.go',
      old_string: 'a',
      new_string: 'c',
    })
  })

  it('draws the todo list TodoWrite carries, live and replayed, and nothing for an empty one', () => {
    const args = JSON.stringify({
      todos: [
        { content: 'Write the test', status: 'completed' },
        {
          content: 'Fix the bug',
          status: 'in_progress',
          activeForm: 'Fixing the bug',
        },
        { content: 'bogus', status: 'later' },
      ],
    })
    const expected = [
      { content: 'Write the test', status: 'completed' },
      {
        content: 'Fix the bug',
        status: 'in_progress',
        activeForm: 'Fixing the bug',
      },
    ]
    const live = run([ev(11, 'tool_start', { name: 'TodoWrite', args })])
    expect(live.streaming?.parts).toEqual([{ kind: 'todo_snapshot', todos: expected }])
    const [replayed] = historyToMessages([
      item('tool_call', { toolName: 'TodoWrite', toolArgs: args }),
      item('tool_result', { text: 'ok' }),
    ])
    expect(replayed?.parts).toEqual([{ kind: 'todo_snapshot', todos: expected }])
    expect(
      run([ev(11, 'tool_start', { name: 'TodoWrite', args: '{"todos":[]}' })]).streaming,
    ).toBeNull()
  })

  it('trims the blank lines a notice comes wrapped in, live and replayed', () => {
    expect(notice(run([ev(11, 'notice', { content: '\nhook said hi\n\n' })]))).toEqual([
      { kind: 'notice', text: 'hook said hi' },
    ])
    expect(historyToMessages([item('notice', { text: '\nhook said hi\n' })])[0]?.parts).toEqual([
      { kind: 'notice', text: 'hook said hi' },
    ])
  })

  it('opens a continuing goal step to its goal and why, live and replayed', () => {
    const progress = {
      outcome: 'continuing',
      turns: 2,
      condition: 'tests pass',
      reason: 'one fails',
    }
    const goalNotice: GoalNotice = () => 'Goal not yet met… continuing'
    const live = run([ev(11, 'goal', { goalProgress: progress })], empty, {
      goalNotice,
      words,
    })
    const [replayed] = historyToMessages(
      [item('goal_progress', { text: JSON.stringify(progress) })],
      { goalNotice, words },
    )
    const detail = 'Goal: tests pass\n\nReason: one fails'
    expect(notice(live)).toEqual([{ kind: 'notice', text: 'Goal not yet met… continuing', detail }])
    expect(replayed?.parts).toEqual([
      { kind: 'notice', text: 'Goal not yet met… continuing', detail },
    ])
    const achieved = run(
      [ev(11, 'goal', { goalProgress: { ...progress, outcome: 'achieved' } })],
      empty,
      {
        goalNotice,
        words,
      },
    )
    expect(notice(achieved)[0]).not.toHaveProperty('detail')
  })

  it('picks the verb the terminal does for a finished turn', () => {
    // From Go's own formatting and hash of the same times.
    expect(turnVerb('2026-11-11T15:04:05.123456789-06:00')).toBe('churned')
    expect(turnVerb('2026-11-11T21:04:05Z')).toBe('brewed')
    expect(turnVerb('2026-01-02T03:04:05.5+05:30')).toBe('worked')
    expect(turnVerb('2026-11-11T15:04:05.12-06:00')).toBe('baked')
  })

  it('ends a turn nobody stopped with its line, live and replayed', () => {
    const turnEnd = { durationMs: 125_000, endedAt: '2026-11-11T21:04:05Z' }
    const live = run([ev(11, 'chunk', { content: 'done' }), ev(12, 'done', { turnEnd })], empty, {
      words,
    })
    expect(live.messages.at(-1)?.parts?.at(-1)).toEqual({
      kind: 'notice',
      text: 'brewed for 125000ms',
    })
    const [replayed] = historyToMessages(
      [item('assistant', { text: 'done' }), item('turn_end', { turnEnd })],
      { words },
    )
    expect(replayed?.parts?.at(-1)).toEqual({
      kind: 'notice',
      text: 'brewed for 125000ms',
    })
  })

  it('reads a turn left waiting on background agents as waiting until a later turn ends with none', () => {
    const waiting = {
      durationMs: 1000,
      endedAt: '2026-11-11T21:04:05Z',
      pendingAgents: 2,
    }
    const done = { durationMs: 1000, endedAt: '2026-11-11T21:09:05Z' }
    const lines = (history: SessionHistoryItem[]) =>
      historyToMessages(history, { words }).flatMap((m) =>
        (m.parts ?? []).map((p) => p.kind === 'notice' && p.text),
      )
    expect(lines([item('turn_end', { turnEnd: waiting })])).toEqual([
      'Waiting for 2 background agents',
    ])
    expect(
      lines([item('turn_end', { turnEnd: waiting }), item('turn_end', { turnEnd: done })]),
    ).toEqual(['brewed for 1000ms', expect.stringMatching(/ for 1000ms$/)])
  })

  it('numbers a replayed edit’s diff from the line its record names, as live does', () => {
    const [replayed] = historyToMessages([
      item('tool_call', {
        toolName: 'EditFile',
        toolArgs: '{"path":"a.go"}',
        startLine: 31,
      }),
      item('tool_result', { text: 'ok' }),
    ])
    expect(replayed?.parts?.[0]).toMatchObject({
      kind: 'tool_call',
      startLine: 31,
    })
  })
})

describe('turn ends', () => {
  const turnEnd = { durationMs: 94_000, endedAt: '2026-11-06T23:18:00Z' }

  it('records where the feed last ended a main turn with its line', () => {
    let state = initialTranscript({
      status: 'idle',
      history: [item('assistant', { text: 'Done.' }), item('turn_end')],
      lastSeq: 2,
    })
    expect(state.turnEndSeq).toBeUndefined()
    state = applyStreamEvent(state, ev(3, 'chunk', { content: 'Stopping.' })).state
    state = applyStreamEvent(state, ev(4, 'done')).state
    expect(state.turnEndSeq).toBeUndefined()
    state = applyStreamEvent(state, ev(5, 'chunk', { content: 'Done.' })).state
    state = applyStreamEvent(state, ev(6, 'done', { turnEnd })).state
    expect(state.turnEndSeq).toBe(6)
    state = applyStreamEvent(state, ev(7, 'notice', { content: 'saved' })).state
    expect(state.turnEndSeq).toBe(6)
    expect(applyStreamEvent(state, ev(6, 'done', { turnEnd })).state.turnEndSeq).toBe(6)
  })
})

describe('what the transcript UI draws', () => {
  const empty: TranscriptState = {
    messages: [],
    streaming: null,
    cursor: 10,
    turnEnded: true,
    queued: [],
    steered: [],
    notes: [],
    turnStartedAt: null,
  }
  const run = (
    events: SessionStreamEvent[],
    options: Parameters<typeof applyStreamEvent>[2] = {},
  ) => events.reduce((s, e) => applyStreamEvent(s, e, options).state, empty)
  const words: TranscriptWords = {
    goalDetail: () => null,
    turnEnd: () => '',
    planAnswer: (path, opened) => (opened ? `Opened ${path}` : path),
    deliveryLine: (n) => `${n.failed ? 'failed' : 'done'}: ${n.description}`,
  }
  const png = { mime: 'image/png', data: 'AAAA' }

  it('shows the pictures a call returned, live and replayed', () => {
    const live = run([
      ev(11, 'tool_start', { name: 'ReadFile', args: '{"path":"a.png"}' }),
      ev(12, 'images', { images: [png] }),
    ])
    expect(live.streaming?.parts?.at(-1)).toMatchObject({
      kind: 'image',
      images: [{ previewUrl: 'data:image/png;base64,AAAA' }],
    })
    const [replayed] = historyToMessages([
      item('tool_call', { toolName: 'ReadFile', toolArgs: '{"path":"a.png"}' }),
      item('tool_result', { text: 'Read image', images: [png] }),
    ])
    expect(replayed?.parts?.map((p) => p.kind)).toEqual(['tool_call', 'image'])
  })

  it('keeps an edit to the plan file behind its row, as the terminal folds it', () => {
    const plan = '{"path":"plans/rollout.md","old_string":"a","new_string":"b"}'
    const live = run([ev(11, 'tool_start', { name: 'EditFile', args: plan, callId: 'c1' })])
    expect(live.streaming?.parts?.[0]).toMatchObject({ foldDiff: true })
    const [replayed] = historyToMessages([
      item('tool_call', {
        toolName: 'WriteFile',
        toolArgs: '{"path":"PLAN.md"}',
      }),
      item('tool_call', {
        toolName: 'EditFile',
        toolArgs: '{"path":"src/a.md"}',
      }),
    ])
    expect(replayed?.parts?.[0]).toMatchObject({ foldDiff: true })
    expect(replayed?.parts?.[1]).not.toHaveProperty('foldDiff')
  })

  it('marks arguments a hook rewrote', () => {
    const state = run([
      ev(11, 'tool_start', {
        name: 'Bash',
        args: '{"command":"rm"}',
        callId: 'c1',
      }),
      ev(12, 'tool_update', {
        name: 'Bash',
        args: '{"command":"ls"}',
        callId: 'c1',
      }),
    ])
    expect(state.streaming?.parts?.[0]).toMatchObject({
      args: '{"command":"ls"}',
      argsRewritten: true,
    })
  })

  it('names what a decision was on', () => {
    const decision = {
      callId: 'c1',
      by: 'auto-reviewer' as const,
      status: 'approved' as const,
      at: '2026-11-11T12:00:00Z',
      action: 'ls /scratch',
    }
    const state = run([
      ev(11, 'tool_start', { name: 'Bash', args: '{}', callId: 'c1' }),
      ev(12, 'decision', { decision }),
    ])
    expect(state.streaming?.parts?.[0]).toMatchObject({
      decision: { action: 'ls /scratch' },
    })
  })

  it('counts the reviews under way in the main conversation until each is decided or the turn ends', () => {
    const review = (seq: number, callId: string, status: 'reviewing' | 'approved') =>
      ev(seq, 'decision', {
        decision: {
          callId,
          by: 'auto-reviewer',
          status,
          at: '2026-11-11T12:00:00Z',
        },
      })
    let state = run([
      ev(11, 'chunk', { content: 'working' }),
      review(12, 'c1', 'reviewing'),
      review(13, 'c2', 'reviewing'),
    ])
    expect(reviewingCount(state)).toBe(2)
    state = applyStreamEvent(state, review(14, 'c1', 'approved')).state
    expect(reviewingCount(state)).toBe(1)
    state = applyStreamEvent(state, ev(15, 'done')).state
    expect(reviewingCount(state)).toBe(0)
  })

  it('shows a subagent’s reviews on its card, and ignores a review start that comes after its verdict', () => {
    const review = (seq: number, callId: string, status: 'reviewing' | 'denied') =>
      ev(seq, 'subagent_decision', {
        id: 'task-1',
        decision: {
          callId,
          by: 'auto-reviewer',
          status,
          at: '2026-11-11T12:00:00Z',
        },
      })
    let state = run([
      ev(11, 'subagent_start', { id: 'task-1', name: 'Audit' }),
      review(12, 'c1', 'reviewing'),
    ])
    expect(state.streaming?.parts?.[0]).toMatchObject({ reviewing: 1 })
    state = applyStreamEvent(state, review(13, 'c2', 'denied')).state
    state = applyStreamEvent(state, review(14, 'c2', 'reviewing')).state
    expect(state.streaming?.parts?.[0]).toMatchObject({ reviewing: 1 })
    state = applyStreamEvent(state, review(15, 'c1', 'denied')).state
    expect(state.streaming?.parts?.[0]).toMatchObject({ reviewing: 0 })
  })

  it('says a stop cut a subagent off', () => {
    const state = run([
      ev(11, 'subagent_start', { id: 'task-1', name: 'Audit' }),
      ev(12, 'subagent_end', {
        id: 'task-1',
        isError: true,
        interrupted: true,
        result: '3 tool uses',
      }),
    ])
    expect(state.streaming?.parts?.[0]).toMatchObject({
      status: 'failed',
      interrupted: true,
    })
  })

  it('replays a background launch as a launch, not as a finished child', () => {
    const [replayed] = historyToMessages([
      item('tool_call', {
        toolName: 'Task',
        toolArgs: '{"description":"Audit"}',
      }),
      item('tool_result', {
        text: 'Started background subagent task-1 (Audit).',
      }),
    ])
    const part = replayed?.parts?.[0]
    expect(part).toMatchObject({
      kind: 'subagent',
      status: 'running',
      background: true,
    })
    expect(part).not.toHaveProperty('summary')
  })

  it('words a background report in the reader’s language, live and replayed', () => {
    const notice = '[Background subagent task-1 (Audit) failed after 41s]\nNo access.'
    const live = run(
      [
        ev(11, 'subagent_start', {
          id: 'task-1',
          name: 'Audit',
          background: true,
        }),
        ev(12, 'subagent_delivered', { id: 'task-1', notice }),
      ],
      { words },
    )
    expect(live.streaming?.parts?.at(-1)).toEqual({
      kind: 'notice',
      text: 'failed: Audit',
      detail: 'No access.',
    })
    const [replayed] = historyToMessages([item('notice', { text: notice })], {
      words,
    })
    expect(replayed?.parts).toEqual([
      { kind: 'notice', text: 'failed: Audit', detail: 'No access.' },
    ])
  })

  it('says a /plan open put the plan in an editor', () => {
    const [opened] = historyToMessages(
      [item('plan_view', { toolName: '/plan open', text: 'plans/a.md' })],
      { words },
    )
    expect(opened?.commandAnswer).toEqual({ text: 'Opened plans/a.md' })
  })
})

describe('recap events', () => {
  it('shows a recap written after the turn ended, without opening a turn', () => {
    let state = applyStreamEvent(
      initialTranscript({ status: 'idle', history: [], lastSeq: 0 }),
      ev(1, 'chunk', { content: 'Done.' }),
    ).state
    state = applyStreamEvent(state, ev(2, 'done')).state
    state = applyStreamEvent(
      state,
      ev(3, 'recap', { content: 'Adding a session recap; next, run tests.' }),
      { recapNotice },
    ).state
    expect(state.streaming).toBeNull()
    expect(state.messages.map((m) => m.parts)).toEqual([
      [{ kind: 'text', text: 'Done.' }],
      [
        {
          kind: 'notice',
          text: 'Recap: Adding a session recap; next, run tests.',
        },
      ],
    ])
    expect(state.cursor).toBe(3)
    expect(liveSessionStatus('idle', state)).toBe('idle')
  })
})

describe('session notices', () => {
  const idleState = () => initialTranscript({ status: 'idle', history: [], lastSeq: 0 })

  it('shows a change made between turns without opening a turn', () => {
    const state = applyStreamEvent(
      idleState(),
      ev(1, 'notice', { content: 'Model: o:p/next', recorded: true }),
    ).state
    expect(state.streaming).toBeNull()
    expect(state.messages.map((m) => m.parts)).toEqual([
      [{ kind: 'notice', text: 'Model: o:p/next' }],
    ])
    expect(liveSessionStatus('idle', state)).toBe('idle')
  })

  it('puts a change made mid-reply above the reply, where the session files it', () => {
    let state = applyStreamEvent(
      idleState(),
      ev(1, 'tool_start', { name: 'Bash', args: '{}' }),
    ).state
    state = applyStreamEvent(state, ev(2, 'tool_end', { name: 'Bash', result: 'ok' })).state
    state = applyStreamEvent(state, ev(3, 'chunk', { content: 'Reading the parser.' })).state
    state = applyStreamEvent(
      state,
      ev(4, 'notice', {
        content: 'Model: o:p/next (applies after this turn)',
        recorded: true,
      }),
    ).state
    expect(state.streaming?.parts?.map((p) => p.kind)).toEqual(['tool_call', 'notice', 'text'])
  })

  it('places a warning the session filed above the reply, as a warning', () => {
    let state = applyStreamEvent(
      idleState(),
      ev(1, 'chunk', { content: 'Reading the parser.' }),
    ).state
    state = applyStreamEvent(
      state,
      ev(2, 'warning', { content: 'mcp tracker: refused', recorded: true }),
    ).state
    expect(state.streaming?.parts).toEqual([
      { kind: 'warning', text: 'mcp tracker: refused' },
      expect.objectContaining({ kind: 'text' }),
    ])
  })

  it("keeps a turn's own notice where the turn showed it", () => {
    let state = applyStreamEvent(
      idleState(),
      ev(1, 'chunk', { content: 'Partial answer', turnId: 't1' }),
    ).state
    state = applyStreamEvent(
      state,
      ev(2, 'notice', {
        content: '\n*Response interrupted.*\n',
        recorded: true,
        turnId: 't1',
      }),
    ).state
    expect(state.streaming?.parts?.map((p) => p.kind)).toEqual(['text', 'notice'])
  })

  it('reads a filed warning back from the history as a warning', () => {
    expect(
      historyToMessages([
        item('user', { text: 'hi' }),
        item('warning', { text: 'hooks: bad matcher' }),
      ]).at(-1)?.parts,
    ).toEqual([{ kind: 'warning', text: 'hooks: bad matcher' }])
  })
})

describe('a cleared session', () => {
  const fresh: TranscriptState = {
    messages: [],
    streaming: null,
    cursor: 0,
    turnEnded: true,
    queued: [],
    steered: [],
    notes: [],
    turnStartedAt: null,
  }

  it('drops the conversation it replaced, replayed ahead of the frame naming it', () => {
    const opts = { sessionId: 'new' }
    let state = fresh
    for (const e of [
      ev(1, 'user_message', { content: 'old prompt' }),
      ev(2, 'chunk', { content: 'old reply' }),
      ev(3, 'done'),
    ]) {
      state = applyStreamEvent(state, e, opts).state
    }
    const cleared = applyStreamEvent(state, ev(4, 'cleared', { newId: 'new' }), opts)
    expect(cleared.state.messages).toEqual([])
    expect(cleared.state.cursor).toBe(4)
    expect(cleared.effects).toEqual([])

    const next = applyStreamEvent(cleared.state, ev(5, 'user_message', { content: 'hi' }), opts)
    expect(next.state.messages.map((m) => m.content)).toEqual(['hi'])
  })

  it('still follows a clear that moves the page to another session', () => {
    const { effects } = applyStreamEvent(fresh, ev(1, 'cleared', { newId: 'other' }), {
      sessionId: 'old',
    })
    expect(effects).toEqual([{ type: 'cleared', newId: 'other' }])
  })
})

describe('replayed clears', () => {
  it('does not follow a clear that predates the session on screen', () => {
    const seeded: TranscriptState = {
      messages: [],
      streaming: null,
      cursor: 0,
      turnEnded: true,
      queued: [],
      steered: [],
      notes: [],
      turnStartedAt: null,
      seededSeq: 40,
    }
    const opts = { sessionId: 'third' }
    // Replayed: the clear into the second session, then the clear into this one.
    const older = applyStreamEvent(seeded, ev(10, 'cleared', { newId: 'second' }), opts)
    expect(older.effects).toEqual([])
    const own = applyStreamEvent(older.state, ev(30, 'cleared', { newId: 'third' }), opts)
    expect(own.effects).toEqual([])
    // A clear after the page loaded still moves it along.
    const later = applyStreamEvent(own.state, ev(41, 'cleared', { newId: 'fourth' }), opts)
    expect(later.effects).toEqual([{ type: 'cleared', newId: 'fourth' }])
  })
})
