import { useMemo } from 'react'
import { ChevronLeftIcon, ChevronRightIcon } from '../../icons'
import { useChatConfig } from '../core/config'
import type { ChatMessage as Message } from '../types'

interface BranchNavigatorProps {
  messages: Message[]
  currentMessageId: string
  onNavigate: (messageId: string) => void
}

function findSiblings(messages: Message[], messageId: string): Message[] {
  const message = messages.find((m) => m.id === messageId)
  if (!message) {
    return []
  }
  return messages.filter((m) => m.parentId === message.parentId)
}

export default function BranchNavigator({
  messages,
  currentMessageId,
  onNavigate,
}: BranchNavigatorProps) {
  const t = useChatConfig().strings.branch
  const siblings = useMemo(
    () => findSiblings(messages, currentMessageId),
    [messages, currentMessageId],
  )

  // Only show if there are multiple branches
  if (siblings.length <= 1) {
    return null
  }

  const currentIndex = siblings.findIndex((m) => m.id === currentMessageId)
  const hasPrev = currentIndex > 0
  const hasNext = currentIndex < siblings.length - 1

  const handlePrev = () => {
    const prev = siblings[currentIndex - 1]
    if (hasPrev && prev) {
      onNavigate(prev.id)
    }
  }

  const handleNext = () => {
    const next = siblings[currentIndex + 1]
    if (hasNext && next) {
      onNavigate(next.id)
    }
  }

  return (
    <div className="inline-flex items-center text-xs theme-muted-text">
      <button
        type="button"
        onClick={handlePrev}
        disabled={!hasPrev}
        className="p-1.5 rounded-md transition-colors enabled:hover:chat-tint enabled:hover:theme-text disabled:opacity-30 disabled:cursor-not-allowed"
        title={t.previous}
        aria-label={t.previous}
      >
        <ChevronLeftIcon className="w-3.5 h-3.5" />
      </button>
      <span className="min-w-[3ch] text-center tabular-nums">
        {currentIndex + 1}/{siblings.length}
      </span>
      <button
        type="button"
        onClick={handleNext}
        disabled={!hasNext}
        className="p-1.5 rounded-md transition-colors enabled:hover:chat-tint enabled:hover:theme-text disabled:opacity-30 disabled:cursor-not-allowed"
        title={t.next}
        aria-label={t.next}
      >
        <ChevronRightIcon className="w-3.5 h-3.5" />
      </button>
    </div>
  )
}
