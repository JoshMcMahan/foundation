import { DateTime } from 'luxon'
import { useEffect, useState } from 'react'
import { toolHeaderFor } from '../agent/toolfmt'
import { useChat, useChatStream } from '../core/ChatProvider'
import { useChatConfig } from '../core/config'
import ActivityLine from './agent/ActivityLine'

/** An agent session's working line for the provider's reply, naming its current step. */
export default function ChatActivity() {
  const { isStreaming, tools } = useChat()
  const { streamingParts, streamingUsage } = useChatStream()
  const { strings, slots } = useChatConfig()
  const [startedAt, setStartedAt] = useState<string | null>(null)

  useEffect(() => {
    setStartedAt(isStreaming ? DateTime.now().toUTC().toISO() : null)
  }, [isStreaming])

  if (!isStreaming) {
    return null
  }
  const waiting = streamingParts.some((p) => p.kind === 'approval' && !p.resolved)
  const running = streamingParts.findLast((p) => p.kind === 'tool_call' && p.status === 'running')
  let word: string | undefined
  if (waiting) {
    word = strings.activity.waitingForAnswer
  } else if (running?.kind === 'tool_call') {
    word =
      slots.toolPresentation?.(running)?.label ??
      tools.find((t) => t.id === running.name)?.label ??
      toolHeaderFor(running.name).label
  }
  return (
    <ActivityLine
      testId="chat-activity"
      startedAt={startedAt}
      word={word}
      inputTokens={streamingUsage?.prompt_tokens}
      outputTokens={streamingUsage?.completion_tokens}
    />
  )
}
