import cx from 'classnames'
import {
  type ClipboardEvent,
  forwardRef,
  type KeyboardEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react'
import { ArrowUpIcon, AttachmentIcon, StopSolidIcon } from '../../icons'
import { useChat } from '../core/ChatProvider'
import { useChatConfig } from '../core/config'
import useDragDrop from '../core/useDragDrop'
import type { AttachmentMeta, MessagePaste } from '../types'
import AttachmentUpload, { type Attachment, type AttachmentUploadHandle } from './AttachmentUpload'
import { ComposerContext, ComposerSettings } from './ComposerChrome'
import DragOverlay from './DragOverlay'
import { PasteFileCard } from './PastedText'
import { SlashMenu, type SlashMenuConfig, useSlashMenu } from './SlashMenu'
import { type ComposerPastes, usePasteCards } from './usePasteCards'

const DRAFT_STORAGE_PREFIX = 'aiChatDraft:'
// Beyond this a draft is likely pasted bulk content; persisting it risks
// blowing the storage quota shared with the rest of the app.
const DRAFT_MAX_LENGTH = 10_000

function draftKey(conversationId?: string): string {
  return `${DRAFT_STORAGE_PREFIX}${conversationId ?? 'new'}`
}

function readDraft(conversationId?: string): string {
  try {
    return window.localStorage.getItem(draftKey(conversationId)) ?? ''
  } catch {
    return ''
  }
}

function storeDraft(conversationId: string | undefined, text: string) {
  try {
    if (!text || text.length > DRAFT_MAX_LENGTH) {
      window.localStorage.removeItem(draftKey(conversationId))
    } else {
      window.localStorage.setItem(draftKey(conversationId), text)
    }
  } catch {
    // Storage unavailable (SSR, disabled storage): drafts simply don't persist.
  }
}

function clearDraft(conversationId?: string) {
  try {
    window.localStorage.removeItem(draftKey(conversationId))
  } catch {
    // Storage unavailable: nothing to clear.
  }
}

interface ChatInputProps {
  onSend: (
    content: string,
    attachmentIds?: string[],
    attachmentMeta?: AttachmentMeta,
    pastes?: MessagePaste[],
  ) => void
  disabled?: boolean
  placeholder?: string | undefined
  conversationId?: string
  onEditLastMessage?: () => void
  /** Only the box: no page padding, width cap, or settings row, for a host
   *  that lays out its own controls around it. */
  flush?: boolean
  /** Send with nothing typed, for a surface where the text is optional. */
  allowEmpty?: boolean
  /** Attach, paste, and drop files. Off for a target that takes text only. */
  attachments?: boolean
  /** Hold sending until the provider's selected model is one it can serve.
   *  Off when the target picks its own model. */
  requireModel?: boolean
  inputLabel?: string
  sendLabel?: string
  sendTestId?: string
  /** Offers the host's slash commands as the input starts with /. */
  slash?: SlashMenuConfig | undefined
  /** Pills naming where the turn runs, rendered above the input. */
  context?: ReactNode
  settingsLeft?: ReactNode
  settingsRight?: ReactNode
  /** A turn the chat provider does not run, such as an agent session's: it
   *  drives the Stop button in place of the provider's stream and queue. */
  turn?: { running: boolean; onStop: () => void; stopping?: boolean }
  pastes?: ComposerPastes | undefined
}

export interface ChatInputHandle {
  addFiles: (files: FileList | File[]) => void
  focus: () => void
}

/** An optional box that is still empty should not wear the filled look of
 *  one waiting to send something. */
function sendability({
  hasText,
  canFlushQueue,
  allowEmpty,
  disabled,
  modelReady,
  pendingCount,
}: {
  hasText: boolean
  canFlushQueue: boolean
  allowEmpty: boolean
  disabled: boolean
  modelReady: boolean
  pendingCount: number
}): { canSend: boolean; emphasised: boolean } {
  const canSend =
    (hasText || canFlushQueue || allowEmpty) && !disabled && modelReady && pendingCount === 0
  return { canSend, emphasised: canSend && (hasText || !allowEmpty) }
}

function keyAction(
  e: KeyboardEvent<HTMLTextAreaElement>,
  empty: boolean,
  canEditLast: boolean,
): 'send' | 'editLast' | null {
  if (e.key === 'Enter' && !e.shiftKey) {
    return 'send'
  }
  if (e.key === 'ArrowUp' && empty && canEditLast) {
    return 'editLast'
  }
  return null
}

function AttachButton({
  open,
  disabled,
  label,
  onClick,
}: {
  open: boolean
  disabled: boolean
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cx(
        'flex-shrink-0 p-3 ml-1 mb-1 rounded-xl transition-colors',
        open ? 'text-blue-600' : 'theme-muted-text hover:theme-text',
        'disabled:opacity-50 disabled:cursor-not-allowed',
      )}
      aria-label={label}
    >
      <AttachmentIcon className="h-5 w-5" />
    </button>
  )
}

