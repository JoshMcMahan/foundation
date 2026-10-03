import { useCallback, useEffect } from 'react'
import type { ChatMessage } from '../types'
import { isMac } from '../utils'
import { useChat } from './ChatProvider'
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
  const {
    currentConversation,
    isStreaming,
    stopStreaming,
    clearCurrentConversation,
    navigation,
    notify,
  } = useChat()

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
        notify.success('Copied to clipboard')
      } catch {
        notify.error('Failed to copy')
      }
    } else {
      notify.info('No response to copy')
    }
  }, [getLastAssistantMessage, notify])

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
        handleStopGeneration()
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
