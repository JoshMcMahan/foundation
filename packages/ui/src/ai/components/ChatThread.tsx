import cx from 'classnames'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CloseIcon, ThinkingIcon } from '../../icons'
import { useChat } from '../core/ChatProvider'
import { useChatConfig } from '../core/config'
import useDragDrop from '../core/useDragDrop'
import type { AttachmentMeta, ChatMessage as Message } from '../types'
import Markdown from '../ui/Markdown'
import BlockedGroupBanner from './BlockedGroupBanner'
import ChatInput, { type ChatInputHandle } from './ChatInput'
import ChatMessageList from './ChatMessageList'
import { ComposerControls, ConnectToolsLink } from './ComposerChrome'
import DragOverlay from './DragOverlay'
import ProviderIssueBanner from './ProviderIssueBanner'
import { ShareButton } from './ShareDialog'

interface EditingState {
  messageId: string
  parentId: string | null
}

export default function ChatThread({ conversationId }: { conversationId: string }) {
  const chatInputRef = useRef<ChatInputHandle>(null)
  const [editingState, setEditingState] = useState<EditingState | null>(null)

  // Reasoning drawer state
  const [reasoningDrawerOpen, setReasoningDrawerOpen] = useState(false)
  const [selectedReasoning, setSelectedReasoning] = useState<{
    content: string
    duration: number | null
  } | null>(null)

  const handleOpenReasoning = useCallback(
    (reasoning: string, duration: number | null) => {
      // Toggle if already open with same content
      if (reasoningDrawerOpen && selectedReasoning?.content === reasoning) {
        setReasoningDrawerOpen(false)
      } else {
        setSelectedReasoning({ content: reasoning, duration })
        setReasoningDrawerOpen(true)
      }
    },
    [reasoningDrawerOpen, selectedReasoning?.content],
  )

  const {
    adapter,
    currentUser,
    currentConversation,
    loadConversation,
    loadProviders,
    sendMessage,
    retryMessage,
    isLoadingConversation,
    isStreaming,
    streamingContent,
    navigateToBranch,
    queuedMessages,
    removeQueuedMessage,
  } = useChat()
  const { slots, strings } = useChatConfig()

  // Keyed on the requested id rather than the loaded one: clearing the current
  // conversation (starting a new chat) must not re-request this conversation,
  // or the reload lands on the new chat page and binds it to this thread.
  const requestedConversationIdRef = useRef<string | null>(null)

  useEffect(() => {
    loadProviders()

    if (requestedConversationIdRef.current !== conversationId) {
      requestedConversationIdRef.current = conversationId
      void loadConversation(conversationId)
    }
  }, [conversationId, loadConversation, loadProviders])

  const handleSendMessage = useCallback(
    (content: string, attachmentIds?: string[], attachmentMeta?: AttachmentMeta) => {
      sendMessage(content, attachmentIds, undefined, attachmentMeta)
    },
    [sendMessage],
  )

  const handleEditMessage = useCallback(
    (messageId: string) => {
      const conversationMessages = currentConversation?.messages || []
      const message = conversationMessages.find((m) => m.id === messageId)
      if (message && message.role === 'user') {
        setEditingState({
          messageId: message.id,
          parentId: message.parentId || null,
        })
      }
    },
    [currentConversation?.messages],
  )

  const handleSaveEdit = useCallback(
    (_messageId: string, content: string) => {
      if (!editingState) {
        return
      }
      // Send with the parent of the edited message to create a branch
      sendMessage(content, undefined, editingState.parentId || undefined)
      setEditingState(null)
    },
    [sendMessage, editingState],
  )

  const handleCancelEdit = useCallback(() => {
    setEditingState(null)
  }, [])

  const handleEditLastMessage = useCallback(() => {
    const conversationMessages = currentConversation?.messages || []
    // Find the last user message
    const lastUserMessage = conversationMessages.findLast((m) => m.role === 'user')
    if (lastUserMessage) {
      handleEditMessage(lastUserMessage.id)
    }
  }, [currentConversation?.messages, handleEditMessage])

  const handleNavigateBranch = useCallback(
    (messageId: string) => {
      navigateToBranch?.(messageId)
    },
    [navigateToBranch],
  )

  const handleRegenerateMessage = useCallback(
    (messageId: string) => {
      const conversationMessages = currentConversation?.messages || []
      // Find the assistant message that was clicked
      const assistantMessage = conversationMessages.find((m) => m.id === messageId)
      if (assistantMessage?.role !== 'assistant') {
        return
      }

      // Find its parent (the user message that prompted it)
      const userMessage = conversationMessages.find((m) => m.id === assistantMessage.parentId)
      if (userMessage?.role !== 'user') {
        return
      }

      // Re-send the user's message content from the same parent to create a sibling branch
      // This will generate a new assistant response as a sibling to the original
      sendMessage(
        userMessage.content || '',
        userMessage.attachments?.map((a) => a.id),
        userMessage.parentId || undefined,
      )
    },
    [currentConversation?.messages, sendMessage],
  )

  const handleRetryMessage = useCallback(
    (messageId: string) => {
      retryMessage(messageId)
    },
    [retryMessage],
  )

  const handleFilesDropped = useCallback((files: FileList) => {
    chatInputRef.current?.addFiles(files)
  }, [])

  const { isDragging, dragHandlers } = useDragDrop({
    onFilesDropped: handleFilesDropped,
  })
  const attachmentsAvailable = !!adapter.attachments

  // Build streaming message for display (memoized to avoid new object identity each render)
  const streamingMessage = useMemo<Message | null>(
    () =>
      isStreaming && streamingContent
        ? {
            id: 'streaming',
            conversationId,
            role: 'assistant',
            content: streamingContent,
            timestamp: '',
          }
        : null,
    [isStreaming, streamingContent, conversationId],
  )

  // Get messages from current conversation
  const messages = currentConversation?.messages || []

  // Show author attribution when multiple authors or viewing a shared conversation
  const showAuthor = useMemo(() => {
    const uniqueAuthors = new Set(messages.flatMap((m) => (m.author ? [m.author.username] : [])))
    return uniqueAuthors.size > 1 || currentConversation?.isOwner === false
  }, [messages, currentConversation?.isOwner])

  // Loading state - only show full loading screen if we have no conversation at all
  if (isLoadingConversation && !currentConversation) {
    return (
      <div className="flex flex-col h-full bg-(--theme-panel-bg)">
        <div className="flex-1" />
        <ChatInput
          ref={chatInputRef}
          onSend={handleSendMessage}
          disabled
          conversationId={conversationId}
          settingsLeft={<ConnectToolsLink />}
          settingsRight={
            <>
              {slots.composerUsage}
              <ComposerControls />
            </>
          }
        />
      </div>
    )
  }

  return (
    <div className="flex h-full relative bg-(--theme-panel-bg)">
      {/* Main chat area */}
      <div className="flex-1 flex flex-col min-w-0" {...(attachmentsAvailable ? dragHandlers : {})}>
        {/* Global drag overlay */}
        {isDragging && attachmentsAvailable && <DragOverlay className="rounded-lg" />}
        <BlockedGroupBanner />
        <ProviderIssueBanner />
        <ChatMessageList
          messages={messages}
          allMessages={messages}
          streamingMessage={streamingMessage}
          queuedMessages={queuedMessages}
          onRemoveQueued={removeQueuedMessage}
          editingMessageId={editingState?.messageId}
          showAuthor={showAuthor}
          currentUsername={currentUser.username}
          onNavigateBranch={handleNavigateBranch}
          onEditMessage={
            currentConversation?.canCollaborate !== false ? handleEditMessage : undefined
          }
          onRegenerateMessage={
            currentConversation?.canCollaborate !== false ? handleRegenerateMessage : undefined
          }
          onRetryMessage={
            currentConversation?.canCollaborate !== false ? handleRetryMessage : undefined
          }
          onSaveEdit={handleSaveEdit}
          onCancelEdit={handleCancelEdit}
          onOpenReasoning={handleOpenReasoning}
          inputElement={
            <ChatInput
              ref={chatInputRef}
              onSend={handleSendMessage}
              disabled={isLoadingConversation || currentConversation?.canCollaborate === false}
              placeholder={
                currentConversation?.canCollaborate === false ? strings.thread.viewOnly : undefined
              }
              conversationId={conversationId}
              onEditLastMessage={handleEditLastMessage}
              settingsLeft={
                <>
                  {currentConversation?.isOwner !== false && (
                    <ShareButton conversationId={conversationId} />
                  )}
                  <ConnectToolsLink />
                </>
              }
              settingsRight={
                <>
                  {slots.composerUsage}
                  <ComposerControls />
                </>
              }
            />
          }
        />
      </div>

      {/* Reasoning Side Panel */}
      <div
        className={cx(
          'flex-shrink-0 border-l theme-border flex flex-col h-full transition-[width] duration-300 ease-in-out overflow-hidden bg-(--theme-panel-bg)',
          reasoningDrawerOpen ? 'w-[400px]' : 'w-0 border-l-0',
        )}
      >
        <div className="w-[400px] h-full flex flex-col">
          {/* Panel Header */}
          <div className="flex items-center justify-between p-3 border-b theme-border">
            <div className="flex items-center gap-2">
              <ThinkingIcon className="w-5 h-5 theme-muted-text" />
              <span className="font-medium">{strings.thinking.activity}</span>
              {selectedReasoning?.duration && (
                <span className="text-sm theme-muted-text">
                  · {Math.round(selectedReasoning.duration / 1000)}s
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={() => setReasoningDrawerOpen(false)}
              className="p-1 rounded hover:theme-hover transition-colors"
            >
              <CloseIcon className="w-5 h-5 theme-muted-text" />
            </button>
          </div>

          {/* Panel Content */}
          <div className="flex-1 overflow-y-auto p-4">
            {selectedReasoning?.content && (
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-sm font-medium theme-text">
                  <div className="w-2 h-2 rounded-full bg-blue-500" />
                  <span>{strings.thinking.label}</span>
                </div>
                <div className="text-sm theme-muted-text leading-relaxed pl-4 border-l-2 theme-border">
                  <Markdown>{selectedReasoning.content}</Markdown>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