function SendButton({
  onClick,
  enabled,
  emphasised,
  label,
  testId,
}: {
  onClick: () => void
  enabled: boolean
  emphasised: boolean
  label: string
  testId: string | undefined
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!enabled}
      data-testid={testId}
      className={cx(
        'p-2.5 rounded-xl transition-all duration-200',
        emphasised ? 'theme-element hover:opacity-90' : 'theme-muted-panel theme-muted-text',
        !enabled && 'cursor-not-allowed',
      )}
      aria-label={label}
      title={label}
    >
      <ArrowUpIcon className="h-4 w-4" />
    </button>
  )
}

/** A host-driven turn stands in for the provider's stream and queue. */
function streamControls(chat: ReturnType<typeof useChat>, turn: ChatInputProps['turn']) {
  if (turn) {
    return {
      isStreaming: turn.running,
      stopStreaming: turn.onStop,
      queuedCount: 0,
    }
  }
  return {
    isStreaming: chat.isStreaming,
    stopStreaming: chat.stopStreaming,
    queuedCount: chat.queuedMessages.length,
  }
}

const ChatInput = forwardRef<ChatInputHandle, ChatInputProps>(function ChatInput(
  {
    onSend,
    disabled = false,
    placeholder,
    conversationId,
    onEditLastMessage,
    flush = false,
    allowEmpty = false,
    attachments: attachmentsWanted = true,
    requireModel = true,
    inputLabel,
    sendLabel,
    sendTestId,
    slash,
    context,
    settingsLeft,
    settingsRight,
    turn,
    pastes,
  },
  ref,
) {
  const [input, setInput] = useState(() => readDraft(conversationId))
  const {
    cards,
    handleTextPaste,
    removeCard,
    takeCards,
    blocking: pastesBlocking,
  } = usePasteCards(pastes, input, (value) => {
    setInput(value)
    storeDraft(conversationId, value)
  })
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [showAttachments, setShowAttachments] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const attachmentUploadRef = useRef<AttachmentUploadHandle>(null)
  const chat = useChat()
  const { adapter, flushQueuedMessages, isSelectedModelAvailable } = chat
  const { isStreaming, stopStreaming, queuedCount } = streamControls(chat, turn)
  const t = useChatConfig().strings.input
  const effectivePlaceholder = placeholder ?? t.placeholder
  const attachmentsAvailable = attachmentsWanted && !!adapter.attachments

  // Expose addFiles and focus methods to parent
  useImperativeHandle(
    ref,
    () => ({
      addFiles: (files: FileList | File[]) => {
        setShowAttachments(true)
        setTimeout(() => {
          attachmentUploadRef.current?.addFiles(files)
        }, 0)
      },
      focus: () => {
        textareaRef.current?.focus()
      },
    }),
    [],
  )

  // Auto-resize textarea based on content
  // biome-ignore lint/correctness/useExhaustiveDependencies: input is needed to trigger resize
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`
    }
  }, [input])

  // Restore the draft when switching conversations; the initial mount is
  // covered by the useState initializer.
  const previousConversationRef = useRef(conversationId)
  useEffect(() => {
    if (previousConversationRef.current !== conversationId) {
      previousConversationRef.current = conversationId
      setInput(readDraft(conversationId))
      takeCards()
    }
  }, [conversationId, takeCards])

  const setInputAndPersist = (value: string) => {
    setInput(value)
    storeDraft(conversationId, value)
  }

  const uploadedCount = attachments.filter((a) => a.uploaded).length
  const pendingCount = attachments.length - uploadedCount
  // A queue held across a cancelled or failed turn can be sent on its own.
  const canFlushQueue = !isStreaming && queuedCount > 0 && !disabled
  const { canSend, emphasised } = sendability({
    hasText: input.trim().length > 0 || cards.length > 0,
    canFlushQueue,
    allowEmpty,
    disabled,
    modelReady: isSelectedModelAvailable || !requireModel,
    pendingCount: pendingCount + (pastesBlocking ? 1 : 0),
  })

  const handleSubmit = () => {
    if (!canSend) {
      return
    }
    if (!input.trim() && cards.length === 0 && canFlushQueue) {
      flushQueuedMessages()
      return
    }
    const attachmentIds: string[] = []
    const meta: AttachmentMeta = {}
    for (const a of attachments) {
      if (!a.uploaded || !a.id) {
        continue
      }
      attachmentIds.push(a.id)
      meta[a.id] = {
        filename: a.filename,
        contentType: a.mimeType,
        size: a.size,
      }
    }
    const sentPastes = takeCards()
    const content = [input.trim(), ...sentPastes.map((p) => p.placeholder)]
      .filter(Boolean)
      .join('\n\n')
    const ids = attachmentIds.length > 0 ? attachmentIds : undefined
    const attachmentMeta = attachmentIds.length > 0 ? meta : undefined
    if (sentPastes.length > 0) {
      onSend(content, ids, attachmentMeta, sentPastes)
    } else {
      onSend(content, ids, attachmentMeta)
    }
    setInput('')
    clearDraft(conversationId)
    setAttachments([])
    setShowAttachments(false)
  }

  const slashMenu = useSlashMenu(input, slash, setInputAndPersist)

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (slashMenu.handleKey(e)) {
      return
    }
    const action = keyAction(e, input.trim() === '', !!onEditLastMessage)
    if (action === 'send') {
      e.preventDefault()
      handleSubmit()
    } else if (action === 'editLast') {
      e.preventDefault()
      onEditLastMessage?.()
    }
  }

  const handleFilesDropped = useCallback((files: FileList | File[]) => {
    setShowAttachments(true)
    // Use setTimeout to ensure AttachmentUpload is mounted
    setTimeout(() => {
      attachmentUploadRef.current?.addFiles(files)
    }, 0)
  }, [])

  const handlePaste = (e: ClipboardEvent<HTMLTextAreaElement>) => {
    const files = Array.from(e.clipboardData?.files ?? [])
    if (attachmentsAvailable && files.length > 0) {
      e.preventDefault()
      handleFilesDropped(files)
      return
    }
    // Text too big to send inline becomes a card; the rest pastes as usual.
    if (pastes && handleTextPaste(e.clipboardData.getData('text/plain'))) {
      e.preventDefault()
    }
  }

  const { isDragging, dragHandlers } = useDragDrop({
    onFilesDropped: handleFilesDropped,
  })

  return (
    <div
      className={cx('relative', !flush && 'px-4 pb-6 pt-2 bg-(--theme-panel-bg)')}
      {...(attachmentsAvailable ? dragHandlers : {})}
    >
      {/* Drag overlay */}
      {isDragging && <DragOverlay className="rounded-2xl" />}
      <div className={cx(!flush && 'w-full max-w-[50rem] mx-auto px-4')}>
        {/* Attachment Upload Area */}
        {showAttachments && attachmentsAvailable && (
          <div className="mb-3 p-3 rounded-2xl border theme-border shadow-sm bg-(--theme-panel-bg)">
            <AttachmentUpload
              ref={attachmentUploadRef}
              conversationId={conversationId}
              attachments={attachments}
              onAttachmentsChange={setAttachments}
              maxFiles={10}
            />
          </div>
        )}

        {context && <ComposerContext>{context}</ComposerContext>}

        {cards.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-2" data-testid="composer-pastes">
            {cards.map((card) => (
              <PasteFileCard
                key={card.key}
                id={card.paste?.id}
                lines={card.lines}
                bytes={card.bytes}
                saving={!card.paste && !card.error}
                error={card.error}
                onRemove={() => removeCard(card.key)}
              />
            ))}
          </div>
        )}

        <div className="relative">
          {slash && slashMenu.open && (
            <SlashMenu
              label={slash.label}
              matches={slashMenu.matches}
              active={slashMenu.active}
              onChoose={(name) => {
                slashMenu.choose(name)
                textareaRef.current?.focus()
              }}
            />
          )}
          {/* Main Input Container */}
          <div
            className={cx(
              'relative flex items-end gap-2',
              'rounded-3xl border shadow-sm',
              'px-2 overflow-hidden',
              'transition-all duration-200',
              'focus-within:shadow-md',
              'theme-border',
              'bg-(--theme-panel-bg)',
            )}
          >
            {attachmentsAvailable && (
              <AttachButton
                open={showAttachments}
                disabled={disabled}
                label={t.attachFiles}
                onClick={() => setShowAttachments(!showAttachments)}
              />
            )}

            {/* Text Input with Send Button */}
            <div className="flex-1 relative max-h-[200px] overflow-y-auto">
              <div className="flex items-end">
                <textarea
                  ref={textareaRef}
                  value={input}
                  onChange={(e) => setInputAndPersist(e.target.value)}
                  onKeyDown={handleKeyDown}
                  onPaste={handlePaste}
                  placeholder={effectivePlaceholder}
                  aria-label={inputLabel}
                  disabled={disabled}
                  rows={1}
                  className={cx(
                    'theme-text',
                    'flex-1 resize-none py-3.5 px-2 pr-3',
                    'bg-transparent border-0',
                    'placeholder:theme-muted-text',
                    'focus:outline-none focus:ring-0',
                    'disabled:opacity-50 disabled:cursor-not-allowed',
                    'text-base leading-relaxed',
                    'overflow-hidden',
                  )}
                />
                {/* Send/Stop Button */}
                <div className="flex-shrink-0 p-1.5 mr-1 sticky bottom-1 flex items-center">
                  {isStreaming && !input.trim() ? (
                    <button
                      type="button"
                      onClick={stopStreaming}
                      disabled={turn?.stopping}
                      className={cx(
                        'p-2.5 rounded-xl',
                        'theme-muted-panel',
                        'hover:theme-hover',
                        'transition-colors',
                      )}
                      aria-label={t.stopGenerating}
                      title={t.stopGenerating}
                    >
                      <StopSolidIcon className="h-4 w-4" />
                    </button>
                  ) : (
                    <SendButton
                      onClick={handleSubmit}
                      enabled={canSend}
                      emphasised={emphasised}
                      label={sendLabel ?? t.sendMessage}
                      testId={sendTestId}
                    />
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {!flush && (
          <ComposerSettings
            left={
              <>
                {settingsLeft}
                {uploadedCount > 0 && (
                  <span className="text-[11px] theme-muted-text">
                    {t.filesAttached(uploadedCount)}
                  </span>
                )}
              </>
            }
          >
            {settingsRight}
          </ComposerSettings>
        )}
      </div>
    </div>
  )
})

export default ChatInput
