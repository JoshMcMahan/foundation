import {
  type ComponentProps,
  memo,
  type ReactNode,
  type Ref,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useStrings } from '../../components/Provider'
import { useElapsed } from '../../components/relativeTime'
import { cx } from '../../cx'
import { formatDuration } from '../../format'
import { CheckIcon, ClockIcon } from '../../icons'
import { useChat, useChatStream } from '../core/ChatProvider'
import { useChatConfig } from '../core/config'
import type { ApprovalAnswerValue, ChatMessage as Message } from '../types'
import Markdown from '../ui/Markdown'
import AgentMessageParts from './agent/AgentMessageParts'
import ChatMessage from './ChatMessage'
import { Reasoning, ReasoningBody } from './Reasoning'

// How long after a click or key press inside the thread its growth counts as
// the reader's own.
const READER_GROWTH_MS = 600

const jumpClasses =
  'chat-composer chat-jump rounded-full px-3 py-1.5 text-xs font-medium theme-text transition-colors'

export type QueueDelivery = 'afterReply' | 'nextStep'

interface ChatMessageListProps {
  messages: Message[]
  allMessages: Message[]
  /** The reply being written. Left unset, the list shows the chat provider's
   *  own stream; a host that streams elsewhere passes its reply, or null. */
  streamingMessage?: Message | null
  queuedMessages?: Message[]
  onRemoveQueued?: (id: string) => void
  /** Which queued messages can still be taken back; all of them when unset.
   *  One that cannot has been handed to the running turn. */
  canRemoveQueued?: (id: string) => boolean
  /** When a queued message reaches the model: once the running reply
   *  finishes (the chat provider's queue), or between the agent's steps for a
   *  host that steers the turn in progress. A host with both kinds says which
   *  each message is. */
  queueDelivery?: QueueDelivery | ((messageId: string) => QueueDelivery)
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
  /** Draws the transcript as a terminal does: every run of tool calls folds
   *  from its first call, failures and running calls included, and a thought
   *  shows whole while it streams. */
  foldEveryRun?: boolean
  /** Names the list, a live log, for assistive technology. Defaults to the
   *  chat strings' `thread.label`. */
  label?: string
  /** Rendered after the last message, inside the scrolling column. */
  footer?: ReactNode
  /** Off for a host that shows the turn's activity elsewhere, so the wait
   *  for the first frame is not announced twice. */
  workingIndicator?: boolean
  /** Pins the prompt of the turn in view to the top once it scrolls out of
   *  sight, as a terminal transcript does; a click returns to it. */
  pinPrompt?: boolean
  ref?: Ref<ChatMessageListHandle> | undefined
}

export interface ChatMessageListHandle {
  /** Returns to the newest content and follows it again. */
  jumpToLatest: () => void
}

