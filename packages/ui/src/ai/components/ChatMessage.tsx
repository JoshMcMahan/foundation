import cx from 'classnames'
import { DateTime, Duration } from 'luxon'
import { type KeyboardEvent, memo, useEffect, useRef, useState } from 'react'
import { durationToAbsHumanDuration } from '../../duration'
import {
  CheckIcon,
  ChevronRightIcon,
  CopyIcon,
  DownloadFileIcon,
  EditIcon,
  ErrorIcon,
  FileIcon,
  RefreshIcon,
  RetryIcon,
} from '../../icons'
import { safeUrl } from '../../safeUrl'
import { useChatConfig } from '../core/config'
import type { ApprovalAnswerValue, AttachmentRef, ChatMessage as Message } from '../types'
import { Avatar } from '../ui/Avatar'
import Markdown from '../ui/Markdown'
import { chatProseClasses } from '../ui/prose'
import { formatFileSize } from '../utils'
import AgentMessageParts from './agent/AgentMessageParts'
import BranchNavigator from './BranchNavigator'

interface ChatMessageProps {
  message: Message
  allMessages: Message[]
  isStreaming?: boolean
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

function formatDuration(ms: number | null | undefined): string {
  if (!ms) {
    return ''
  }
  return durationToAbsHumanDuration(Duration.fromMillis(ms))
}

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

function triggerDownload(url: string, filename: string) {
  const href = safeUrl(url)
  if (!href) {
    return
  }
  const a = document.createElement('a')
  a.href = href
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
}

function ChatMessage({
  message,
  allMessages,
  isStreaming = false,
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
  // Right-align only for the current user's messages
  const isRightAligned = isUser && !isOtherUser
  const hasError = !!message.error
  const hasReasoning = !!message.reasoning
  const toolCallCount = message.parts?.filter((p) => p.kind === 'tool_call').length ?? 0
  const showReasoningButton = !isUser && !isStreaming && hasReasoning
  const showTurnDurationLabel =
    !isUser && !isStreaming && !hasReasoning && (!!message.reasoningDuration || toolCallCount > 0)

  const t = useChatConfig().strings.messageMeta
  const [copied, setCopied] = useState(false)
  const [showActions, setShowActions] = useState(false)
  const [editContent, setEditContent] = useState(message.content || '')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const [collapsible, setCollapsible] = useState(false)
  const [expanded, setExpanded] = useState(false)

  // Long finished assistant replies clamp with a fade; streaming replies never
  // clamp so the tail stays readable while it grows.
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

  // Reset edit content when message changes or edit mode is cancelled
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
  const hasParts = !!message.parts?.length
  if (hasParts && !message.content) {
    return (
      <div className={cx('group py-5 w-full', !flush && 'px-4')}>
        <AgentMessageParts
          message={message}
          isStreaming={isStreaming}
          onApprovalAnswer={onApprovalAnswer}
        />
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

  const timestamp = parseTimestamp(message.timestamp)
  const totalTokens = message.tokensUsed?.total_tokens
  const collapsed = !isUser && collapsible && !expanded && !isStreaming

  const copyToClipboard = async () => {
    if (message.content) {
      await navigator.clipboard.writeText(message.content)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  return (
    <div
      role="none"
      className={cx('group py-5 w-full', !flush && 'px-4')}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
      onFocus={() => setShowActions(true)}
      onBlur={() => setShowActions(false)}
    >
      {/* Editing mode - full width container */}
      {isEditing ? (
        <div className="w-full">
          <textarea
            ref={textareaRef}
            value={editContent}
            onChange={handleTextareaChange}
            onKeyDown={handleKeyDown}
            className="w-full min-h-[100px] max-h-[200px] overflow-y-auto p-4 rounded-xl theme-input resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder={t.editPlaceholder}
          />
          <div className="flex items-center justify-end gap-2 mt-3">
            <button
              type="button"
              onClick={onCancelEdit}
              className="px-4 py-1.5 text-sm font-medium rounded-full transition-colors bg-(--theme-muted-panel-bg) text-(--theme-panel)"
            >
              {t.cancel}
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={!editContent.trim()}
              className="px-4 py-1.5 text-sm font-medium rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed bg-(--theme-panel) text-(--theme-panel-bg)"
            >
              {t.send}
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
                <button
                  type="button"
                  onClick={() =>
                    onOpenReasoning?.(message.reasoning || '', message.reasoningDuration ?? null)
                  }
                  className="flex items-center gap-x-1 text-sm theme-muted-text hover:theme-text transition-colors"
                >
                  <span>
                    {message.reasoningDuration
                      ? `Thought for ${formatDuration(message.reasoningDuration)}`
                      : 'Thought process'}
                  </span>
                  <ChevronRightIcon className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
            {showTurnDurationLabel && (
              <div className="mb-2">
                <div className="flex items-center gap-x-1.5 text-sm theme-muted-text">
                  <span>
                    {message.reasoningDuration
                      ? `Thought for ${formatDuration(message.reasoningDuration)}`
                      : `Ran ${toolCallCount} tool ${toolCallCount === 1 ? 'call' : 'calls'}`}
                  </span>
                </div>
              </div>
            )}

            {/* Tool calls and other parts made on the way to this answer */}
            {!isUser && hasParts && (
              <div className="mb-1">
                <AgentMessageParts
                  message={message}
                  isStreaming={isStreaming}
                  onApprovalAnswer={onApprovalAnswer}
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
                    src={otherAuthor.avatarUrl ?? undefined}
                    name={otherAuthor.name || otherAuthor.username}
                    className="flex-shrink-0 mb-0.5"
                  />
                  <div className="px-4 py-2.5 chat-ink rounded-2xl rounded-bl-md max-w-[70%] inline-block whitespace-pre-wrap text-base leading-6 bg-[color-mix(in_oklab,var(--theme-panel)_6%,transparent)]">
                    {message.content}
                  </div>
                </div>
              ) : isUser ? (
                <div className="px-4 py-2.5 chat-ink rounded-2xl rounded-br-md max-w-[70%] inline-block whitespace-pre-wrap text-base leading-6 bg-[color-mix(in_oklab,var(--theme-panel)_6%,transparent)]">
                  {message.content}
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

            {!isUser && collapsible && !isStreaming && (
              <button
                type="button"
                onClick={() => setExpanded((e) => !e)}
                className="text-xs font-medium theme-muted-text hover:theme-text transition-colors"
              >
                {expanded ? t.showLess : t.showMore}
              </button>
            )}

            {message.stopped && !isStreaming && (
              <span className="inline-flex items-center mt-1 text-[11px] italic theme-muted-text">
                {t.stopped}
              </span>
            )}

            {/* Error Display */}
            {hasError && (
              <div className="flex items-center gap-2 mt-2 p-3 rounded-lg bg-red-500/10 border border-red-500/30">
                <ErrorIcon className="w-4 h-4 text-red-600 flex-shrink-0" />
                <span className="text-sm text-red-700 flex-1">{message.error}</span>
                {onRetry && (
                  <button
                    type="button"
                    onClick={() => onRetry(message.id)}
                    className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-500/15 rounded transition-colors"
                  >
                    <RetryIcon className="w-3 h-3" />
                    {t.retry}
                  </button>
                )}
              </div>
            )}

            {/* Attachments */}
            {message.attachments && message.attachments.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {message.attachments.map((att) => {
                  const isImage = att.contentType?.startsWith('image/')
                  const downloadUrl =
                    att.id && attachmentDownloadUrl ? attachmentDownloadUrl(att.id) : undefined

                  if (isImage && downloadUrl) {
                    return (
                      <div
                        key={att.id}
                        className="block rounded-lg overflow-hidden border theme-border"
                        {...(onOpenAttachment
                          ? {
                              onClick: () => onOpenAttachment(att),
                              role: 'button' as const,
                              style: { cursor: 'pointer' },
                            }
                          : {})}
                      >
                        <img
                          src={downloadUrl}
                          alt={att.filename || 'Image attachment'}
                          className="max-w-[200px] max-h-[200px] object-cover"
                          loading="lazy"
                        />
                      </div>
                    )
                  }

                  if (downloadUrl) {
                    return (
                      <button
                        key={att.id}
                        type="button"
                        onClick={() =>
                          onOpenAttachment
                            ? onOpenAttachment(att)
                            : triggerDownload(downloadUrl, att.filename || 'File')
                        }
                        className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg bg-(--theme-muted-panel-bg) hover:theme-hover transition-colors cursor-pointer"
                      >
                        <FileIcon className="w-3.5 h-3.5 flex-shrink-0" />
                        <span className="truncate max-w-[150px]">{att.filename || 'File'}</span>
                        {att.size ? (
                          <span className="theme-muted-text">({formatFileSize(att.size)})</span>
                        ) : null}
                        <DownloadFileIcon className="w-3 h-3 flex-shrink-0" />
                      </button>
                    )
                  }

                  return (
                    <div
                      key={att.id}
                      className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg bg-(--theme-muted-panel-bg) theme-muted-text"
                      {...(onOpenAttachment
                        ? {
                            onClick: () => onOpenAttachment(att),
                            role: 'button' as const,
                            style: { cursor: 'pointer' },
                          }
                        : {})}
                    >
                      <FileIcon className="w-3.5 h-3.5 flex-shrink-0" />
                      <span className="truncate max-w-[150px]">{att.filename || 'File'}</span>
                      {att.size ? (
                        <span className="theme-muted-text">({formatFileSize(att.size)})</span>
                      ) : null}
                    </div>
                  )
                })}
              </div>
            )}

            {/* Actions */}
            {!isStreaming && !isEditing && (
              <div
                className={cx(
                  'chat-actions flex items-center gap-0.5 transition-opacity duration-150',
                  isRightAligned ? 'absolute right-0 top-full -mr-1.5 mt-0.5' : '-ml-1.5 mt-2',
                  isRightAligned && (showActions ? 'opacity-100' : 'opacity-0 pointer-events-none'),
                )}
              >
                {/* Copy */}
                <button
                  type="button"
                  onClick={copyToClipboard}
                  className="p-1.5 rounded-lg hover:theme-hover theme-muted-text transition-colors"
                  title={t.copy}
                >
                  {copied ? (
                    <CheckIcon className="w-4 h-4 text-green-500" />
                  ) : (
                    <CopyIcon className="w-4 h-4" />
                  )}
                </button>

                {/* Edit (current user's messages only) */}
                {isUser && !isOtherUser && onEdit && (
                  <button
                    type="button"
                    onClick={() => onEdit(message.id)}
                    className="p-1.5 rounded-lg hover:theme-hover theme-muted-text transition-colors"
                    title={t.edit}
                  >
                    <EditIcon className="w-4 h-4" />
                  </button>
                )}

                {/* Regenerate (assistant messages only) */}
                {!isUser && onRegenerate && (
                  <button
                    type="button"
                    onClick={() => onRegenerate(message.id)}
                    className="p-1.5 rounded-lg hover:theme-hover theme-muted-text transition-colors"
                    title={t.regenerate}
                  >
                    <RefreshIcon className="w-4 h-4" />
                  </button>
                )}

                {/* Branch Navigator (assistant messages only) */}
                {!isUser && onNavigateBranch && (
                  <BranchNavigator
                    messages={allMessages}
                    currentMessageId={message.id}
                    onNavigate={onNavigateBranch}
                  />
                )}

                {/* Message metadata, hover-revealed alongside the actions */}
                {(timestamp || (!isUser && (message.model || totalTokens))) && (
                  <span
                    className={cx(
                      'chat-meta flex items-center gap-2 ml-2 text-[11px] theme-muted-text transition-opacity duration-150 select-none',
                      showActions ? 'opacity-100' : 'opacity-0',
                    )}
                  >
                    {timestamp && (
                      <span title={timestamp.toLocaleString(DateTime.DATETIME_MED_WITH_SECONDS)}>
                        {timestamp.toRelative()}
                      </span>
                    )}
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
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default memo(ChatMessage)
