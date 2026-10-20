import {
  type ClipboardEvent,
  type KeyboardEvent,
  type ReactNode,
  type Ref,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import { cx } from '../../cx'
import { ArrowUpIcon, StopIcon } from '../../icons'
import { useChat } from '../core/ChatProvider'
import { useChatConfig } from '../core/config'
import useDragDrop from '../core/useDragDrop'
import type { AttachmentMeta, MessagePaste } from '../types'
import AttachmentUpload, { type Attachment, type AttachmentUploadHandle } from './AttachmentUpload'
import ComposerAddMenu from './ComposerAddMenu'
import { ComposerContext, ComposerControls, ComposerSettings } from './ComposerChrome'
import { clearDraft, readDraft, storeDraft, sweepDrafts } from './chatDraft'
import DragOverlay from './DragOverlay'
import { PasteFileCard } from './PastedText'
import { SlashMenu, type SlashMenuConfig, useSlashMenu } from './SlashMenu'
import { type ComposerPastes, usePasteCards } from './usePasteCards'

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
  /** Cards above everything else, such as a warning about this turn. */
  notices?: ReactNode
  /** Sits where a terminal's spinner line would, just above the box. */
  activity?: ReactNode
  /** Pills naming where the turn runs, rendered above the input. */
  context?: ReactNode
  /** Keeps the row of pills above the box even with none, so the box sits
   *  where it does on a surface that has them. */
  reserveContext?: boolean
  /** Under the box, on the left. */
  settingsLeft?: ReactNode
  /** In the box beside send. Defaults to the model and allocation pickers. */
  settingsRight?: ReactNode
  /** One centered line under everything. */
  hint?: string | undefined
  /** A turn the chat provider does not run, such as an agent session's: it
   *  drives the Stop button in place of the provider's stream and queue. */
  turn?: { running: boolean; onStop: () => void; stopping?: boolean }
  /** False where the chat's tools do not apply, such as starting an agent
   *  session, which brings its own. */
  tools?: boolean
  pastes?: ComposerPastes | undefined
  ref?: Ref<ChatInputHandle> | undefined
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
}): { canSend: boolean; emphasized: boolean } {
  const canSend =
    (hasText || canFlushQueue || allowEmpty) && !disabled && modelReady && pendingCount === 0
  return { canSend, emphasized: canSend && (hasText || !allowEmpty) }
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

function SendButton({
  onClick,
  enabled,
  emphasized,
  label,
  testId,
}: {
  onClick: () => void
  enabled: boolean
  emphasized: boolean
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
        'flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full transition-[background-color,color,transform] duration-150 active:scale-95',
        emphasized ? 'theme-accent hover:opacity-90' : 'chat-send-idle',
        !enabled && 'cursor-not-allowed active:scale-100',
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

function fitToContent(el: HTMLTextAreaElement) {
  el.style.height = 'auto'
  el.style.height = `${el.scrollHeight}px`
}

let draftsSwept = false

export default function ChatInput({
  onSend,
  disabled = false,
  placeholder,
  conversationId,
  onEditLastMessage,
  allowEmpty = false,
  attachments: attachmentsWanted = true,
  requireModel = true,
  inputLabel,
  sendLabel,
  sendTestId,
  slash,
  notices,
  activity,
  context,
  reserveContext = false,
  settingsLeft,
  settingsRight = <ComposerControls />,
  hint,
  turn,
  tools: toolsAllowed = true,
  pastes,
  ref,
}: ChatInputProps) {
  const [input, setInput] = useState(() => readDraft(conversationId))
  useEffect(() => {
    if (!draftsSwept) {
      draftsSwept = true
      sweepDrafts()
    }
  }, [])
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
  const { adapter, flushQueuedMessages, isSelectedModelAvailable, tools } = chat
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

  // The box grows with its text. Measured before paint so a new line never
  // flashes a scrollbar.
  // biome-ignore lint/correctness/useExhaustiveDependencies: input is needed to trigger resize
  useLayoutEffect(() => {
    if (textareaRef.current) {
      fitToContent(textareaRef.current)
    }
  }, [input])
  // A change of width rewraps the text, so the height is measured again: a box
  // first laid out narrow, or in a column that then widens, would otherwise
  // keep the height of lines it no longer has.
  useLayoutEffect(() => {
    const el = textareaRef.current
    if (!el || typeof ResizeObserver === 'undefined') {
      return
    }
    let width = el.clientWidth
    const observer = new ResizeObserver(() => {
      if (el.clientWidth !== width) {
        width = el.clientWidth
        fitToContent(el)
      }
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

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
  // A queue held across a canceled or failed turn can be sent on its own.
  const canFlushQueue = !isStreaming && queuedCount > 0 && !disabled
  const { canSend, emphasized } = sendability({
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

  // A turn the provider doesn't run, such as an agent's, can't use its tools.
  const toolsAvailable = toolsAllowed && !turn && tools.length > 0
  const toolbar = attachmentsAvailable || toolsAvailable || !!settingsRight
  const action =
    isStreaming && !input.trim() ? (
      <button
        type="button"
        onClick={stopStreaming}
        disabled={turn?.stopping}
        className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-(--theme-app) text-(--theme-panel-bg) transition-opacity hover:opacity-85 disabled:opacity-50"
        aria-label={t.stopGenerating}
        title={t.stopGenerating}
      >
        <StopIcon className="h-3 w-3" />
      </button>
    ) : (
      <SendButton
        onClick={handleSubmit}
        enabled={canSend}
        emphasized={emphasized}
        label={sendLabel ?? t.sendMessage}
        testId={sendTestId}
      />
    )

  return (
    <div
      className="chat-composer-dock relative bg-(--theme-panel-bg) px-4 pt-2 pb-5"
      {...(attachmentsAvailable ? dragHandlers : {})}
    >
      {isDragging && <DragOverlay className="rounded-2xl" />}
      <div className="mx-auto w-full max-w-[var(--chat-column,50rem)] space-y-2 px-4">
        {notices}
        <div>
          {activity && <div className="mb-2">{activity}</div>}
          {(context || reserveContext) && <ComposerContext>{context}</ComposerContext>}

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
                menu={slashMenu}
                onChoose={(name) => {
                  slashMenu.choose(name)
                  textareaRef.current?.focus()
                }}
              />
            )}
            {/* One box holds the text and everything that acts on it: what is
              attached above, the attach and send controls in a toolbar
              under the text, and the model on that toolbar's right, so the
              eye never leaves the box to see where it goes. */}
            <div className="chat-composer @container flex flex-col rounded-[1.25rem] bg-(--theme-panel-bg)">
              {showAttachments && attachmentsAvailable && (
                <div className="px-3 pt-3">
                  <AttachmentUpload
                    ref={attachmentUploadRef}
                    conversationId={conversationId}
                    attachments={attachments}
                    onAttachmentsChange={setAttachments}
                    maxFiles={10}
                  />
                </div>
              )}

              {/* With nothing to put beside it, send sits at the end of the
                text's own row rather than alone on an empty toolbar. */}
              <div className={cx(!toolbar && 'flex items-end gap-2 pr-2 pb-2')}>
                <div className="max-h-[200px] min-w-0 flex-1 overflow-y-auto">
                  <textarea
                    ref={textareaRef}
                    value={input}
                    onChange={(e) => setInputAndPersist(e.target.value)}
                    onKeyDown={handleKeyDown}
                    onPaste={handlePaste}
                    {...slashMenu.inputProps}
                    placeholder={effectivePlaceholder}
                    aria-label={inputLabel ?? effectivePlaceholder}
                    disabled={disabled}
                    rows={1}
                    className={cx(
                      'theme-text block w-full resize-none overflow-hidden',
                      'bg-transparent border-0 px-4',
                      toolbar ? 'pt-3.5 pb-1' : 'pt-3 pb-1',
                      'placeholder:text-(--theme-placeholder)',
                      'focus:outline-none focus:ring-0',
                      'disabled:opacity-50 disabled:cursor-not-allowed',
                      'text-[1rem] leading-relaxed',
                    )}
                  />
                </div>
                {!toolbar && action}
              </div>

              {toolbar && (
                <div className="flex items-center gap-1 px-2 pb-2">
                  <ComposerAddMenu
                    attachmentsOpen={showAttachments && attachmentsAvailable}
                    onToggleAttachments={
                      attachmentsAvailable ? () => setShowAttachments(!showAttachments) : undefined
                    }
                    disabled={disabled}
                    withTools={toolsAllowed && !turn}
                  />
                  {/* Send stays in the box however wide the host's controls
                    are; they give up their room first. */}
                  <div className="ml-auto flex min-w-0 items-center gap-1">
                    <div className="flex min-w-0 items-center justify-end gap-1">
                      {settingsRight}
                    </div>
                    <div className="shrink-0">{action}</div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {(settingsLeft || uploadedCount > 0) && (
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
            />
          )}
          {hint && <p className="mt-1 text-center text-[11px] theme-muted-text">{hint}</p>}
        </div>
      </div>
    </div>
  )
}