export default function ChatMessageList({
  messages,
  allMessages,
  streamingMessage: streamingMessageProp,
  queuedMessages,
  onRemoveQueued,
  canRemoveQueued,
  queueDelivery = 'afterReply',
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
  foldEveryRun,
  label,
  footer,
  workingIndicator = true,
  pinPrompt,
  ref,
}: ChatMessageListProps) {
  const { adapter, isStreaming: providerStreaming } = useChat()
  const { isThinking, streamingContent, streamingReasoning, streamingParts, thinkingStartTime } =
    useChatStream()
  const isStreaming = isStreamingProp ?? providerStreaming
  const conversationId = messages[0]?.conversationId
  // One object per token rather than per render, so the streaming row's memo
  // holds while something else re-renders the list.
  // Once tool calls have started, the reply's text streams among them in the
  // parts, in the order it came, rather than as one block below them.
  const textInParts = streamingParts.some((part) => part.kind === 'text')
  const providerStreamingMessage = useMemo<Message | null>(
    () =>
      providerStreaming && streamingContent && !textInParts
        ? {
            id: 'streaming',
            role: 'assistant',
            content: streamingContent,
            timestamp: '',
            ...(conversationId ? { conversationId } : {}),
          }
        : null,
    [providerStreaming, streamingContent, textInParts, conversationId],
  )
  const streamingMessage =
    streamingMessageProp === undefined ? providerStreamingMessage : streamingMessageProp
  const streamingPartsMessage = useMemo<Message>(
    () => ({ id: 'streaming-parts', role: 'assistant', parts: streamingParts }),
    [streamingParts],
  )
  const { strings } = useChatConfig()
  const { common } = useStrings()
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
  const containerRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const floorRef = useRef<HTMLDivElement>(null)
  const dockRef = useRef<HTMLDivElement>(null)
  const reasoningScrollRef = useRef<HTMLDivElement>(null)

  const messageCount = messages.length
  const streamingText = streamingMessage?.content
  const streamingMessageParts = streamingMessage?.parts

  const [finalThinkingDuration, setFinalThinkingDuration] = useState<number | null>(null)
  const [reasoningOpen, setReasoningOpen] = useState(false)

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
      setReasoningOpen(false)
    }
  }, [isStreaming])

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
    } else if (!scrolledDown) {
      // Only moving up leaves the bottom. Content that grows before a scroll to
      // it reports, such as a picture loading, opens a gap on the way down.
      isNearBottomRef.current = false
    }
    setPinned(isNearBottomRef.current)
  }, [])

  // Reads the position first: a jump up that its scroll event has not reported
  // yet has to count, or following would undo it before it was ever seen.
  const followBottom = useCallback(() => {
    const el = containerRef.current
    if (!el || !isNearBottomRef.current) {
      return
    }
    handleScroll()
    if (isNearBottomRef.current) {
      el.scrollTop = el.scrollHeight
      lastScrollTopRef.current = el.scrollTop
    }
  }, [handleScroll])

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

  useImperativeHandle(ref, () => ({ jumpToLatest }), [jumpToLatest])

  // Attach listeners once the container exists (it is absent in the empty state)
  const queuedCount = queuedMessages?.length ?? 0
  const hasContent = messages.length > 0 || !!streamingMessage || queuedCount > 0
  const awaitingApproval = streamingParts.some((part) => part.kind === 'approval' && !part.resolved)
  const showWorkingIndicator =
    workingIndicator &&
    isStreaming &&
    !streamingReasoning &&
    !streamingMessage &&
    !textInParts &&
    !awaitingApproval
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

  // The prompt the pin shows, and the scrollbar's width so the pin lines up
  // with the column it overlays.
  const [anchor, setAnchor] = useState<string | null>(null)
  const [gutter, setGutter] = useState(0)
  const anchorFrameRef = useRef(0)
  const findAnchor = useCallback(() => {
    if (!pinPrompt) {
      return
    }
    cancelAnimationFrame(anchorFrameRef.current)
    anchorFrameRef.current = requestAnimationFrame(() => {
      const el = containerRef.current
      setAnchor(el ? promptAbove(el) : null)
      setGutter(el ? el.offsetWidth - el.clientWidth : 0)
    })
  }, [pinPrompt])

  // biome-ignore lint/correctness/useExhaustiveDependencies: hasContent re-attaches once the container mounts; it is absent in the empty state.
  useEffect(() => {
    const container = containerRef.current
    if (!container || !pinPrompt) {
      return
    }
    findAnchor()
    container.addEventListener('scroll', findAnchor, { passive: true })
    return () => {
      container.removeEventListener('scroll', findAnchor)
      cancelAnimationFrame(anchorFrameRef.current)
    }
  }, [findAnchor, hasContent, pinPrompt])

  const jumpToPrompt = useCallback(() => {
    const el = containerRef.current
    const row = el
      ? [...el.querySelectorAll<HTMLElement>('[data-prompt]')].find(
          (r) => r.dataset['prompt'] === anchor,
        )
      : undefined
    if (!el || !row) {
      return
    }
    isNearBottomRef.current = false
    setPinned(false)
    const top = el.scrollTop + row.getBoundingClientRect().top - el.getBoundingClientRect().top
    el.scrollTo({ top, behavior: prefersReducedMotion() ? 'auto' : 'smooth' })
    // The pin goes once its prompt shows, so focus moves to the prompt rather than to the page.
    row.focus({ preventScroll: true })
  }, [anchor])

  // Scroll to bottom on initial load / conversation switch — runs before paint
  const hadMessagesRef = useRef(false)
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
      lastScrollTopRef.current = 0
    }
  }, [messageCount])

  // Follows new content before it paints, streamed or not. Not animated: the
  // rest of a transcript a host catches up on after the list opened would
  // otherwise glide in over the reader's first look at it. Queued messages
  // render below the reply, so following it is what keeps them on screen.
  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll on content/message changes
  useLayoutEffect(() => {
    followBottom()
  }, [streamingText, streamingParts, streamingMessageParts, messageCount, isStreaming, queuedCount])

  // Follows content that grows after its reply finished, such as a card that
  // keeps showing what a tool is doing, while the reader sits at the bottom.
  //
  // It also holds the list at the content's last observed height until the
  // next observation. WebKit lays the list out partway through inserting an
  // inline SVG sized by its attributes, before the inserted rows count toward
  // the list's height. Rows swapped near the bottom (the finished reply taking
  // the streaming row's place, markdown replacing its loading text) would
  // otherwise clamp the position by their height, and the scroll event that
  // follows would read as the reader scrolling up.
  // biome-ignore lint/correctness/useExhaustiveDependencies: hasContent re-observes once the content mounts; it is absent in the empty state.
  useEffect(() => {
    const content = contentRef.current
    const floor = floorRef.current
    const dock = dockRef.current
    if (!content || !floor || typeof ResizeObserver === 'undefined') {
      return
    }
    // Growth the reader caused, such as opening a tool's row, stays put: the
    // row they clicked must not jump out from under the pointer.
    let touchedAt = Number.NEGATIVE_INFINITY
    const touched = () => {
      touchedAt = performance.now()
    }
    content.addEventListener('click', touched, true)
    content.addEventListener('keydown', touched, true)
    const observer = new ResizeObserver(() => {
      floor.style.minHeight = `${content.offsetHeight}px`
      if (performance.now() - touchedAt > READER_GROWTH_MS) {
        followBottom()
      }
      findAnchor()
    })
    observer.observe(content)
    // The composer sticks to the list's bottom edge, so as it grows, with a
    // line typed or a row of chips, it would cover the last lines.
    if (dock) {
      observer.observe(dock)
    }
    return () => {
      observer.disconnect()
      content.removeEventListener('click', touched, true)
      content.removeEventListener('keydown', touched, true)
    }
  }, [hasContent, findAnchor])

  // One keyed dock in both states, so the composer is not remounted as the
  // first message comes and goes: a send it is waiting on puts its text back
  // into the box it came from.
  const dock = inputElement && (
    <div key="composer" ref={dockRef} data-composer-dock="" className="sticky bottom-0 z-10">
      {/* Rides on the composer's top edge: on its own it would stick at the
          same bottom as the composer and sit underneath it. */}
      {hasContent && !pinned && (
        <div className="pointer-events-none absolute inset-x-0 bottom-full flex justify-center pb-2">
          <button
            type="button"
            onClick={jumpToLatest}
            className={cx(jumpClasses, 'pointer-events-auto')}
          >
            {strings.chrome.jumpToLatest}
          </button>
        </div>
      )}
      {inputElement}
    </div>
  )

  // If no messages and no streaming, just return empty scrollable container
  // The parent page handles the welcome/empty state UI. Queued messages still
  // render — a canceled first turn must keep them visible.
  if (!hasContent) {
    return (
      <div className="chat-thread flex-1 overflow-y-auto flex flex-col bg-(--theme-panel-bg)">
        <div className="flex-1" />
        {footer && (
          <div className={cx('w-full max-w-[var(--chat-column,50rem)] mx-auto', !flush && 'px-4')}>
            {footer}
          </div>
        )}
        {dock}
      </div>
    )
  }

  const pinnedText = pinPrompt && anchor ? promptLine(messages.find((m) => m.id === anchor)) : ''

  const list = (
    <div
      ref={containerRef}
      // A live log: each new message is announced as it is added. Busy while a
      // reply streams, so a screen reader reads it once rather than word by word.
      role="log"
      aria-relevant="additions"
      aria-label={label ?? strings.thread.label}
      aria-busy={isStreaming || undefined}
      // Scroll anchoring keeps a reader who scrolled up in place. At the bottom
      // the list follows on its own, and an anchoring adjustment (WebKit makes
      // one when markdown replaces its loading text) would read as the reader
      // scrolling up.
      className={cx(
        'chat-thread flex-1 overflow-y-auto theme-scrollbar flex flex-col bg-(--theme-panel-bg)',
        pinned && '[overflow-anchor:none]',
      )}
    >
      {/* Holds the content's last observed height: see the resize observer. */}
      <div ref={floorRef} className="flex-1">
        <div
          ref={contentRef}
          data-transcript=""
          className="w-full max-w-[var(--chat-column,50rem)] mx-auto pt-4 pb-6 px-4"
        >
          <MessageRows
            messages={messages}
            allMessages={allMessages}
            streaming={!!streamingMessage}
            prompts={!!pinPrompt}
            flush={flush}
            foldEveryRun={foldEveryRun}
            editingMessageId={editingMessageId}
            showAuthor={showAuthor}
            currentUsername={currentUsername}
            attachmentDownloadUrl={attachmentDownloadUrl}
            onOpenAttachment={onOpenAttachment}
            onNavigateBranch={onNavigateBranch}
            onEditMessage={onEditMessage}
            onSaveEdit={onSaveEdit}
            onCancelEdit={onCancelEdit}
            onRegenerateMessage={onRegenerateMessage}
            onRetryMessage={onRetryMessage}
            onOpenReasoning={onOpenReasoning}
            onApprovalAnswer={onApprovalAnswer}
          />
          {/* Thinking / "Thought for" section — visible during and after thinking */}
          {isStreaming && streamingReasoning && (
            <div key="thinking" className="animate-chat-enter">
              <div className={cx('pt-3', !flush && 'sm:px-4')}>
                <Reasoning
                  label={
                    <ThinkingLabel
                      startedAt={isThinking ? thinkingStartTime : undefined}
                      finalDuration={finalThinkingDuration}
                    />
                  }
                  shimmer={isThinking}
                  open={reasoningOpen}
                  onOpenChange={setReasoningOpen}
                  onOpenPanel={
                    onOpenReasoning &&
                    (() => onOpenReasoning(streamingReasoning, finalThinkingDuration))
                  }
                  // While thinking, its tail, faded at the top, so the work shows without taking the page.
                  preview={
                    isThinking && (
                      <ReasoningBody className="chat-reasoning-tail">
                        <div ref={reasoningScrollRef} className="max-h-20 overflow-y-hidden">
                          <Markdown isStreaming>{streamingReasoning}</Markdown>
                        </div>
                      </ReasoningBody>
                    )
                  }
                >
                  <Markdown isStreaming={isThinking}>{streamingReasoning}</Markdown>
                </Reasoning>
              </div>
            </div>
          )}
          {/* Tool calls and other parts streamed this turn, between the
                thinking header and the answer — mirrors the stored-message
                layout where parts precede content. */}
          {isStreaming && streamingParts.length > 0 && (
            <div
              key="streaming-parts"
              className={cx('animate-chat-enter py-1', !flush && 'sm:px-4')}
            >
              <AgentMessageParts message={streamingPartsMessage} isStreaming={isStreaming} />
            </div>
          )}
          {/* Working indicator — until the answer starts streaming */}
          {showWorkingIndicator && (
            <div key="waiting" className="animate-chat-enter">
              <div className={cx('py-3', !flush && 'sm:px-4')}>
                <div className="animate-shimmer text-shimmer text-sm">{tThinking.ellipsis}</div>
              </div>
            </div>
          )}
          {streamingMessage && (
            <div key="streaming" className="animate-chat-enter">
              <ChatMessage
                message={streamingMessage}
                allMessages={allMessages}
                flush={flush}
                foldEveryRun={foldEveryRun}
                isStreaming={isStreaming}
                attachmentDownloadUrl={attachmentDownloadUrl}
                onOpenAttachment={onOpenAttachment}
                onApprovalAnswer={onApprovalAnswer}
              />
            </div>
          )}
          {queuedMessages?.map((msg) => {
            const removable = canRemoveQueued?.(msg.id) ?? true
            const status = !removable
              ? strings.queue.handedOver
              : (typeof queueDelivery === 'function' ? queueDelivery(msg.id) : queueDelivery) ===
                  'nextStep'
                ? strings.queue.waitingNextStep
                : strings.queue.waiting
            return (
              // Waiting, not faded: full-contrast text in an outline rather than
              // a filled bubble, with a line saying when it reaches the model.
              // One already handed to the running turn is sent, so it is filled.
              <div key={msg.id} className={cx('animate-chat-enter', removable && 'chat-queued')}>
                <ChatMessage
                  message={msg}
                  allMessages={allMessages}
                  flush={flush}
                  attachmentDownloadUrl={attachmentDownloadUrl}
                  onOpenAttachment={onOpenAttachment}
                />
                <div
                  data-testid="queued-status"
                  className={cx(
                    '-mt-4 mb-2 flex items-center justify-end gap-2 text-xs theme-muted-text',
                    !flush && 'sm:px-4',
                  )}
                >
                  {removable ? (
                    <ClockIcon className="h-3 w-3" />
                  ) : (
                    <CheckIcon className="h-3 w-3" />
                  )}
                  <span>{status}</span>
                  {onRemoveQueued && removable && (
                    <>
                      <span aria-hidden="true">·</span>
                      <button
                        type="button"
                        aria-label={strings.queue.remove}
                        onClick={() => onRemoveQueued(msg.id)}
                        className="rounded font-medium underline-offset-2 hover:theme-text hover:underline"
                      >
                        {common.remove}
                      </button>
                    </>
                  )}
                </div>
              </div>
            )
          })}
          {footer}
          <div className="h-8" />
        </div>
      </div>
      {!pinned && !inputElement && (
        <div className="sticky bottom-4 z-10 flex h-0 items-start justify-center overflow-visible">
          <button
            type="button"
            onClick={jumpToLatest}
            className={cx(jumpClasses, '-translate-y-full')}
          >
            {strings.chrome.jumpToLatest}
          </button>
        </div>
      )}
      {dock}
    </div>
  )

  if (!pinPrompt) {
    return list
  }
  // The pin lies over the log rather than in it, so its coming and going is
  // not announced as a new message. It comes first so the tab order meets it
  // where it shows, at the top.
  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      {anchor && pinnedText && (
        <PinnedPrompt
          text={pinnedText}
          label={strings.thread.jumpToPrompt(pinnedText)}
          gutter={gutter}
          flush={flush}
          onJump={jumpToPrompt}
        />
      )}
      {list}
    </div>
  )
}

