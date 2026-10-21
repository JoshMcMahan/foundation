import type { TokenUsage, ToolCall, ToolCallDelta } from '../../types'
import type { PartDelta } from '../types'
import type { CompletionChunk, ToolApprovalChunk, ToolResultChunk } from './wire'

export type ParsedSSELine = {
  id?: string | undefined
  messageId?: string | undefined
  content?: string | undefined
  reasoningContent?: string | undefined
  toolCalls?: ToolCallDelta[] | undefined
  toolResult?: ToolResultChunk | undefined
  toolApproval?: ToolApprovalChunk | undefined
  finishReason?: string | null | undefined
  model?: string | undefined
  error?: string | undefined
  responsesOutput?: unknown[] | undefined
  usage?: TokenUsage | undefined
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
      toolResult: chunk.toolResult,
      toolApproval: chunk.toolApproval,
      finishReason: choice?.finish_reason,
      model: chunk.model,
      usage: chunk.usage,
    }
  } catch {
    return null
  }
}

/** Process an SSE stream from a ReadableStream reader. With `onPart`, tool
 *  calls stream as parts; a call the gateway answered with a result is left
 *  off the returned `toolCalls`, which then hold only calls the caller must
 *  run. */
export async function processSSEStream(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  onContent: (content: string) => void,
  onToolCall?: (toolCalls: ToolCall[]) => void,
  onError?: (error: string) => void,
  onReasoning?: (reasoning: string) => void,
  onMessageId?: (messageId: string) => void,
  parseLine: SSELineParser = parseSSELine,
  onPart?: (delta: PartDelta) => void,
  // Tokens the reply has used so far, when the stream reports them.
  onUsage?: (usage: TokenUsage) => void,
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
  const startedToolCalls = new Set<number>()
  const answeredToolCalls = new Set<string>()
  const startToolCall = (index: number) => {
    const tc = toolCallsMap.get(index)
    if (!onPart || !tc?.id || !tc.name || startedToolCalls.has(index)) {
      return
    }
    startedToolCalls.add(index)
    onPart({ type: 'tool_start', id: tc.id, name: tc.name, args: tc.arguments })
  }

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
        if (parsed.usage) {
          onUsage?.(parsed.usage)
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
              existing.id ||= tc.id || ''
              existing.name ||= tc.function?.name || ''
              if (tc.function?.arguments) {
                existing.arguments += tc.function.arguments
                if (startedToolCalls.has(tc.index)) {
                  onPart?.({ type: 'tool_update', id: existing.id, args: tc.function.arguments })
                }
              }
            } else {
              toolCallsMap.set(tc.index, {
                id: tc.id || '',
                type: tc.type || 'function',
                name: tc.function?.name || '',
                arguments: tc.function?.arguments || '',
              })
            }
            startToolCall(tc.index)
          }
        }
        if (parsed.toolResult) {
          answeredToolCalls.add(parsed.toolResult.toolCallId)
          onPart?.({
            type: 'tool_end',
            id: parsed.toolResult.toolCallId,
            result: parsed.toolResult.content,
            ...(parsed.toolResult.isError ? { isError: true } : {}),
          })
        }
        if (parsed.toolApproval) {
          const { toolCallId, expiresAt } = parsed.toolApproval
          answeredToolCalls.add(toolCallId)
          onPart?.({ type: 'tool_wait', id: toolCallId })
          onPart?.({
            type: 'approval_request',
            approval: {
              kind: 'approval',
              id: toolCallId,
              approvalKind: 'confirm',
              subject: 'call',
              canAllowDirectory: false,
              ...(expiresAt ? { expiresAt } : {}),
            },
          })
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

  const toolCalls: ToolCall[] = Array.from(toolCallsMap.values())
    .filter((tc) => !answeredToolCalls.has(tc.id))
    .map((tc) => ({
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
