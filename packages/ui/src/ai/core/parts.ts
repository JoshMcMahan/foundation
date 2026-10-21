import type { CompletionMessage } from '../adapter/openai/wire'
import type { PartDelta } from '../adapter/types'
import type { MessagePart, SubagentPart, ToolCallPart } from '../types'

/** Fold one streamed PartDelta into a parts timeline. Pure: returns a new
 *  array, leaving the input untouched, so it works for both reducer state
 *  and the provider's local accumulation. Unknown target ids are dropped
 *  rather than invented — an end without a start has nothing to render. */
export function applyPartDelta(parts: MessagePart[], delta: PartDelta): MessagePart[] {
  switch (delta.type) {
    case 'text':
    case 'reasoning': {
      const last = parts.at(-1)
      if (last?.kind === delta.type) {
        return [...parts.slice(0, -1), { ...last, text: last.text + delta.text }]
      }
      return [...parts, { kind: delta.type, text: delta.text }]
    }
    case 'retract': {
      let end = parts.length
      while (end > 0 && isStreamedText(parts[end - 1])) {
        end -= 1
      }
      return end === parts.length ? parts : parts.slice(0, end)
    }
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
    case 'tool_wait':
      return parts.map((p) =>
        p.kind === 'tool_call' && p.id === delta.id ? { ...p, status: 'waiting' as const } : p,
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
    case 'tool_decision':
      return parts.map((p) =>
        p.kind === 'tool_call' && p.id === delta.id ? { ...p, decision: delta.decision } : p,
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

function isStreamedText(part: MessagePart | undefined): boolean {
  return part?.kind === 'text' || part?.kind === 'reasoning'
}

/** The wire history for an assistant turn whose tool calls the gateway ran:
 *  each round's calls, with the text that came before them, and each result,
 *  then the answer. A turn with no finished tool calls comes back as the
 *  answer alone. */
// Text after the last call is the answer. A host may instead move that text
// into the message's content, leaving the parts to end on a call; content that
// only repeats the text parts, joined, is not an answer of its own.
function answerAfterCalls(
  parts: MessagePart[],
  trailing: string,
  answer: CompletionMessage,
): string | null {
  if (parts.at(-1)?.kind === 'text') {
    return trailing || null
  }
  const texts = parts.flatMap((p) => (p.kind === 'text' ? [p.text] : []))
  const content = typeof answer.content === 'string' ? answer.content : null
  if (!content || content === texts.join('\n\n') || content === texts.join('')) {
    return null
  }
  return content
}

export function toolTurnMessages(
  parts: MessagePart[] | null | undefined,
  answer: CompletionMessage,
): CompletionMessage[] {
  const rounds: { text: string; calls: (ToolCallPart & { result: string })[] }[] = []
  let text = ''
  let calls: (ToolCallPart & { result: string })[] = []
  let hasText = false
  for (const p of parts ?? []) {
    if (p.kind === 'text') {
      hasText = true
      if (calls.length > 0) {
        rounds.push({ text, calls })
        text = ''
        calls = []
      }
      text += p.text
    } else if (p.kind === 'tool_call' && p.status !== 'running' && p.result !== undefined) {
      calls.push(p as ToolCallPart & { result: string })
    }
  }
  if (calls.length > 0) {
    rounds.push({ text, calls })
    text = ''
  }
  if (rounds.length === 0) {
    // A reply that paused on a call waiting for approval may hold nothing yet.
    return answer.content || answer.tool_calls?.length ? [answer] : []
  }
  const final = hasText
    ? { ...answer, content: answerAfterCalls(parts ?? [], text, answer) }
    : answer
  return [
    ...rounds.flatMap((round) => [
      {
        role: 'assistant',
        content: round.text || null,
        tool_calls: round.calls.map((c) => ({
          id: c.id,
          type: 'function',
          function: { name: c.name, arguments: c.args },
        })),
      },
      ...round.calls.map((c) => ({ role: 'tool', tool_call_id: c.id, content: c.result })),
    ]),
    ...(final.content ? [final] : []),
  ]
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