/** The prompt whose turn the top of the view is in, once all of it has
 *  scrolled above; null while any of it still shows. A prompt at the very top
 *  edge opens the turn in view, so the one before it is not pinned. */
function promptAbove(container: HTMLElement): string | null {
  const top = container.getBoundingClientRect().top
  const prompts = [...container.querySelectorAll<HTMLElement>('[data-prompt]')]
  for (const row of prompts.reverse()) {
    if (row.getBoundingClientRect().top <= top + 1) {
      const bubble = row.querySelector('.chat-bubble-user') ?? row
      return bubble.getBoundingClientRect().bottom <= top ? (row.dataset['prompt'] ?? null) : null
    }
  }
  return null
}

/** The prompt's first line, marked when more follows, as the terminal pins it. */
function promptLine(message: Message | undefined): string {
  const [head = '', ...rest] = (message?.content ?? '').trim().split('\n')
  return rest.some((line) => line.trim()) ? `${head}…` : head
}

/** Floats over the thread like the jump pill, with its edge, shadow and focus
 *  ring, in the wash of the reader's own bubble. */
function PinnedPrompt({
  text,
  label,
  gutter,
  flush,
  onJump,
}: {
  text: string
  label: string
  gutter: number
  flush: boolean | undefined
  onJump: () => void
}) {
  return (
    <div
      className="chat-prompt-pin pointer-events-none absolute inset-x-0 top-0 z-20"
      style={{ right: gutter }}
    >
      <div
        className={cx(
          'mx-auto flex w-full max-w-[var(--chat-column,50rem)] justify-end px-4 py-2',
          !flush && 'sm:px-8',
        )}
      >
        <button
          type="button"
          aria-label={label}
          onClick={onJump}
          className="chat-composer pointer-events-auto flex min-w-0 max-w-[80%] cursor-pointer items-center rounded-full px-4 py-1.5 text-sm leading-5 chat-ink"
        >
          <span className="min-w-0 truncate">{text}</span>
        </button>
      </div>
    </div>
  )
}

function prefersReducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
}

/** "Thinking (12s)" while it thinks, then how long it took. Its own component,
 *  so the clock re-renders only this label, not the list. */
function ThinkingLabel({
  startedAt,
  finalDuration,
}: {
  /** When the thinking under way began; unset once it ends. */
  startedAt: number | null | undefined
  /** How long it took, in milliseconds, once it has ended. */
  finalDuration: number | null
}) {
  const t = useChatConfig().strings.thinking
  const elapsed = useElapsed(startedAt)
  if (startedAt) {
    return elapsed ? `${t.label} (${formatDuration(elapsed)})` : t.ellipsis
  }
  return t.thoughtFor(formatDuration(finalDuration ?? 0))
}

// The list's optional props arrive here as possibly undefined.
type Passed<T> = { [K in keyof T]-?: T[K] | undefined }

type MessageRowsProps = Pick<ChatMessageListProps, 'messages' | 'allMessages'> &
  Passed<
    Pick<
      ChatMessageListProps,
      | 'messages'
      | 'allMessages'
      | 'flush'
      | 'foldEveryRun'
      | 'editingMessageId'
      | 'showAuthor'
      | 'currentUsername'
      | 'onNavigateBranch'
      | 'onEditMessage'
      | 'onSaveEdit'
      | 'onCancelEdit'
      | 'onRegenerateMessage'
      | 'onRetryMessage'
      | 'onOpenReasoning'
      | 'onApprovalAnswer'
    >
  > & {
    /** A reply is being written below these, so none of them is the latest. */
    streaming: boolean
    /** Marks each prompt for the pin to find and return to. */
    prompts: boolean
    attachmentDownloadUrl: ((id: string) => string) | undefined
    onOpenAttachment: ComponentProps<typeof ChatMessage>['onOpenAttachment']
  }

