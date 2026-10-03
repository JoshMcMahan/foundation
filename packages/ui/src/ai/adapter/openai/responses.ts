import type { ParsedSSELine } from './sse'
import type { CompletionMessage } from './wire'

function contentString(content: unknown): string {
  return typeof content === 'string' ? content : ''
}

// buildResponsesRequestBody converts the chat-shaped history into an OpenAI
// Responses API request. Attachment IDs ride as a top-level extension the
// gateway expands server-side (same as attachment resolution on the chat path).
export function buildResponsesRequestBody(
  model: string,
  messages: CompletionMessage[],
): Record<string, unknown> {
  const input: Record<string, unknown>[] = []
  let attachmentIds: string[] | undefined

  for (const m of messages) {
    switch (m.role) {
      case 'system':
        input.push({
          type: 'message',
          role: 'system',
          content: contentString(m.content),
        })
        break
      case 'user':
        if (m.attachment_ids?.length) {
          attachmentIds = m.attachment_ids
        }
        input.push({
          type: 'message',
          role: 'user',
          content: contentString(m.content),
        })
        break
      case 'assistant': {
        // Prior turns captured from the Responses API replay verbatim so
        // encrypted reasoning context survives across turns.
        const replayed = Array.isArray(m.responses_output)
          ? replayableOutput(m.responses_output)
          : []
        if (replayed.length > 0) {
          for (const item of replayed) {
            input.push(item as Record<string, unknown>)
          }
          break
        }
        const text = contentString(m.content)
        const toolCalls = m.tool_calls ?? []
        if (text || toolCalls.length === 0) {
          input.push({ type: 'message', role: 'assistant', content: text })
        }
        for (const tc of toolCalls) {
          input.push({
            type: 'function_call',
            call_id: tc.id ?? '',
            name: tc.function.name,
            arguments: tc.function.arguments,
          })
        }
        break
      }
      case 'tool':
        input.push({
          type: 'function_call_output',
          call_id: m.tool_call_id ?? '',
          output: contentString(m.content),
        })
        break
    }
  }

  const body: Record<string, unknown> = {
    model,
    input,
    stream: true,
    store: false,
    // Encrypted reasoning keeps chain-of-thought continuity across turns
    // without server-side state; items come back on the persisted message.
    include: ['reasoning.encrypted_content'],
  }
  if (attachmentIds?.length) {
    body['attachment_ids'] = attachmentIds
  }
  return body
}

interface ResponsesSSEEvent {
  type?: string
  delta?: unknown
  messageId?: string
  message?: string
  response?: {
    model?: string
    error?: { message?: string } | null
    output?: unknown[]
  }
  error?: { message?: string }
}

const REPLAYABLE_ITEM_TYPES = new Set(['reasoning', 'message', 'function_call'])

// replayableOutput keeps the output items a later turn echoes back for
// reasoning continuity.
function replayableOutput(output: unknown[] | undefined): unknown[] {
  if (!output?.length) {
    return []
  }
  return output.filter((item) => {
    if (typeof item !== 'object' || item === null) {
      return false
    }
    const itemType = (item as { type?: unknown }).type
    return typeof itemType === 'string' && REPLAYABLE_ITEM_TYPES.has(itemType)
  })
}

// parseResponsesSSELine maps an OpenAI Responses SSE line onto the same parsed
// shape the chat-completions parser produces, so processSSEStream's
// accumulation, callbacks, and background-stream plumbing work unchanged.
export function parseResponsesSSELine(line: string): ParsedSSELine {
  if (!line.startsWith('data: ')) {
    return null
  }
  const data = line.slice(6)
  if (data === '[DONE]' || data === '"[DONE]"') {
    return null
  }
  let event: ResponsesSSEEvent
  try {
    event = JSON.parse(data) as ResponsesSSEEvent
  } catch {
    return null
  }
  if (event.error) {
    return { error: event.error.message || 'Unknown error' }
  }

  const model = event.response?.model
  switch (event.type) {
    case 'pw.message_id':
      return event.messageId ? { messageId: event.messageId } : null
    case 'response.output_text.delta':
    case 'response.refusal.delta':
      return typeof event.delta === 'string' ? { content: event.delta } : null
    case 'response.reasoning_summary_text.delta':
      return typeof event.delta === 'string' ? { reasoningContent: event.delta } : null
    case 'response.created':
      return model ? { model } : null
    case 'response.completed':
      return {
        ...(model && { model }),
        finishReason: 'stop',
        responsesOutput: replayableOutput(event.response?.output),
      }
    case 'response.incomplete':
      return {
        ...(model && { model }),
        finishReason: 'length',
        responsesOutput: replayableOutput(event.response?.output),
      }
    case 'response.failed':
      return { error: event.response?.error?.message || 'Response failed' }
    case 'error':
      return { error: event.message || 'Stream error' }
    default:
      return null
  }
}
