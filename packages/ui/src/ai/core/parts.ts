import type { PartDelta } from '../adapter/types'
import type { MessagePart, SubagentPart } from '../types'

/** Fold one streamed PartDelta into a parts timeline. Pure: returns a new
 *  array, leaving the input untouched, so it works for both reducer state
 *  and the provider's local accumulation. Unknown target ids are dropped
 *  rather than invented — an end without a start has nothing to render. */
export function applyPartDelta(parts: MessagePart[], delta: PartDelta): MessagePart[] {
  switch (delta.type) {
    case 'tool_start':
      return [
        ...parts,
        {
          kind: 'tool_call',
          id: delta.id,
          name: delta.name,
          args: delta.args,
          status: 'running',
          ...(delta.startLine !== undefined ? { startLine: delta.startLine } : {}),
        },
      ]
    case 'tool_update':
      // Arguments stream as JSON fragments; updates append to the buffer.
      return parts.map((p) =>
        p.kind === 'tool_call' && p.id === delta.id ? { ...p, args: p.args + delta.args } : p,
      )
    case 'tool_end':
      return parts.map((p) =>
        p.kind === 'tool_call' && p.id === delta.id
          ? {
              ...p,
              status: delta.isError ? ('error' as const) : ('ok' as const),
              result: delta.result,
            }
          : p,
      )
    case 'subagent_start': {
      const part: SubagentPart = {
        kind: 'subagent',
        id: delta.id,
        status: 'running',
        actions: [],
        ...(delta.agentType !== undefined ? { agentType: delta.agentType } : {}),
        ...(delta.color !== undefined ? { color: delta.color } : {}),
        ...(delta.background !== undefined ? { background: delta.background } : {}),
        ...(delta.description !== undefined ? { description: delta.description } : {}),
      }
      return [...parts, part]
    }
    case 'subagent_action':
      return parts.map((p) =>
        p.kind === 'subagent' && p.id === delta.id
          ? { ...p, actions: [...(p.actions ?? []), delta.action] }
          : p,
      )
    case 'subagent_end':
      return parts.map((p) =>
        p.kind === 'subagent' && p.id === delta.id
          ? {
              ...p,
              status: delta.ok ? ('done' as const) : ('failed' as const),
              ...(delta.summary !== undefined ? { summary: delta.summary } : {}),
              ...(delta.report !== undefined ? { report: delta.report } : {}),
            }
          : p,
      )
    case 'approval_request':
      return [...parts, delta.approval]
    case 'approval_resolved':
      return parts.map((p) =>
        p.kind === 'approval' && p.id === delta.id
          ? {
              ...p,
              resolved: true,
              ...(delta.answer !== undefined ? { answer: delta.answer } : {}),
            }
          : p,
      )
    case 'notice':
    case 'warning':
      return [...parts, { kind: delta.type, text: delta.text }]
    case 'todo_snapshot': {
      // A snapshot replaces the previous one in place — the timeline shows
      // the current todo list, not every revision of it.
      const idx = parts.findLastIndex((p) => p.kind === 'todo_snapshot')
      if (idx === -1) {
        return [...parts, { kind: 'todo_snapshot', todos: delta.todos }]
      }
      return parts.map((p, i) =>
        i === idx ? { kind: 'todo_snapshot' as const, todos: delta.todos } : p,
      )
    }
    default:
      return parts
  }
}

/** A turn can end (completed or stopped) with tool calls still marked
 *  running — the transport died before their tool_end arrived. A stored
 *  message must not spin forever, so close them out as interrupted. */
export function finalizeParts(parts: MessagePart[]): MessagePart[] {
  return parts.map((p) =>
    p.kind === 'tool_call' && p.status === 'running'
      ? { ...p, status: 'error' as const, result: p.result ?? 'interrupted' }
      : p,
  )
}
