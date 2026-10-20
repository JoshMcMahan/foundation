import { DateTime } from 'luxon'
import { type KeyboardEvent, memo, useEffect, useRef, useState } from 'react'
import { Avatar } from '../../components/Avatar'
import { Button } from '../../components/Button'
import { Callout } from '../../components/Callout'
import { CopyButton } from '../../components/CopyButton'
import { IconButton } from '../../components/IconButton'
import { useStrings } from '../../components/Provider'
import { RelativeTime } from '../../components/relativeTime'
import { cx } from '../../cx'
import { formatDuration } from '../../format'
import { EditIcon, RetryIcon } from '../../icons'
import { useChatConfig } from '../core/config'
import { replyText } from '../core/useKeyboardShortcuts'
import type { ApprovalAnswerValue, AttachmentRef, ChatUser, ChatMessage as Message } from '../types'
import Markdown from '../ui/Markdown'
import { chatProseClasses } from '../ui/prose'
import AgentMessageParts from './agent/AgentMessageParts'
import BranchNavigator from './BranchNavigator'
import MessageAttachments from './MessageAttachments'
import { UserMessageText } from './PastedText'
import { Reasoning } from './Reasoning'

interface ChatMessageProps {
  message: Message
  allMessages: Message[]
  isStreaming?: boolean
  /** The thread's newest message: a long reply stays open, so opening a chat ends on its last line. */
  latest?: boolean | undefined
  isEditing?: boolean
  showAuthor?: boolean | undefined
  currentUsername?: string | undefined
  // Stable callback (not read from context: a context read here would defeat
  // the memo below and re-render every message on each streamed token).
  attachmentDownloadUrl?: ((id: string) => string) | undefined
  onOpenAttachment?: ((attachment: AttachmentRef) => void) | undefined
  onNavigateBranch?: ((messageId: string) => void) | undefined
  onEdit?: ((messageId: string) => void) | undefined
  onSaveEdit?: ((messageId: string, content: string) => void) | undefined
  onCancelEdit?: (() => void) | undefined
  onRegenerate?: ((messageId: string) => void) | undefined
  onRetry?: ((messageId: string) => void) | undefined
  onOpenReasoning?: ((reasoning: string, duration: number | null) => void) | undefined
  onApprovalAnswer?: ((id: string, answer: ApprovalAnswerValue) => void) | undefined
  /** Drops the row's horizontal padding, for hosts that constrain the column themselves. */
  flush?: boolean | undefined
}

/** A message action: the chat's square, tinted from the ink on hover. */
const actionClasses = 'size-7 hover:not-disabled:not-aria-disabled:chat-tint'

// Threshold sits above the CSS clamp height (600px) so borderline messages
// don't grow a "Show more" for a few hidden pixels.
const COLLAPSE_THRESHOLD = 680

function parseTimestamp(iso: string | undefined): DateTime | null {
  if (!iso) {
    return null
  }
  const dt = DateTime.fromISO(iso)
  return dt.isValid ? dt : null
}

