import { describe, expect, it } from 'vitest'
import type { MessagePart, ToolCallPart } from '../types'
import { applyPartDelta, finalizeParts, toolTurnMessages } from './parts'

const runningTool = (id = 't1'): ToolCallPart => ({
  kind: 'tool_call',
  id,
  name: 'get_workflow',
  args: '{"name":"helloworld"}',
  status: 'running',
})

describe('applyPartDelta', () => {
  it('appends a running tool call on tool_start', () => {
    const parts = applyPartDelta([], {
      type: 'tool_start',
      id: 't1',
      name: 'get_workflow',
      args: '{"name":"helloworld"}',
    })
    expect(parts).toEqual([runningTool()])
  })

  it('records a decision on its tool call', () => {
    const decision = {
      status: 'approved',
      by: 'user',
      name: 'ana',
      at: '2026-10-19T12:00:00Z',
    } as const
    const parts = applyPartDelta([runningTool('t1'), runningTool('t2')], {
      type: 'tool_decision',
      id: 't2',
      decision,
    })
    expect(parts).toEqual([runningTool('t1'), { ...runningTool('t2'), decision }])
  })

  it('does not mutate the input array', () => {
    const before: MessagePart[] = []
    applyPartDelta(before, {
      type: 'tool_start',
      id: 't1',
      name: 'x',
      args: '',
    })
    expect(before).toEqual([])
  })

  it('appends streamed argument fragments on tool_update', () => {
    let parts = applyPartDelta([], {
      type: 'tool_start',
      id: 't1',
      name: 'x',
      args: '{"na',
    })
    parts = applyPartDelta(parts, {
      type: 'tool_update',
      id: 't1',
      args: 'me":1}',
    })
    expect((parts[0] as ToolCallPart).args).toBe('{"name":1}')
  })

  it('marks the matching call waiting on tool_wait', () => {
    const parts = applyPartDelta([runningTool('t1'), runningTool('t2')], {
      type: 'tool_wait',
      id: 't1',
    })
    expect(parts.map((p) => (p as ToolCallPart).status)).toEqual(['waiting', 'running'])
  })

  it('keeps a waiting call out of the history and out of the interrupted sweep', () => {
    const waiting: ToolCallPart = { ...runningTool(), status: 'waiting' }
    expect(finalizeParts([waiting])).toEqual([waiting])
    expect(toolTurnMessages([waiting], { role: 'assistant', content: 'Stopping it.' })).toEqual([
      { role: 'assistant', content: 'Stopping it.' },
    ])
  })

  it('resolves the matching call on tool_end and leaves others running', () => {
    let parts: MessagePart[] = [runningTool('t1'), runningTool('t2')]
    parts = applyPartDelta(parts, {
      type: 'tool_end',
      id: 't1',
      result: '1 jobs, 0 edges',
    })
    expect((parts[0] as ToolCallPart).status).toBe('ok')
    expect((parts[0] as ToolCallPart).result).toBe('1 jobs, 0 edges')
    expect((parts[1] as ToolCallPart).status).toBe('running')
  })

  it('marks the call failed when tool_end carries isError', () => {
    let parts: MessagePart[] = [runningTool()]
    parts = applyPartDelta(parts, {
      type: 'tool_end',
      id: 't1',
      result: 'boom',
      isError: true,
    })
    expect((parts[0] as ToolCallPart).status).toBe('error')
  })

  it('drops a tool_end whose id was never started', () => {
    const parts = applyPartDelta([], {
      type: 'tool_end',
      id: 'ghost',
      result: 'x',
    })
    expect(parts).toEqual([])
  })

  it('tracks a subagent through start, action, and end', () => {
    let parts = applyPartDelta([], {
      type: 'subagent_start',
      id: 's1',
      agentType: 'Explore',
    })
    parts = applyPartDelta(parts, {
      type: 'subagent_action',
      id: 's1',
      action: 'reading files',
    })
    parts = applyPartDelta(parts, {
      type: 'subagent_end',
      id: 's1',
      ok: true,
      summary: 'done',
    })
    expect(parts).toEqual([
      {
        kind: 'subagent',
        id: 's1',
        status: 'done',
        agentType: 'Explore',
        actions: ['reading files'],
        summary: 'done',
      },
    ])
  })

  it('appends approvals and resolves them in place', () => {
    let parts = applyPartDelta([], {
      type: 'approval_request',
      approval: { kind: 'approval', id: 'a1', approvalKind: 'confirm' },
    })
    parts = applyPartDelta(parts, {
      type: 'approval_resolved',
      id: 'a1',
      answer: 'yes',
    })
    expect(parts).toEqual([
      {
        kind: 'approval',
        id: 'a1',
        approvalKind: 'confirm',
        resolved: true,
        answer: 'yes',
      },
    ])
  })

  it('grows the last text or reasoning part and starts a new one when the kind changes', () => {
    let parts = applyPartDelta([], { type: 'reasoning', text: 'Look' })
    parts = applyPartDelta(parts, { type: 'reasoning', text: 'ing' })
    parts = applyPartDelta(parts, { type: 'text', text: 'Found ' })
    parts = applyPartDelta(parts, { type: 'text', text: 'it' })
    parts = applyPartDelta(parts, { type: 'tool_start', id: 't1', name: 'x', args: '' })
    parts = applyPartDelta(parts, { type: 'text', text: 'Done' })
    expect(parts).toEqual([
      { kind: 'reasoning', text: 'Looking' },
      { kind: 'text', text: 'Found it' },
      { kind: 'tool_call', id: 't1', name: 'x', args: '', status: 'running' },
      { kind: 'text', text: 'Done' },
    ])
  })

  it('keeps the rest of the last part when appending text to it', () => {
    const parts = applyPartDelta([{ kind: 'reasoning', text: 'a', durationMs: 5 }], {
      type: 'reasoning',
      text: 'b',
    })
    expect(parts).toEqual([{ kind: 'reasoning', text: 'ab', durationMs: 5 }])
  })

  it('retracts the trailing text and reasoning, back to the last other part', () => {
    const before: MessagePart[] = [
      { kind: 'text', text: 'kept' },
      runningTool(),
      { kind: 'reasoning', text: 'gone' },
      { kind: 'text', text: 'gone too' },
    ]
    expect(applyPartDelta(before, { type: 'retract' })).toEqual([
      { kind: 'text', text: 'kept' },
      runningTool(),
    ])
    expect(before).toHaveLength(4)
  })

  it('retracts nothing when the timeline does not end in text', () => {
    const parts: MessagePart[] = [runningTool()]
    expect(applyPartDelta(parts, { type: 'retract' })).toBe(parts)
  })

  it('appends notices and warnings', () => {
    let parts = applyPartDelta([], { type: 'notice', text: 'heads up' })
    parts = applyPartDelta(parts, { type: 'warning', text: 'careful' })
    expect(parts).toEqual([
      { kind: 'notice', text: 'heads up' },
      { kind: 'warning', text: 'careful' },
    ])
  })

  it('replaces the existing todo snapshot instead of stacking revisions', () => {
    let parts = applyPartDelta([], {
      type: 'todo_snapshot',
      todos: [{ content: 'a', status: 'pending' }],
    })
    parts = applyPartDelta(parts, {
      type: 'todo_snapshot',
      todos: [{ content: 'a', status: 'completed' }],
    })
    expect(parts).toEqual([
      { kind: 'todo_snapshot', todos: [{ content: 'a', status: 'completed' }] },
    ])
  })
})

