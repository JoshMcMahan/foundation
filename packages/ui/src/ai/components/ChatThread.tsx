import { useCallback, useEffect, useMemo, useRef } from 'react'
import { useChat } from '../core/ChatProvider'
import { useChatConfig } from '../core/config'
import type { AttachmentMeta, ChatMessage as Message } from '../types'
import BlockedGroupBanner from './BlockedGroupBanner'
import { ComposerControls, ComposerUsage, ConnectToolsLink } from './ComposerChrome'
import ProviderIssueBanner from './ProviderIssueBanner'
import SessionView from './SessionView'
import { ShareButton } from './ShareDialog'

export default function ChatThread({ conversationId }: { conversationId: string }) {
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

  const messages = currentConversation?.messages ?? []
  const canWrite = currentConversation?.canCollaborate !== false

  const onSend = useCallback(
    (content: string, attachmentIds?: string[], attachmentMeta?: AttachmentMeta) => {
      sendMessage(content, attachmentIds, undefined, attachmentMeta)
    },
    [sendMessage],
  )

  const onEdit = useCallback(
    (message: Message, content: string) => {
      sendMessage(content, undefined, message.parentId || undefined)
    },
    [sendMessage],
  )

  // A sibling of the reply, from the same user message.
  const onRegenerate = useCallback(
    (messageId: string) => {
      const reply = messages.find((m) => m.id === messageId)
      const asked = messages.find((m) => m.id === reply?.parentId)
      if (reply?.role !== 'assistant' || asked?.role !== 'user') {
        return
      }
      sendMessage(
        asked.content || '',
        asked.attachments?.map((a) => a.id),
        asked.parentId || undefined,
      )
    },
    [messages, sendMessage],
  )

  // Show author attribution when multiple authors or viewing a shared conversation
  const showAuthor = useMemo(() => {
    const uniqueAuthors = new Set(messages.flatMap((m) => (m.author ? [m.author.username] : [])))
    return uniqueAuthors.size > 1 || currentConversation?.isOwner === false
  }, [messages, currentConversation?.isOwner])

  return (
    <SessionView
      sessionKey={conversationId}
      messages={messages}
      queuedMessages={queuedMessages}
      onRemoveQueued={removeQueuedMessage}
      onSend={onSend}
      {...(canWrite
        ? { onEdit, onRegenerate, onRetry: (id: string) => void retryMessage(id) }
        : {})}
      onNavigateBranch={navigateToBranch}
      showAuthor={showAuthor}
      currentUsername={currentUser.username}
      loading={isLoadingConversation && !currentConversation}
      dropFiles={!!adapter.attachments}
      banners={
        <>
          <BlockedGroupBanner />
          <ProviderIssueBanner />
        </>
      }
      composer={{
        disabled: isLoadingConversation || !canWrite,
        ...(canWrite ? {} : { placeholder: strings.thread.viewOnly }),
        settingsLeft: (
          <>
            {currentConversation && currentConversation.isOwner !== false && (
              <ShareButton conversationId={conversationId} />
            )}
            <ConnectToolsLink />
          </>
        ),
        settingsRight: (
          <>
            <ComposerUsage>{slots.composerUsage}</ComposerUsage>
            <ComposerControls />
          </>
        ),
      }}
    />
  )
}