/** The conversation so far. Memoized apart from the list, which re-renders
 *  for every streamed token, so a long conversation is not walked per token. */
const MessageRows = memo(function MessageRows({
  messages,
  allMessages,
  streaming,
  prompts,
  flush,
  foldEveryRun,
  editingMessageId,
  showAuthor,
  currentUsername,
  attachmentDownloadUrl,
  onOpenAttachment,
  onNavigateBranch,
  onEditMessage,
  onSaveEdit,
  onCancelEdit,
  onRegenerateMessage,
  onRetryMessage,
  onOpenReasoning,
  onApprovalAnswer,
}: MessageRowsProps) {
  // Rows enter with a short animation only when they are appended to what
  // was already on screen; a conversation loaded or switched to appears at
  // once. The ids shown at the last commit decide it, read here and written
  // after commit, so a render React repeats or discards changes nothing.
  const shownRef = useRef<ReadonlySet<string>>(new Set())
  const wasStreamingRef = useRef(streaming)
  const shown = shownRef.current
  const appended = shown.size > 0 && messages.some((m) => shown.has(m.id))
  // The reply that just finished streaming was already on screen as the
  // streaming row; it takes that row's place without entering again.
  const streamFinished = wasStreamingRef.current && !streaming
  useLayoutEffect(() => {
    shownRef.current = new Set(messages.map((m) => m.id))
    wasStreamingRef.current = streaming
  }, [messages, streaming])

  // Pseudo messages render nothing, so the latest is the last one that shows.
  const lastIndex = messages.findLastIndex((m) => !m.pseudo)
  return messages.map((message, i) => {
    // Recorded blocks flagged by an agent adapter are not the human
    // speaking; unflagged messages are untouched.
    if (message.pseudo) {
      return null
    }
    const isNew =
      appended && !shown.has(message.id) && !(streamFinished && message.role === 'assistant')
    // Every prompt marks its turn, text or not: a turn opened by a picture
    // alone hides the pin rather than leaving the previous turn's prompt there.
    const prompt = prompts && message.role === 'user'
    return (
      <div
        key={message.id}
        className={cx(isNew && 'animate-chat-enter', prompt && 'outline-none') || undefined}
        {...(prompt ? { 'data-prompt': message.id, tabIndex: -1 } : {})}
      >
        <ChatMessage
          message={message}
          allMessages={allMessages}
          flush={flush}
          foldEveryRun={foldEveryRun}
          latest={i === lastIndex && !streaming}
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
  })
})
