import type { ToolCall, ToolCallDelta } from '../../types'
import type { CompletionChunk } from './wire'

export type ParsedSSELine = {
  id?: string | undefined
  messageId?: string | undefined
  content?: string | undefined
  reasoningContent?: string | undefined
  toolCalls?: ToolCallDelta[] | undefined
  finishReason?: string | null | undefined
  model?: string | undefined
  error?: string | undefined
  responsesOutput?: unknown[] | undefined
} | null

export type SSELineParser = (line: string) => ParsedSSELine

export function parseSSELine(line: string): ParsedSSELine {
  if (!line.startsWith('data: ')) {
    return null
  }
  const data = line.slice(6)
  if (data === '[DONE]' || data === '"[DONE]"') {
    return null
  }
  try {
    const parsed = JSON.parse(data)
    if (parsed.error) {
      return { error: parsed.error.message || 'Unknown error' }
    }
    const chunk = parsed as CompletionChunk
    const choice = chunk.choices?.[0]
    return {
      id: chunk.id,
      messageId: chunk.messageId,
      content: choice?.delta?.content as string | undefined,
      reasoningContent: choice?.delta?.reasoning_content,
      toolCalls: choice?.delta?.tool_calls ?? undefined,
      finishReason: choice?.finish_reason,
      model: chunk.model,
    }
  } catch {
    return null
  }
}

/** Process an SSE stream from a ReadableStream reader */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: sequential SSE parsing loop, inherently linear
export async function processSSEStream(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  onContent: (content: string) => void,
  onToolCall?: (toolCalls: ToolCall[]) => void,
  onError?: (error: string) => void,
  onReasoning?: (reasoning: string) => void,
  onMessageId?: (messageId: string) => void,
  parseLine: SSELineParser = parseSSELine,
): Promise<{
  content: string
  messageId: string
  toolCalls: ToolCall[]
  finishReason: string | null
  model: string | null
  reasoning: string
  responsesOutput: unknown[]
}> {
  const decoder = new TextDecoder()
  let assistantContent = ''
  let assistantReasoning = ''
  let assistantMessageId = ''
  let finishReason: string | null = null
  let resolvedModel: string | null = null
  let responsesOutput: unknown[] = []
  // Tool call deltas arrive by index across multiple chunks and must be reassembled
  const toolCallsMap: Map<number, { id: string; type: string; name: string; arguments: string }> =
    new Map()

  let lineBuffer = ''
  while (true) {
    const result = await reader.read()
    if (result.done) {
      break
    }

    const chunk = decoder.decode(result.value, { stream: true })
    const text = lineBuffer + chunk
    const lines = text.split('\n')
    // A chunk boundary may split a line mid-stream; buffer the trailing fragment
    lineBuffer = lines.pop() || ''

    for (const line of lines) {
      const parsed = parseLine(line)
      if (parsed) {
        if (parsed.error) {
          onError?.(parsed.error)
          throw new Error(parsed.error)
        }
        if (parsed.messageId && !assistantMessageId) {
          assistantMessageId = parsed.messageId
          onMessageId?.(parsed.messageId)
        } else if (parsed.id && !assistantMessageId) {
          assistantMessageId = parsed.id
        }
        if (parsed.model && !resolvedModel) {
          resolvedModel = parsed.model
        }
        if (parsed.content) {
          assistantContent += parsed.content
          onContent(parsed.content)
        }
        if (parsed.reasoningContent) {
          assistantReasoning += parsed.reasoningContent
          onReasoning?.(parsed.reasoningContent)
        }
        if (parsed.finishReason) {
          finishReason = parsed.finishReason
        }
        if (parsed.responsesOutput?.length) {
          responsesOutput = parsed.responsesOutput
        }
        if (parsed.toolCalls) {
          for (const tc of parsed.toolCalls) {
            if (tc.index === undefined) {
              continue
            }
            const existing = toolCallsMap.get(tc.index)
            if (existing) {
              if (tc.function?.arguments) {
                existing.arguments += tc.function.arguments
              }
            } else {
              toolCallsMap.set(tc.index, {
                id: tc.id || '',
                type: tc.type || 'function',
                name: tc.function?.name || '',
                arguments: tc.function?.arguments || '',
              })
            }
          }
        }
      }
    }
  }

  if (lineBuffer.trim()) {
    const parsed = parseLine(lineBuffer)
    if (parsed) {
      if (parsed.content) {
        assistantContent += parsed.content
        onContent(parsed.content)
      }
      if (parsed.reasoningContent) {
        assistantReasoning += parsed.reasoningContent
        onReasoning?.(parsed.reasoningContent)
      }
      if (parsed.finishReason) {
        finishReason = parsed.finishReason
      }
    }
  }

  const toolCalls: ToolCall[] = Array.from(toolCallsMap.values()).map((tc) => ({
    id: tc.id,
    type: tc.type,
    function: {
      name: tc.name,
      arguments: tc.arguments,
    },
  }))

  if (toolCalls.length > 0 && onToolCall) {
    onToolCall(toolCalls)
  }

  return {
    content: assistantContent,
    messageId: assistantMessageId,
    toolCalls,
    finishReason,
    model: resolvedModel,
    reasoning: assistantReasoning,
    responsesOutput,
  }
}