function ChatMessage({
  message,
  allMessages,
  isStreaming = false,
  latest = false,
  isEditing = false,
  showAuthor = false,
  currentUsername,
  attachmentDownloadUrl,
  onOpenAttachment,
  onNavigateBranch,
  onEdit,
  onSaveEdit,
  onCancelEdit,
  onRegenerate,
  onRetry,
  onOpenReasoning,
  onApprovalAnswer,
  flush,
}: ChatMessageProps) {
  const isUser = message.role === 'user'
  const isTool = message.role === 'tool'
  // A user message from someone else should be left-aligned
  const otherAuthor =
    isUser &&
    showAuthor &&
    message.author &&
    currentUsername &&
    message.author.username !== currentUsername
      ? message.author
      : undefined
  const isOtherUser = !!otherAuthor
  // A reply in a turn someone else started: its tools ran with their access,
  // and only they may answer a call waiting for approval.
  const asker =
    !isUser && showAuthor && currentUsername ? turnAuthor(message, allMessages) : undefined
  const otherAsker = asker && asker.username !== currentUsername ? asker : undefined
  const askerName = otherAsker ? otherAsker.name || otherAsker.username : undefined
  const partsMessage = askerName ? waitingOn(message, askerName) : message
  const approvalAnswer = askerName ? undefined : onApprovalAnswer
  // Right-align only for the current user's messages
  const isRightAligned = isUser && !isOtherUser
  const hasError = !!message.error
  const hasPastes = !!message.pastes?.length
  const hasReasoning = !!message.reasoning
  const toolCallCount = message.parts?.filter((p) => p.kind === 'tool_call').length ?? 0
  const showReasoningButton = !isUser && !isStreaming && hasReasoning
  const showTurnDurationLabel =
    !isUser && !isStreaming && !hasReasoning && (!!message.reasoningDuration || toolCallCount > 0)

  const { messageMeta: t, thinking: tThinking } = useChatConfig().strings
  const { common } = useStrings()
  const [editContent, setEditContent] = useState(message.content || '')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const [collapsible, setCollapsible] = useState(false)
  const [expanded, setExpanded] = useState(false)
  // Only without a host handler: a host that passes one shows reasoning itself.
  const [reasoningOpen, setReasoningOpen] = useState(false)

  // Long finished assistant replies clamp with a fade; streaming replies never
  // clamp so the tail stays readable while it grows, and the latest reply never
  // clamps so the thread, scrolled to its end, ends on the answer's last line.
  useEffect(() => {
    if (isUser || isStreaming || !contentRef.current) {
      return
    }
    const el = contentRef.current
    const measure = () => setCollapsible(el.scrollHeight > COLLAPSE_THRESHOLD)
    measure()
    if (typeof ResizeObserver === 'undefined') {
      return
    }
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [isUser, isStreaming])

  // Focus and select text when entering edit mode
  useEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.focus()
      textareaRef.current.select()
      // Auto-resize up to max height
      const maxHeight = 200
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, maxHeight)}px`
    }
  }, [isEditing])

  // Reset edit content when message changes or edit mode is canceled
  useEffect(() => {
    if (!isEditing) {
      setEditContent(message.content || '')
    }
  }, [isEditing, message.content])

  const handleSave = () => {
    if (editContent.trim() && onSaveEdit) {
      onSaveEdit(message.id, editContent.trim())
    }
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSave()
    } else if (e.key === 'Escape') {
      onCancelEdit?.()
    }
  }

  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setEditContent(e.target.value)
    // Auto-resize up to max height
    e.target.style.height = 'auto'
    const maxHeight = 200
    e.target.style.height = `${Math.min(e.target.scrollHeight, maxHeight)}px`
  }

  // Agent transcripts carry their whole timeline (text included) in parts and
  // no flat content; they render as the parts timeline alone, and the
  // flat-path hiding below never applies to them. A chat message with both
  // parts and content (tool calls made on the way to a normal answer) falls
  // through and renders the parts above its content with the usual chrome.
  const timestamp = parseTimestamp(message.timestamp)
  const totalTokens = message.tokensUsed?.total_tokens
  const meta = (timestamp || (!isUser && (message.model || totalTokens))) && (
    <span
      className={cx(
        'chat-meta flex items-center gap-2 ml-2 text-xs tabular-nums theme-muted-text transition-opacity duration-150 select-none',
        'opacity-0 group-focus-within:opacity-100 group-hover:opacity-100',
      )}
    >
      <RelativeTime value={timestamp} />
      {!isUser && message.model && <span>{message.model}</span>}
      {!isUser && totalTokens ? (
        <span
          title={
            message.tokensUsed?.prompt_tokens !== undefined &&
            message.tokensUsed?.completion_tokens !== undefined
              ? t.tokensBreakdown(
                  message.tokensUsed.prompt_tokens,
                  message.tokensUsed.completion_tokens,
                )
              : undefined
          }
        >
          {t.tokens(totalTokens)}
        </span>
      ) : null}
    </span>
  )

  const hasParts = !!message.parts?.length
  if (hasParts && !message.content) {
    const said = replyText(message)
    return (
      <div className={cx('group py-3 w-full', !flush && 'px-4')}>
        <AgentMessageParts
          message={partsMessage}
          isStreaming={isStreaming}
          onApprovalAnswer={approvalAnswer}
        />
        {!isUser && !isStreaming && (said || onRegenerate || meta) && (
          <div className="chat-actions -ml-1.5 mt-2 flex items-center gap-0.5">
            {said && (
              <CopyButton
                text={said}
                label={t.copyLabel}
                quiet
                size="md"
                className={actionClasses}
              />
            )}
            {onRegenerate && (
              <IconButton
                label={t.regenerate}
                onClick={() => onRegenerate(message.id)}
                size="md"
                className={actionClasses}
                icon={<RetryIcon />}
              />
            )}
            {onNavigateBranch && (
              <BranchNavigator
                messages={allMessages}
                currentMessageId={message.id}
                onNavigate={onNavigateBranch}
              />
            )}
            {meta}
          </div>
        )}
      </div>
    )
  }

  // Hide tool result messages - they're internal to the tool calling flow
  if (isTool) {
    return null
  }

  // Hide assistant messages that only have tool calls but no content
  // (these are intermediate messages before the final response)
  if (!isUser && !message.content && message.toolCalls?.length) {
    return null
  }

  const collapsed = !isUser && collapsible && !expanded && !isStreaming && !latest

  return (
    <div
      role="none"
      // A question opens a new turn, so it takes the larger space above it;
      // the room below it holds its hover actions clear of the reply.
      className={cx('group w-full', isUser ? 'pt-8 pb-5' : 'py-3', !flush && 'px-4')}
    >
      {/* Editing mode - full width container */}
      {isEditing ? (
        <div className="w-full">
          <textarea
            ref={textareaRef}
            value={editContent}
            onChange={handleTextareaChange}
            onKeyDown={handleKeyDown}
            className="chat-composer block w-full min-h-[100px] max-h-[200px] overflow-y-auto px-4 py-3.5 rounded-[1.25rem] bg-(--theme-panel-bg) theme-text text-[1rem] leading-relaxed resize-none focus:outline-none"
            placeholder={t.editPlaceholder}
            aria-label={t.edit}
          />
          <div className="flex items-center justify-end gap-2 mt-2.5">
            <button
              type="button"
              onClick={onCancelEdit}
              className="px-4 py-1.5 text-sm font-medium rounded-full transition-colors chat-tint hover:chat-tint-strong text-(--theme-app)"
            >
              {common.cancel}
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={!editContent.trim()}
              className="px-4 py-1.5 text-sm font-medium rounded-full transition-colors hover:opacity-85 disabled:opacity-50 disabled:cursor-not-allowed bg-(--theme-app) text-(--theme-panel-bg)"
            >
              {common.send}
            </button>
          </div>
        </div>
      ) : (
        <div className={cx('flex gap-3 w-full', isRightAligned ? 'flex-row-reverse' : 'flex-row')}>
          {/* Content */}
          <div
            className={cx(
              'flex-1 min-w-0 space-y-1',
              isRightAligned && 'relative flex flex-col items-end',
            )}
          >
            {/* Reasoning/Thinking section - shows for assistant messages with
                reasoning, a bare duration, or tool-call work */}
            {showReasoningButton && (
              <div className="mb-2">
                <Reasoning
                  label={
                    message.reasoningDuration
                      ? tThinking.thoughtFor(formatDuration(message.reasoningDuration))
                      : tThinking.thoughtProcess
                  }
                  open={reasoningOpen}
                  onOpenChange={setReasoningOpen}
                  onOpenPanel={
                    onOpenReasoning &&
                    (() =>
                      onOpenReasoning(message.reasoning || '', message.reasoningDuration ?? null))
                  }
                >
                  <Markdown>{message.reasoning || ''}</Markdown>
                </Reasoning>
              </div>
            )}
            {showTurnDurationLabel && (
              <div className="mb-2">
                <div className="flex items-center gap-x-1.5 text-sm theme-muted-text">
                  <span>
                    {message.reasoningDuration
                      ? tThinking.thoughtFor(formatDuration(message.reasoningDuration))
                      : askerName
                        ? tThinking.ranToolCallsAs(toolCallCount, askerName)
                        : tThinking.ranToolCalls(toolCallCount)}
                  </span>
                </div>
              </div>
            )}

            {/* Tool calls and other parts made on the way to this answer */}
            {!isUser && hasParts && (
              <div className="mb-1">
                <AgentMessageParts
                  message={partsMessage}
                  isStreaming={isStreaming}
                  onApprovalAnswer={approvalAnswer}
                />
              </div>
            )}

            {/* Author name above message (other users only) */}
            {otherAuthor && (
              <span className="text-xs theme-muted-text">
                {otherAuthor.name || otherAuthor.username}
              </span>
            )}

            {/* Message Content */}
            {message.content ? (
              otherAuthor ? (
                <div className="flex items-end gap-2">
                  <Avatar
                    src={otherAuthor.avatarUrl}
                    name={otherAuthor.name || otherAuthor.username}
                    size="sm"
                    className="mb-0.5"
                  />
                  <div
                    className={cx(
                      'px-4 py-2.5 chat-ink rounded-[1.25rem] max-w-[80%] inline-block whitespace-pre-wrap wrap-break-word text-[1rem] leading-6 chat-tint',
                      hasPastes && 'chat-bubble-roomy',
                    )}
                  >
                    <UserMessageText content={message.content} pastes={message.pastes} />
                  </div>
                </div>
              ) : isUser ? (
                <div
                  className={cx(
                    'px-4 py-2.5 chat-ink rounded-[1.25rem] max-w-[80%] inline-block whitespace-pre-wrap wrap-break-word text-[1rem] leading-6 chat-bubble-user',
                    hasPastes && 'chat-bubble-roomy',
                  )}
                >
                  <UserMessageText content={message.content} pastes={message.pastes} />
                </div>
              ) : (
                <div
                  ref={contentRef}
                  className={cx(chatProseClasses, collapsed && 'chat-message-clamp')}
                >
                  <Markdown isStreaming={isStreaming}>{message.content}</Markdown>
                </div>
              )
            ) : null}

            {!isUser && collapsible && !isStreaming && !latest && (
              <button
                type="button"
                onClick={() => setExpanded((e) => !e)}
                className="text-xs font-medium theme-muted-text hover:theme-text transition-colors"
              >
                {expanded ? common.showLess : common.showMore}
              </button>
            )}

            {message.stopped && !isStreaming && (
              <span className="inline-flex items-center mt-1 text-[11px] italic theme-muted-text">
                {t.stopped}
              </span>
            )}

            {/* Error Display */}
            {hasError && (
              <Callout
                tone="error"
                size="sm"
                className="mt-2"
                action={
                  onRetry && (
                    <Button size="sm" variant="outline" onClick={() => onRetry(message.id)}>
                      <RetryIcon />
                      {common.retry}
                    </Button>
                  )
                }
              >
                {message.error}
              </Callout>
            )}

            {message.attachments && message.attachments.length > 0 && (
              <MessageAttachments
                attachments={message.attachments}
                downloadUrl={attachmentDownloadUrl}
                onOpen={onOpenAttachment}
                className={isRightAligned ? 'justify-end' : undefined}
              />
            )}

            {/* Actions */}
            {!isStreaming && !isEditing && (
              <div
                className={cx(
                  'chat-actions flex items-center gap-0.5 transition-opacity duration-150',
                  isRightAligned ? 'absolute right-0 top-full -mr-1.5 mt-0.5' : '-ml-1.5 mt-2',
                  // Shown while the pointer or focus is in the message, in CSS
                  // so a passing pointer re-renders nothing.
                  isRightAligned &&
                    'pointer-events-none opacity-0 group-focus-within:pointer-events-auto group-focus-within:opacity-100 group-hover:pointer-events-auto group-hover:opacity-100',
                )}
              >
                {/* Copy */}
                {message.content && (
                  <CopyButton
                    text={message.content ?? ''}
                    label={t.copyLabel}
                    quiet
                    size="md"
                    className={actionClasses}
                  />
                )}

                {/* Edit (current user's messages only) */}
                {isUser && !isOtherUser && onEdit && (
                  <IconButton
                    label={t.edit}
                    onClick={() => onEdit(message.id)}
                    size="md"
                    className={actionClasses}
                    icon={<EditIcon />}
                  />
                )}

                {/* Regenerate (assistant messages only) */}
                {!isUser && onRegenerate && (
                  <IconButton
                    label={t.regenerate}
                    onClick={() => onRegenerate(message.id)}
                    size="md"
                    className={actionClasses}
                    icon={<RetryIcon />}
                  />
                )}

                {/* Branch Navigator (assistant messages only) */}
                {!isUser && onNavigateBranch && (
                  <BranchNavigator
                    messages={allMessages}
                    currentMessageId={message.id}
                    onNavigate={onNavigateBranch}
                  />
                )}

                {meta}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default memo(ChatMessage)

/** The author of the user message that started the turn a reply belongs to.
 *  A reply that resumes after an approval hangs under the reply it resumes. */
function turnAuthor(message: Message, allMessages: Message[]): ChatUser | undefined {
  let parentId = message.parentId
  // Bounded, so a malformed chain that loops cannot hang the render.
  for (let hops = 0; parentId && hops < allMessages.length; hops++) {
    const parent = allMessages.find((m) => m.id === parentId)
    if (parent?.role !== 'assistant') {
      return parent?.role === 'user' ? parent.author : undefined
    }
    parentId = parent.parentId
  }
  return undefined
}

function waitingOn(message: Message, name: string): Message {
  if (!message.parts?.some((p) => p.kind === 'approval')) {
    return message
  }
  return {
    ...message,
    parts: message.parts.map((p) => (p.kind === 'approval' ? { ...p, waitingOn: name } : p)),
  }
}
