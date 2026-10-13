import { useCallback, useEffect } from 'react'
import { useStrings } from '../../components/Provider'
import { toast } from '../../components/Toast'
import type { ChatMessage } from '../types'
import { isMac } from '../utils'
import { useChat } from './ChatProvider'
import { useChatConfig } from './config'
import { FOCUS_SIDEBAR_SEARCH_EVENT } from './events'

export function lastAssistantContent(messages: ChatMessage[]): string | null {
  return messages.findLast((m) => m.role === 'assistant' && m.content)?.content ?? null
}

export function lastUserMessage(messages: ChatMessage[]): ChatMessage | null {
  return messages.findLast((m) => m.role === 'user') ?? null
}

interface UseKeyboardShortcutsOptions {
  enabled?: boolean
}

export function useKeyboardShortcuts(options: UseKeyboardShortcutsOptions = {}) {
  const { enabled = true } = options
  const { currentConversation, isStreaming, stopStreaming, clearCurrentConversation, navigation } =
    useChat()
  const { common } = useStrings()
  const { chrome: t } = useChatConfig().strings

  // Get last assistant message for copy functionality
  const getLastAssistantMessage = useCallback(
    () => lastAssistantContent(currentConversation?.messages ?? []),
    [currentConversation?.messages],
  )

  // Get last user message for edit functionality
  const getLastUserMessage = useCallback(
    () => lastUserMessage(currentConversation?.messages ?? []),
    [currentConversation?.messages],
  )

  const handleNewConversation = useCallback(() => {
    clearCurrentConversation()
    navigation.toNewChat()
  }, [clearCurrentConversation, navigation])

  const handleCopyLastResponse = useCallback(async () => {
    const content = getLastAssistantMessage()
    if (content) {
      try {
        await navigator.clipboard.writeText(content)
        toast.success(common.copiedToClipboard)
      } catch {
        toast.error(common.copyFailed)
      }
    } else {
      toast.info(t.noResponseToCopy)
    }
  }, [getLastAssistantMessage, common, t])

  const handleStopGeneration = useCallback(() => {
    if (isStreaming) {
      stopStreaming()
    }
  }, [isStreaming, stopStreaming])

  useEffect(() => {
    if (!enabled) {
      return
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      const cmdKey = isMac() ? e.metaKey : e.ctrlKey

      // Escape - Stop generation
      if (e.key === 'Escape') {
        if (!escapeClosesLayer(e.target)) {
          handleStopGeneration()
        }
        return
      }

      // Cmd/Ctrl + Shift + O - New conversation
      if (cmdKey && e.shiftKey && e.key === 'O') {
        e.preventDefault()
        handleNewConversation()
        return
      }

      // Cmd/Ctrl + Shift + C - Copy last response
      if (cmdKey && e.shiftKey && e.key === 'C') {
        e.preventDefault()
        handleCopyLastResponse()
        return
      }

      // Cmd/Ctrl + Shift + F - Focus conversation search in the sidebar
      if (cmdKey && e.shiftKey && e.key === 'F') {
        e.preventDefault()
        document.dispatchEvent(new Event(FOCUS_SIDEBAR_SEARCH_EVENT))
        return
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [enabled, handleNewConversation, handleCopyLastResponse, handleStopGeneration])

  // Return helper functions for components that need them
  return {
    getLastUserMessage,
    getLastAssistantMessage,
    handleNewConversation,
    handleCopyLastResponse,
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
