import { useCallback, useEffect, useRef } from 'react'
import { useStrings } from '../../components/Provider'
import { toast } from '../../components/Toast'
import type { ChatMessage } from '../types'
import { isMac } from '../utils'
import { useChat } from './ChatProvider'
import { useChatConfig } from './config'
import { FOCUS_SIDEBAR_SEARCH_EVENT } from './events'

/** What a reply said: its content, or for a reply that is a parts timeline
 *  (an agent's turn), its text parts. */
export function replyText(message: ChatMessage): string {
  if (message.content) {
    return message.content
  }
  return (message.parts ?? [])
    .flatMap((p) => (p.kind === 'text' && p.text.trim() ? [p.text.trim()] : []))
    .join('\n\n')
}

export function lastAssistantContent(messages: ChatMessage[]): string | null {
  for (const m of messages.toReversed()) {
    const text = m.role === 'assistant' ? replyText(m) : ''
    if (text) {
      return text
    }
  }
  return null
}

export function lastUserMessage(messages: ChatMessage[]): ChatMessage | null {
  return messages.findLast((m) => m.role === 'user') ?? null
}

/** The conversation shortcuts wherever a conversation or session shows:
 *  Cmd/Ctrl+Shift+O starts a new one, +C copies the last reply, +F searches. */
export function useConversationShortcuts({
  enabled = true,
  onNew,
  lastReply,
  onSearch,
}: {
  enabled?: boolean
  onNew: () => void
  /** The last reply's text, or null when there is none. */
  lastReply: () => string | null
  onSearch: () => void
}) {
  const { common } = useStrings()
  const { chrome: t } = useChatConfig().strings
  // The latest handlers, so the listener needn't come and go with each render.
  const handlers = useRef({ onNew, lastReply, onSearch })
  handlers.current = { onNew, lastReply, onSearch }

  const copyLastReply = useCallback(async () => {
    const text = handlers.current.lastReply()
    if (!text) {
      toast.info(t.noResponseToCopy)
      return
    }
    try {
      await navigator.clipboard.writeText(text)
      toast.success(common.copiedToClipboard)
    } catch {
      toast.error(common.copyFailed)
    }
  }, [common, t])

  useEffect(() => {
    if (!enabled) {
      return
    }
    const handleKeyDown = (e: KeyboardEvent) => {
      const cmdKey = isMac() ? e.metaKey : e.ctrlKey
      if (!cmdKey || !e.shiftKey) {
        return
      }
      if (e.key === 'O') {
        e.preventDefault()
        handlers.current.onNew()
      } else if (e.key === 'C') {
        e.preventDefault()
        void copyLastReply()
      } else if (e.key === 'F') {
        e.preventDefault()
        handlers.current.onSearch()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [enabled, copyLastReply])

  return { copyLastReply }
}

interface UseKeyboardShortcutsOptions {
  enabled?: boolean
}

/** The conversation shortcuts for the chat provider's conversations; search
 *  focuses the sidebar's, or whatever answers the focus event. */
export function useKeyboardShortcuts(options: UseKeyboardShortcutsOptions = {}) {
  const { enabled = true } = options
  const { currentConversation, isStreaming, stopStreaming, clearCurrentConversation, navigation } =
    useChat()

  const getLastAssistantMessage = useCallback(
    () => lastAssistantContent(currentConversation?.messages ?? []),
    [currentConversation?.messages],
  )

  const getLastUserMessage = useCallback(
    () => lastUserMessage(currentConversation?.messages ?? []),
    [currentConversation?.messages],
  )

  const handleNewConversation = useCallback(() => {
    clearCurrentConversation()
    navigation.toNewChat()
  }, [clearCurrentConversation, navigation])

  const handleStopGeneration = useCallback(() => {
    if (isStreaming) {
      stopStreaming()
    }
  }, [isStreaming, stopStreaming])

  const { copyLastReply } = useConversationShortcuts({
    enabled,
    onNew: handleNewConversation,
    lastReply: getLastAssistantMessage,
    onSearch: () => document.dispatchEvent(new Event(FOCUS_SIDEBAR_SEARCH_EVENT)),
  })

  return {
    getLastUserMessage,
    getLastAssistantMessage,
    handleNewConversation,
    handleCopyLastResponse: copyLastReply,
    handleStopGeneration,
  }
}

/** Escape pressed in a dialog, a drawer, a menu or an open list closes that
 *  layer and nothing else. Those layers dismiss from a listener on the
 *  document too, so stopping propagation can't keep the event from here. */
export function escapeClosesLayer(target: EventTarget | null): boolean {
  return (
    target instanceof Element &&
    (target.matches('[aria-expanded="true"]') ||
      !!target.closest('[role="dialog"], [role="alertdialog"], [role="menu"]'))
  )
}