describe('finalizeParts', () => {
  it('closes out still-running tool calls as interrupted', () => {
    const parts = finalizeParts([runningTool()])
    expect(parts).toEqual([{ ...runningTool(), status: 'error', result: 'interrupted' }])
  })

  it('leaves resolved calls and other parts untouched', () => {
    const done: ToolCallPart = { ...runningTool(), status: 'ok', result: 'x' }
    const notice: MessagePart = { kind: 'notice', text: 'n' }
    expect(finalizeParts([done, notice])).toEqual([done, notice])
  })
})

describe('toolTurnMessages', () => {
  const answer = { role: 'assistant', content: 'You have gpu-a.' }

  it('replays finished tool calls and their results before the answer', () => {
    const parts: MessagePart[] = [
      { ...runningTool('t1'), status: 'ok', result: '["gpu-a"]' },
      { ...runningTool('t2'), status: 'error', result: 'not found' },
    ]
    expect(toolTurnMessages(parts, answer)).toEqual([
      {
        role: 'assistant',
        content: null,
        tool_calls: [
          {
            id: 't1',
            type: 'function',
            function: { name: 'get_workflow', arguments: '{"name":"helloworld"}' },
          },
          {
            id: 't2',
            type: 'function',
            function: { name: 'get_workflow', arguments: '{"name":"helloworld"}' },
          },
        ],
      },
      { role: 'tool', tool_call_id: 't1', content: '["gpu-a"]' },
      { role: 'tool', tool_call_id: 't2', content: 'not found' },
      answer,
    ])
  })

  it('returns the answer alone when no tool call finished', () => {
    expect(toolTurnMessages([runningTool()], answer)).toEqual([answer])
    expect(toolTurnMessages(undefined, answer)).toEqual([answer])
  })

  it('leaves out an empty answer after the tool results', () => {
    const parts: MessagePart[] = [{ ...runningTool(), status: 'ok', result: 'done' }]
    expect(toolTurnMessages(parts, { role: 'assistant', content: null })).toHaveLength(2)
  })
})
