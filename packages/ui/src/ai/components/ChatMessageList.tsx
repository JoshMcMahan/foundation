import cx from 'classnames'
import { Duration } from 'luxon'
import {
  type ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { durationToAbsHumanDuration } from '../../duration'
import { ChevronRightIcon, XIcon } from '../../icons'
import { useChat } from '../core/ChatProvider'
import { useChatConfig } from '../core/config'
import type { ApprovalAnswerValue, ChatMessage as Message } from '../types'
import Markdown from '../ui/Markdown'
import AgentMessageParts from './agent/AgentMessageParts'
import ChatMessage from './ChatMessage'

interface ChatMessageListProps {
  messages: Message[]
  allMessages: Message[]
  streamingMessage?: Message | null
  queuedMessages?: Message[]
  onRemoveQueued?: (id: string) => void
  editingMessageId?: string | null | undefined
  showAuthor?: boolean
  currentUsername?: string
  onNavigateBranch?: (messageId: string) => void
  onEditMessage?: ((messageId: string) => void) | undefined
  onSaveEdit?: (messageId: string, content: string) => void
  onCancelEdit?: () => void
  onRegenerateMessage?: ((messageId: string) => void) | undefined
  onRetryMessage?: ((messageId: string) => void) | undefined
  onOpenReasoning?: (reasoning: string, duration: number | null) => void
  onApprovalAnswer?: (id: string, answer: ApprovalAnswerValue) => void
  inputElement?: ReactNode
  /** Whether a turn is in flight, when the host tracks that itself rather
   *  than streaming through the provider. */
  isStreaming?: boolean
  /** Rows without their own side padding, for a host that pads the column. */
  flush?: boolean
  /** Names the list as a live log for assistive technology. */
  label?: string
  /** Rendered after the last message, inside the scrolling column. */
  footer?: ReactNode
  /** Off for a host that shows the turn's activity elsewhere, so the wait
   *  for the first frame is not announced twice. */
  workingIndicator?: boolean
}

export default function ChatMessageList({
  messages,
  allMessages,
  streamingMessage,
  queuedMessages,
  onRemoveQueued,
  editingMessageId,
  showAuthor,
  currentUsername,
  onNavigateBranch,
  onEditMessage,
  onSaveEdit,
  onCancelEdit,
  onRegenerateMessage,
  onRetryMessage,
  onOpenReasoning,
  onApprovalAnswer,
  inputElement,
  isStreaming: isStreamingProp,
  flush,
  label,
  footer,
  workingIndicator = true,
}: ChatMessageListProps) {
  const {
    adapter,
    isStreaming: providerStreaming,
    isThinking,
    streamingReasoning,
    streamingParts,
    thinkingStartTime,
  } = useChat()
  const isStreaming = isStreamingProp ?? providerStreaming
  const { strings } = useChatConfig()
  const tThinking = strings.thinking
  // Stable across renders so memoized ChatMessage rows don't re-render on
  // every streamed token.
  const attachmentDownloadUrl = useMemo(() => {
    const attachments = adapter.attachments
    return attachments ? (id: string) => attachments.downloadUrl(id) : undefined
  }, [adapter])
  const onOpenAttachment = useMemo(() => {
    const open = adapter.attachments?.onOpen
    return open ? open.bind(adapter.attachments) : undefined
  }, [adapter])
  const bottomRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const reasoningScrollRef = useRef<HTMLDivElement>(null)

  // Track which messages existed on initial load so we don't animate them
  const knownMessageIdsRef = useRef<Set<string>>(new Set())
  const prevMessageCountRef = useRef(messages.length)
  useEffect(() => {
    const prev = prevMessageCountRef.current
    if (messages.length > 0 && (prev === 0 || messages.length < prev)) {
      // Bulk load (0 → many) or conversation switch (count shrank) — mark all as known
      knownMessageIdsRef.current = new Set(messages.map((m) => m.id))
    }
    prevMessageCountRef.current = messages.length
  }, [messages])

  const messageCount = messages.length
  const streamingContent = streamingMessage?.content
  const streamingMessageParts = streamingMessage?.parts

  // Calculate elapsed thinking time
  const [elapsedTime, setElapsedTime] = useState(0)
  const [finalThinkingDuration, setFinalThinkingDuration] = useState<number | null>(null)

  // Track when thinking finishes to capture the final duration
  const wasThinkingRef = useRef(false)
  useEffect(() => {
    if (isThinking && !wasThinkingRef.current) {
      // Started thinking
      wasThinkingRef.current = true
      setFinalThinkingDuration(null)
    } else if (!isThinking && wasThinkingRef.current && thinkingStartTime) {
      // Stopped thinking - capture final duration
      wasThinkingRef.current = false
      setFinalThinkingDuration(Date.now() - thinkingStartTime)
    }
  }, [isThinking, thinkingStartTime])

  // Reset when streaming ends
  useEffect(() => {
    if (!isStreaming) {
      wasThinkingRef.current = false
      setFinalThinkingDuration(null)
    }
  }, [isStreaming])

  useEffect(() => {
    if (!thinkingStartTime || !isThinking) {
      setElapsedTime(0)
      return
    }
    const interval = setInterval(() => {
      setElapsedTime(Math.floor((Date.now() - thinkingStartTime) / 1000))
    }, 1000)
    return () => clearInterval(interval)
  }, [thinkingStartTime, isThinking])

  // Auto-scroll reasoning preview to bottom as content streams
  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll on content change
  useEffect(() => {
    if (reasoningScrollRef.current && isThinking) {
      reasoningScrollRef.current.scrollTop = reasoningScrollRef.current.scrollHeight
    }
  }, [streamingReasoning, isThinking])

  // Stick-to-bottom: follow new content only while the user sits at the
  // bottom. Scrolling up releases it; scrolling back down to the bottom
  // re-arms it. Release must win over the autoscroll that grows the content
  // under the user, so wheel/touch release immediately (before any scroll
  // event is interpreted) and the scroll handler only re-arms on downward
  // movement — an upward scroll that stays within the threshold can never
  // flip the flag back.
  const isNearBottomRef = useRef(true)
  const lastScrollTopRef = useRef(0)
  // Mirrors the ref for the jump control; the ref stays the source of truth
  // for the scroll effects so a re-render never races them.
  const [pinned, setPinned] = useState(true)

  const handleScroll = useCallback(() => {
    if (!containerRef.current) {
      return
    }
    const { scrollTop, scrollHeight, clientHeight } = containerRef.current
    const scrolledDown = scrollTop >= lastScrollTopRef.current
    lastScrollTopRef.current = scrollTop
    if (scrollHeight - scrollTop - clientHeight < 24) {
      if (scrolledDown) {
        isNearBottomRef.current = true
      }
    } else {
      isNearBottomRef.current = false
    }
    setPinned(isNearBottomRef.current)
  }, [])

  // Assigned, not animated: smooth scroll is throttled to nothing in a hidden tab.
  const jumpToLatest = useCallback(() => {
    const el = containerRef.current
    if (el) {
      el.scrollTop = el.scrollHeight
      lastScrollTopRef.current = el.scrollTop
      isNearBottomRef.current = true
      setPinned(true)
    }
  }, [])

  // Attach listeners once the container exists (it is absent in the empty state)
  const hasContent = messages.length > 0 || !!streamingMessage
  const awaitingApproval = streamingParts.some((part) => part.kind === 'approval' && !part.resolved)
  const showWorkingIndicator =
    workingIndicator && isStreaming && !streamingReasoning && !streamingMessage && !awaitingApproval
  // biome-ignore lint/correctness/useExhaustiveDependencies: hasContent re-attaches once the container mounts; it is absent in the empty state.
  useEffect(() => {
    const container = containerRef.current
    if (!container) {
      return
    }
    const releaseOnWheelUp = (e: WheelEvent) => {
      if (e.deltaY < 0) {
        isNearBottomRef.current = false
        setPinned(false)
      }
    }
    const releaseOnTouch = () => {
      isNearBottomRef.current = false
      setPinned(false)
    }
    container.addEventListener('scroll', handleScroll)
    container.addEventListener('wheel', releaseOnWheelUp, { passive: true })
    container.addEventListener('touchmove', releaseOnTouch, { passive: true })
    return () => {
      container.removeEventListener('scroll', handleScroll)
      container.removeEventListener('wheel', releaseOnWheelUp)
      container.removeEventListener('touchmove', releaseOnTouch)
    }
  }, [handleScroll, hasContent])

  // Scroll to bottom on initial load / conversation switch — runs before paint
  const hadMessagesRef = useRef(false)
  // biome-ignore lint/correctness/useExhaustiveDependencies: only fire on message count change
  useLayoutEffect(() => {
    if (!containerRef.current || messageCount === 0) {
      return
    }
    if (!hadMessagesRef.current) {
      // First time we have messages — snap to bottom before paint
      hadMessagesRef.current = true
      containerRef.current.scrollTop = containerRef.current.scrollHeight
    }
  }, [messageCount])

  // Reset hadMessages when conversation switches (messages go to 0 then back)
  useEffect(() => {
    if (messageCount === 0) {
      hadMessagesRef.current = false
    }
  }, [messageCount])

  // Auto-scroll during streaming — runs before paint so there's no visible jump
  // Disabled when queued messages are present so they stay fixed on screen
  const hasQueuedMessages = queuedMessages && queuedMessages.length > 0
  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll on content/message changes
  useLayoutEffect(() => {
    if (!containerRef.current || !isNearBottomRef.current || !isStreaming || hasQueuedMessages) {
      return
    }
    containerRef.current.scrollTop = containerRef.current.scrollHeight
  }, [
    streamingContent,
    streamingParts,
    streamingMessageParts,
    messageCount,
    isStreaming,
    hasQueuedMessages,
  ])

  // Auto-scroll on new messages (non-streaming) — smooth scroll after paint
  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll on message count change
  useEffect(() => {
    if (
      !containerRef.current ||
      !isNearBottomRef.current ||
      isStreaming ||
      !hadMessagesRef.current
    ) {
      return
    }
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messageCount, isStreaming])

  // If no messages and no streaming, just return empty scrollable container
  // The parent page handles the welcome/empty state UI. Queued messages still
  // render — a cancelled first turn must keep them visible.
  if (messages.length === 0 && !streamingMessage && !hasQueuedMessages) {
    return (
      <div className="flex-1 overflow-y-auto flex flex-col bg-(--theme-panel-bg)">
        <div className="flex-1" />
        {footer && (
          <div className={cx('w-full max-w-[50rem] mx-auto', !flush && 'px-4')}>{footer}</div>
        )}
        {inputElement && <div className="sticky bottom-0 z-10">{inputElement}</div>}
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      {...(label
        ? {
            role: 'log',
            'aria-relevant': 'additions' as const,
            'aria-label': label,
          }
        : {})}
      className="flex-1 overflow-y-auto theme-scrollbar flex flex-col bg-(--theme-panel-bg)"
    >
      <div className="w-full max-w-[50rem] mx-auto pt-10 pb-6 flex-1 px-4">
        {messages.map((message) => {
          // Recorded blocks flagged by an agent adapter are not the human
          // speaking; unflagged messages are untouched.
          if (message.pseudo) {
            return null
          }
          const isNew = !knownMessageIdsRef.current.has(message.id)
          // Mark as known so it won't animate on re-render
          if (isNew) {
            knownMessageIdsRef.current.add(message.id)
          }
          return (
            <div key={message.id} className={isNew ? 'animate-chat-enter' : ''}>
              <ChatMessage
                message={message}
                allMessages={allMessages}
                flush={flush}
                isEditing={editingMessageId === message.id}
                showAuthor={showAuthor}
                currentUsername={currentUsername}
                attachmentDownloadUrl={attachmentDownloadUrl}
                onOpenAttachment={onOpenAttachment}
                onNavigateBranch={onNavigateBranch}
                onEdit={onEditMessage}
                onSaveEdit={onSaveEdit}
                onCancelEdit={onCancelEdit}
                onRegenerate={onRegenerateMessage}
                onRetry={onRetryMessage}
                onOpenReasoning={onOpenReasoning}
                onApprovalAnswer={onApprovalAnswer}
              />
            </div>
          )
        })}
        {/* Thinking / "Thought for" section — visible during and after thinking */}
        {isStreaming && streamingReasoning && (
          <div key="thinking" className="animate-chat-enter">
            <div className="py-3 px-4">
              <div className="flex flex-col gap-2">
                {/* Header — opens the reasoning drawer */}
                <button
                  type="button"
                  onClick={() => onOpenReasoning?.(streamingReasoning, finalThinkingDuration)}
                  className="flex items-center gap-x-2 text-left"
                >
                  {isThinking ? (
                    <div className="animate-shimmer text-shimmer flex items-center gap-x-2">
                      <span>
                        {elapsedTime > 0
                          ? `${tThinking.label} (${elapsedTime}s)`
                          : tThinking.ellipsis}
                      </span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-x-1 text-sm theme-muted-text hover:theme-text transition-colors">
                      <span>
                        {tThinking.thoughtFor(
                          finalThinkingDuration
                            ? durationToAbsHumanDuration(Duration.fromMillis(finalThinkingDuration))
                            : `${elapsedTime}s`,
                        )}
                      </span>
                      <ChevronRightIcon className="w-3.5 h-3.5" />
                    </div>
                  )}
                </button>

                {/* Inline reasoning preview — compact tail view while thinking */}
                {isThinking && (
                  <div className="relative ml-6 pl-3 border-l-2 theme-border">
                    <div className="absolute inset-x-0 top-0 h-3 bg-gradient-to-b from-(--theme-app-bg) to-transparent pointer-events-none z-[1]" />
                    <div
                      ref={reasoningScrollRef}
                      className="text-sm theme-muted-text max-h-20 overflow-y-hidden pt-1"
                    >
                      <Markdown isStreaming>{streamingReasoning}</Markdown>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
        {/* Tool calls and other parts streamed this turn, between the
            thinking header and the answer — mirrors the stored-message
            layout where parts precede content. */}
        {isStreaming && streamingParts.length > 0 && (
          <div key="streaming-parts" className="animate-chat-enter py-1 px-4">
            <AgentMessageParts
              message={{
                id: 'streaming-parts',
                role: 'assistant',
                parts: streamingParts,
              }}
              isStreaming={isStreaming}
            />
          </div>
        )}
        {/* Working indicator — until the answer starts streaming */}
        {showWorkingIndicator && (
          <div key="waiting" className="animate-chat-enter">
            <div className="py-3 px-4">
              <div className="animate-shimmer text-shimmer">{tThinking.ellipsis}</div>
            </div>
          </div>
        )}
        {streamingMessage && (
          <div key="streaming" className="animate-chat-enter">
            <ChatMessage
              message={streamingMessage}
              allMessages={allMessages}
              flush={flush}
              isStreaming={isStreaming}
              attachmentDownloadUrl={attachmentDownloadUrl}
              onOpenAttachment={onOpenAttachment}
              onApprovalAnswer={onApprovalAnswer}
            />
          </div>
        )}
        {queuedMessages?.map((msg) => (
          <div key={msg.id} className="group/queued relative animate-chat-enter opacity-60">
            <ChatMessage
              message={msg}
              allMessages={allMessages}
              flush={flush}
              attachmentDownloadUrl={attachmentDownloadUrl}
              onOpenAttachment={onOpenAttachment}
            />
            {onRemoveQueued && (
              <button
                type="button"
                aria-label={strings.queue.remove}
                title={strings.queue.remove}
                onClick={() => onRemoveQueued(msg.id)}
                className="absolute top-1 right-1 rounded p-1 opacity-0 transition-opacity group-hover/queued:opacity-100 focus-visible:opacity-100 hover:bg-(--theme-hover) text-(--theme-muted-text-color)"
              >
                <XIcon className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        ))}
        {footer}
        <div ref={bottomRef} className="h-8" />
      </div>
      {!pinned && (
        <div className="sticky bottom-4 z-10 flex h-0 items-start justify-center overflow-visible">
          <button
            type="button"
            onClick={jumpToLatest}
            className="-translate-y-full rounded-full border theme-border bg-(--theme-panel-bg) px-3 py-1 text-xs shadow-sm hover:theme-hover"
          >
            {strings.chrome.jumpToLatest}
          </button>
        </div>
      )}
      {inputElement && <div className="sticky bottom-0 z-10">{inputElement}</div>}
    </div>
  )
}
