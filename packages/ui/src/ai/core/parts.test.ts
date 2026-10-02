import { describe, expect, it } from 'vitest'
import type { MessagePart, ToolCallPart } from '../types'
import { applyPartDelta, finalizeParts } from './parts'

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
