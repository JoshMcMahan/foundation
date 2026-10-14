import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useChat } from '../core/ChatProvider'
import { useChatConfig } from '../core/config'
import useDragDrop from '../core/useDragDrop'
import type { AttachmentMeta } from '../types'
import BlockedGroupBanner from './BlockedGroupBanner'
import ChatInput, { type ChatInputHandle } from './ChatInput'
import ChatMessageList from './ChatMessageList'
import { ComposerControls, ComposerUsage, ConnectToolsLink } from './ComposerChrome'
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

  const {
    adapter,
    currentUser,
    currentConversation,
    loadConversation,
    loadProviders,
    sendMessage,
    retryMessage,
    isLoadingConversation,
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
              <ComposerUsage>{slots.composerUsage}</ComposerUsage>
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
                  <ComposerUsage>{slots.composerUsage}</ComposerUsage>
                  <ComposerControls />
                </>
              }
            />
          }
        />
      </div>
    </div>
  )
}
