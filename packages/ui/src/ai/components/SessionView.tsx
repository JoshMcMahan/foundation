import {
  type ComponentProps,
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react'
import { preloadMarkdown } from '../../components/Markdown'
import { useChat } from '../core/ChatProvider'
import useDragDrop from '../core/useDragDrop'
import { escapeClosesLayer } from '../core/useKeyboardShortcuts'
import type { ApprovalAnswerValue, ChatMessage as Message } from '../types'
import ChatActivity from './ChatActivity'
import ChatInput, { type ChatInputHandle } from './ChatInput'
import ChatMessageList, { type ChatMessageListHandle } from './ChatMessageList'
import DragOverlay from './DragOverlay'
import { TranscriptFindBar, useTranscriptFind } from './TranscriptFind'

type ComposerProps = Omit<
  ComponentProps<typeof ChatInput>,
  'ref' | 'onSend' | 'turn' | 'conversationId' | 'onEditLastMessage'
>

type ListProps = ComponentProps<typeof ChatMessageList>

export interface SessionViewProps {
  /** Keys the composer's draft, so each conversation or session keeps its own. */
  sessionKey: string
  messages: Message[]
  /** Every message branch navigation and turn attribution look through;
   *  defaults to `messages`. */
  allMessages?: Message[]
  streamingMessage?: Message | null
  queuedMessages?: Message[]
  onRemoveQueued?: (id: string) => void
  canRemoveQueued?: (id: string) => boolean
  queueDelivery?: ListProps['queueDelivery']
  /** A turn the chat provider does not run, such as an agent session's: it
   *  drives the composer's Stop and Escape in place of the provider's stream. */
  turn?: { running: boolean; onStop: () => void; stopping?: boolean }
  onSend: ComponentProps<typeof ChatInput>['onSend']
  /** Resends an edited user message as a new branch. Without it, messages
   *  cannot be edited. */
  onEdit?: (message: Message, content: string) => void
  onRegenerate?: (messageId: string) => void
  onRetry?: (messageId: string) => void
  onNavigateBranch?: (messageId: string) => void
  onApprovalAnswer?: (id: string, answer: ApprovalAnswerValue) => void
  showAuthor?: boolean
  currentUsername?: string
  /** Shown above the transcript, such as a blocked allocation or an
   *  unreachable machine. */
  banners?: ReactNode
  /** In place of the transcript, such as a failed load with a way to retry. */
  error?: ReactNode
  /** Still loading the first messages: the transcript stays empty and the
   *  composer disabled. */
  loading?: boolean
  /** Files dropped anywhere on the view go to the composer's attachments. */
  dropFiles?: boolean
  footer?: ReactNode
  label?: string
  flush?: boolean
  /** Draws the transcript as a terminal does: every run of tool calls folds
   *  from its first call, failures and running calls included, and a thought
   *  shows whole while it streams. */
  foldEveryRun?: boolean
  workingIndicator?: boolean
  /** Pins the prompt of the turn in view over the transcript once it scrolls away. */
  pinPrompt?: boolean
  composer?: ComposerProps
  /** Finds text in the transcript: ⌘F, or FIND_IN_TRANSCRIPT_EVENT from the
   *  host's own control, opens a bar above it. */
  find?: boolean
}

/** One conversation or agent session: its transcript, with the composer at
 *  the foot of the scrolling column. The host binds its own data and actions;
 *  what it leaves out (editing, regenerating, branches) the view leaves out. */
export default function SessionView({
  sessionKey,
  messages,
  allMessages,
  streamingMessage,
  queuedMessages,
  onRemoveQueued,
  canRemoveQueued,
  queueDelivery,
  turn,
  onSend,
  onEdit,
  onRegenerate,
  onRetry,
  onNavigateBranch,
  onApprovalAnswer,
  showAuthor,
  currentUsername,
  banners,
  error,
  loading = false,
  dropFiles = false,
  footer,
  label,
  flush,
  foldEveryRun,
  workingIndicator,
  pinPrompt,
  composer,
  find = false,
}: SessionViewProps) {
  const inputRef = useRef<ChatInputHandle>(null)
  const listRef = useRef<ChatMessageListHandle>(null)
  const viewRef = useRef<HTMLDivElement>(null)
  const finder = useTranscriptFind(viewRef, find)
  const [editingId, setEditingId] = useState<string | null>(null)
  const { isStreaming: providerStreaming, stopStreaming } = useChat()
  const running = turn ? turn.running : providerStreaming
  const stop = turn ? turn.onStop : stopStreaming

  // While the host still fetches the transcript, so its replies render as
  // markdown from their first frame rather than reflowing once it loads. A
  // failed load is left to the first reply that renders.
  useEffect(() => {
    preloadMarkdown().catch(() => {})
  }, [])

  // Escape stops the turn, wherever the turn runs.
  useEffect(() => {
    if (!running) {
      return
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.defaultPrevented && !escapeClosesLayer(e.target)) {
        stop()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [running, stop])

  const editable = (id: string) => messages.find((m) => m.id === id && m.role === 'user')
  const startEdit = useCallback(
    (id: string) => {
      if (messages.some((m) => m.id === id && m.role === 'user')) {
        setEditingId(id)
      }
    },
    [messages],
  )
  const editLast = useCallback(() => {
    const last = messages.findLast((m) => m.role === 'user')
    if (last) {
      setEditingId(last.id)
    }
  }, [messages])

  const onFilesDropped = useCallback((files: FileList) => {
    inputRef.current?.addFiles(files)
  }, [])
  const { isDragging, dragHandlers } = useDragDrop({ onFilesDropped })

  // A reader who scrolled up to read earlier turns still sees what they send and the reply to it.
  const send = useCallback<typeof onSend>(
    (...args) => {
      listRef.current?.jumpToLatest()
      return onSend(...args)
    },
    [onSend],
  )

  // A turn the provider runs gets the same working line an agent session's host passes in.
  const activity = composer?.activity ?? (!turn && running ? <ChatActivity /> : undefined)

  const input = (
    <ChatInput
      ref={inputRef}
      {...composer}
      activity={activity}
      onSend={send}
      conversationId={sessionKey}
      disabled={loading || !!composer?.disabled}
      {...(turn ? { turn } : {})}
      {...(onEdit ? { onEditLastMessage: editLast } : {})}
    />
  )

  if (loading && !error) {
    return (
      <div className="flex h-full flex-col bg-(--theme-panel-bg)">
        {banners}
        <div className="flex-1" />
        {input}
      </div>
    )
  }

  return (
    <div className="relative flex h-full bg-(--theme-panel-bg)">
      <div
        ref={viewRef}
        className="flex min-w-0 flex-1 flex-col"
        {...(dropFiles ? dragHandlers : {})}
      >
        {isDragging && dropFiles && <DragOverlay className="rounded-lg" />}
        {banners}
        <TranscriptFindBar find={finder} />
        {error ?? (
          <ChatMessageList
            ref={listRef}
            messages={messages}
            allMessages={allMessages ?? messages}
            {...(streamingMessage !== undefined ? { streamingMessage } : {})}
            {...(queuedMessages ? { queuedMessages } : {})}
            {...(onRemoveQueued ? { onRemoveQueued } : {})}
            {...(canRemoveQueued ? { canRemoveQueued } : {})}
            {...(queueDelivery ? { queueDelivery } : {})}
            {...(turn ? { isStreaming: turn.running } : {})}
            editingMessageId={editingId}
            {...(showAuthor !== undefined ? { showAuthor } : {})}
            {...(currentUsername ? { currentUsername } : {})}
            {...(onNavigateBranch ? { onNavigateBranch } : {})}
            onEditMessage={onEdit ? startEdit : undefined}
            onSaveEdit={(id, content) => {
              const message = editable(id)
              if (message && onEdit) {
                onEdit(message, content)
              }
              setEditingId(null)
            }}
            onCancelEdit={() => setEditingId(null)}
            onRegenerateMessage={onRegenerate}
            onRetryMessage={onRetry}
            {...(onApprovalAnswer ? { onApprovalAnswer } : {})}
            {...(footer ? { footer } : {})}
            {...(label ? { label } : {})}
            {...(flush ? { flush } : {})}
            {...(foldEveryRun ? { foldEveryRun } : {})}
            {...(pinPrompt ? { pinPrompt } : {})}
            workingIndicator={workingIndicator ?? !activity}
            inputElement={input}
          />
        )}
        {error && input}
      </div>
    </div>
  )
}
