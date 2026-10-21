import { DateTime } from 'luxon'
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from 'react'
import { usePersistedState } from '../../components/Provider'
import { toast } from '../../components/Toast'
import type { CompletionMessage } from '../adapter/openai/wire'
import type { ChatAdapter, ChatToolOption, PartDelta, StreamRequest } from '../adapter/types'
import type {
  ApprovalAnswerValue,
  AttachmentMeta,
  AttachmentRef,
  ChatModel,
  ChatNavigation,
  ChatUser,
  Conversation,
  ConversationSummary,
  ChatMessage as Message,
  MessagePart,
  ProviderInfo,
  ProviderIssue,
  TokenUsage,
  ToolCallPart,
  UnreachableSession,
} from '../types'
import { chatReducer, initialState } from './chatReducer'
import { ChatConfigProvider, type ChatUIConfig, resolveChatConfig } from './config'
import { applyPartDelta, finalizeParts, splitAnswer, toolTurnMessages } from './parts'
import { providerIssueFor } from './providerIssues'
import {
  ReportSidebarPresentationContext,
  type SidebarPresentation,
  type SidebarState,
  useControllable,
  useOwnSidebar,
} from './sidebarState'
import { useSSEStream } from './useSSEStream'

function generateTitleFromMessage(content: string): string {
  const cleaned = content
    .replace(/```[\s\S]*?```/g, '')
    .replace(/`[^`]+`/g, '')
    .replace(/[#*_~[\]()]/g, '')
    .replace(/\s+/g, ' ')
    .trim()

  if (cleaned.length <= 50) {
    return cleaned
  }

  const truncated = cleaned.substring(0, 50)
  const lastSpace = truncated.lastIndexOf(' ')
  if (lastSpace > 30) {
    return `${truncated.substring(0, lastSpace)}...`
  }
  return `${truncated}...`
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function attachmentRefs(
  ids: string[] | undefined,
  meta: AttachmentMeta | undefined,
): AttachmentRef[] | undefined {
  if (!ids?.length) {
    return undefined
  }
  const uploadedAt = DateTime.now().toISO()
  return ids.map((id) => ({
    id,
    filename: meta?.[id]?.filename ?? '',
    contentType: meta?.[id]?.contentType ?? '',
    size: meta?.[id]?.size ?? 0,
    uploadedAt,
  }))
}

// A message typed while a reply streams, held until that turn ends.
interface QueuedSend {
  content: string
  attachmentIds: string[]
  attachmentMeta: AttachmentMeta
}

type SendMessage = (
  content: string,
  attachmentIds?: string[],
  parentId?: string,
  attachmentMeta?: AttachmentMeta,
  // Internal: preceding user messages from the queue, each rendered as its own bubble
  precedingMessages?: QueuedSend[],
) => Promise<boolean>

// The newest held message becomes the turn's final message; the rest ride
// ahead of it as separate user messages.
function heldSendArgs(held: Array<QueuedSend & { id: string }>): Parameters<SendMessage> | null {
  const last = held.at(-1)
  if (!last) {
    return null
  }
  const preceding = held.slice(0, -1).map(({ id: _id, ...rest }) => rest)
  return [
    last.content,
    last.attachmentIds.length > 0 ? last.attachmentIds : undefined,
    undefined,
    Object.keys(last.attachmentMeta).length > 0 ? last.attachmentMeta : undefined,
    preceding.length > 0 ? preceding : undefined,
  ]
}

type StreamOutcome = 'sent' | 'aborted' | 'failed'

/** The wire history for the messages shown, oldest first. */
function historyMessages(
  messages: Message[],
  selectedProvider: string | null,
): CompletionMessage[] {
  return messages
    .filter((m) => m.content || m.toolCalls?.length || m.parts?.length)
    .flatMap((m) => {
      const msg: CompletionMessage = {
        role: m.role,
        content: m.content || null,
      }
      if (m.role === 'assistant' && m.reasoning) {
        msg.reasoning_content = m.reasoning
      }
      if (m.role === 'assistant' && m.toolCalls?.length) {
        msg.tool_calls = m.toolCalls
      }
      if (m.role === 'assistant' && m.responsesOutput?.length && m.model === selectedProvider) {
        msg.responses_output = m.responsesOutput
      }
      if (m.role === 'tool' && m.toolCallId) {
        msg.tool_call_id = m.toolCallId
      }
      // NOTE: Do NOT include attachment_ids for existing messages in history.
      // The AI already processed those attachments when they were first sent.
      // Re-sending them would cause duplicate content and potential API errors
      // for non-vision models.
      return m.role === 'assistant' ? toolTurnMessages(m.parts, msg) : [msg]
    })
}

interface ChatContextValue {
  adapter: ChatAdapter
  currentUser: ChatUser
  navigation: ChatNavigation
  activeConversationId: string | null
  conversations: ConversationSummary[]
  currentConversation: Conversation | null
  providers: ProviderInfo[]
  models: ChatModel[]
  unreachableSessions: UnreachableSession[]
  providerIssues: ProviderIssue[]
  selectedProvider: string | null
  isSelectedModelAvailable: boolean
  selectedAllocation: string | null
  /** The host's tools the reader may turn on or off; empty when it lists none. */
  tools: ChatToolOption[]
  enabledToolIds: string[]
  isLoading: boolean
  isLoadingConversation: boolean
  isLoadingModels: boolean
  hasLoadedModels: boolean
  modelsError: string | null
  isStreaming: boolean
  sidebar: SidebarState
  /** True unless the sidebar is expanded. */
  sidebarCollapsed: boolean
  sidebarPresentation: SidebarPresentation
  drawerOpen: boolean
  queuedMessages: Message[]

  loadConversations: () => Promise<void>
  loadConversation: (id: string) => Promise<void>
  loadProviders: () => Promise<void>
  refreshProviders: () => Promise<void>
  refreshModels: () => Promise<void>
  createConversation: (title?: string) => Promise<string | null>
  deleteConversation: (id: string) => Promise<boolean>
  sendMessage: (
    content: string,
    attachmentIds?: string[],
    parentId?: string,
    attachmentMeta?: AttachmentMeta,
  ) => Promise<boolean>
  retryMessage: (messageId: string) => Promise<boolean>
  /** Answers a tool call waiting for approval, resuming the reply it paused. */
  answerToolApproval: (approvalId: string, answer: ApprovalAnswerValue) => Promise<void>
  setSelectedProvider: (providerId: string | null) => void
  setSelectedAllocation: (allocation: string | null) => void
  setToolEnabled: (id: string, enabled: boolean) => void
  stopStreaming: () => void
  removeQueuedMessage: (id: string) => void
  flushQueuedMessages: () => void
  setSidebar: (sidebar: SidebarState) => void
  setDrawerOpen: (open: boolean) => void
  /** Opens or closes the drawer while the layout shows one; otherwise moves
   *  between expanded and the rail. */
  toggleSidebar: () => void
  updateConversationTitle: (id: string, title: string) => Promise<boolean>
  navigateToBranch: (messageId: string) => void
  clearCurrentConversation: () => void
  consumeInputFocus: (conversationId?: string) => boolean
}

/** The reply being written, which changes with every streamed token. It has
 *  its own context so that only what draws the reply re-renders per token,
 *  not the composer, the conversation list and every other `useChat` reader. */
export interface ChatStream {
  /** True while the model is reasoning, before its answer starts. */
  isThinking: boolean
  streamingContent: string
  streamingReasoning: string
  streamingParts: MessagePart[]
  /** Tokens the streaming reply has used so far, when the stream reports them. */
  streamingUsage: TokenUsage | null
  thinkingStartTime: number | null
}

const NO_TOOLS: ChatToolOption[] = []

const ChatContext = createContext<ChatContextValue | undefined>(undefined)
const ChatStreamContext = createContext<ChatStream | undefined>(undefined)
// Its own context so a message row that names its model re-renders only when
// the models change, not on every update to the chat.
const ChatModelsContext = createContext<ChatModel[]>([])

/** A model's display name by its id, when the adapter listed one; undefined
 *  outside a ChatProvider or for a model it doesn't list. */
export function useChatModelName(id: string | null | undefined): string | undefined {
  const models = useContext(ChatModelsContext)
  return id ? models.find((m) => m.id === id)?.name || undefined : undefined
}

export function useChat() {
  const context = useContext(ChatContext)
  if (!context) {
    throw new Error('useChat must be used within a ChatProvider')
  }
  return context
}

/** True while the adapter lists tools of its own, which the composer's +
 *  menu offers; false outside a ChatProvider. */
export function useHasChatTools(): boolean {
  return (useContext(ChatContext)?.tools.length ?? 0) > 0
}

/** The reply being streamed. A component that reads it re-renders on every
 *  token, so read it only where the reply is drawn. */
export function useChatStream(): ChatStream {
  const context = useContext(ChatStreamContext)
  if (!context) {
    throw new Error('useChatStream must be used within a ChatProvider')
  }
  return context
}

export interface ChatProviderProps {
  adapter: ChatAdapter
  currentUser: ChatUser
  navigation: ChatNavigation
  activeConversationId?: string | null
  /** Resolved once per object: keep it stable (a module constant or a
   *  `useMemo`), or every reader of the config re-renders with the provider. */
  config?: ChatUIConfig
  /** Owns the sidebar's state. Omit to leave it to the reader, remembered
   *  per browser. */
  sidebar?: SidebarState
  onSidebarChange?: (sidebar: SidebarState) => void
  /** Owns whether the drawer is open while the layout shows the sidebar as
   *  one. Omit to leave it to the reader; it starts closed. */
  drawerOpen?: boolean
  onDrawerOpenChange?: (open: boolean) => void
  children: ReactNode
}

export function ChatProvider({
  adapter,
  currentUser,
  navigation,
  activeConversationId = null,
  config,
  sidebar: sidebarProp,
  onSidebarChange,
  drawerOpen: drawerOpenProp,
  onDrawerOpenChange,
  children,
}: ChatProviderProps) {
  const [state, dispatch] = useReducer(chatReducer, initialState)
  const hasLoadedConversationsRef = useRef(false)

  const {
    onStreamingChunk,
    startStreaming,
    stopAnimationLoop,
    drainReveal,
    afterReveal,
    resetAnimationRefs,
    targetStreamContentRef,
    streamActiveRef,
    streamingConversationIdRef,
    backgroundStreamsRef,
    abortControllerRef,
  } = useSSEStream(dispatch)

  // Ref to track current conversation ID for sendMessage
  // Updated explicitly in: clearCurrentConversation (null), loadConversation (id), sendMessage (new id)
  // Do NOT auto-sync with state - that causes race conditions
  const currentConversationIdRef = useRef<string | null>(null)

  const inputFocusPendingRef = useRef<string | null>(null)
  const consumeInputFocus = useCallback((conversationId?: string) => {
    if (!conversationId || inputFocusPendingRef.current !== conversationId) {
      return false
    }
    inputFocusPendingRef.current = null
    return true
  }, [])

  // The model last chosen, offered again once the models load.
  const [storedModel, storeModel] = usePersistedState<string | null>('aiChat.model', null)
  const storedModelRef = useRef(storedModel)
  storedModelRef.current = storedModel

  // Null until the host's list loads, so a request sent before then leaves
  // the choice to the backend rather than turning every tool off.
  const [tools, setTools] = useState<ChatToolOption[] | null>(null)
  // The tools turned off rather than on, so one the host adds later starts on.
  const [disabledToolIds, storeDisabledToolIds] = usePersistedState<string[]>(
    `aiChat.disabledTools.${currentUser.id}`,
    [],
  )
  useEffect(() => {
    if (!adapter.tools) {
      setTools(null)
      return
    }
    let current = true
    adapter.tools.list().then(
      (listed) => {
        if (current) {
          setTools(listed)
        }
      },
      (error: unknown) => {
        console.error('Failed to load tools:', error)
      },
    )
    return () => {
      current = false
    }
  }, [adapter])
  const enabledToolIds = useMemo(
    () => (tools ?? []).filter((t) => !disabledToolIds.includes(t.id)).map((t) => t.id),
    [tools, disabledToolIds],
  )
  const setToolEnabled = useCallback(
    (id: string, enabled: boolean) => {
      storeDisabledToolIds((previous) => {
        const others = previous.filter((other) => other !== id)
        return enabled ? others : [...others, id]
      })
    },
    [storeDisabledToolIds],
  )

  const selectedProviderRef = useRef(state.selectedProvider)
  useEffect(() => {
    selectedProviderRef.current = state.selectedProvider
  }, [state.selectedProvider])

  const isSelectedModelAvailable =
    !!state.selectedProvider &&
    (!state.hasLoadedModels || state.models.some((m) => m.id === state.selectedProvider))

  const isSendingRef = useRef(false)
  const pendingQueueRef = useRef<Array<QueuedSend & { id: string }>>([])
  // Self-reference for calling sendMessage from the queue processor
  const sendMessageRef = useRef<SendMessage>(null)

  const loadConversations = useCallback(async () => {
    if (!hasLoadedConversationsRef.current) {
      dispatch({ type: 'SET_LOADING', isLoading: true })
    }
    try {
      const conversations = await adapter.conversations.list()
      dispatch({ type: 'SET_CONVERSATIONS', conversations })
      hasLoadedConversationsRef.current = true
    } catch (error) {
      toast.error(errorText(error))
    } finally {
      dispatch({ type: 'SET_LOADING', isLoading: false })
    }
  }, [adapter])

  // Prevents redundant reloads while actively streaming to a conversation
  const streamingToConversationRef = useRef<string | null>(null)

  // Bumped whenever a load starts or the conversation is cleared, so a load that
  // resolves after the user moved on cannot rebind the current conversation
  const loadSequenceRef = useRef(0)

  const loadConversation = useCallback(
    async (id: string) => {
      // Skip reload while streaming to avoid losing unsaved streaming messages
      if (streamingToConversationRef.current === id && currentConversationIdRef.current === id) {
        return
      }

      // Stop UI animation when switching conversations; background stream keeps accumulating
      if (streamingConversationIdRef.current && streamingConversationIdRef.current !== id) {
        resetAnimationRefs()
        // streamingConversationIdRef intentionally not cleared — background stream callback reads it
      }

      const bgStream = backgroundStreamsRef.current.get(id)

      dispatch({
        type: 'SET_LOADING_CONVERSATION',
        isLoadingConversation: true,
      })
      const sequence = ++loadSequenceRef.current
      let conversation: Conversation
      try {
        conversation = await adapter.conversations.get(id)
      } catch (error) {
        if (loadSequenceRef.current !== sequence) {
          return
        }
        dispatch({
          type: 'SET_LOADING_CONVERSATION',
          isLoadingConversation: false,
        })
        toast.error(errorText(error))
        currentConversationIdRef.current = null
        dispatch({ type: 'SET_CURRENT_CONVERSATION', conversation: null })
        return
      }
      if (loadSequenceRef.current !== sequence) {
        return
      }
      dispatch({
        type: 'SET_LOADING_CONVERSATION',
        isLoadingConversation: false,
      })

      currentConversationIdRef.current = id

      dispatch({ type: 'SET_CURRENT_CONVERSATION', conversation })

      if (bgStream?.isActive) {
        streamingConversationIdRef.current = id
        targetStreamContentRef.current = bgStream.content
        streamActiveRef.current = true

        dispatch({
          type: 'RESTORE_BACKGROUND_STREAM',
          content: '', // Start revealing from 0, not from the accumulated position
          reasoning: bgStream.reasoning,
          parts: bgStream.parts,
        })

        startStreaming(id)
      }
    },
    [
      adapter,
      resetAnimationRefs,
      streamingConversationIdRef,
      backgroundStreamsRef,
      targetStreamContentRef,
      streamActiveRef,
      startStreaming,
    ],
  )

  const hasLoadedProvidersRef = useRef(false)

  const loadProviders = useCallback(async () => {
    if (hasLoadedProvidersRef.current || !adapter.providers) {
      return
    }
    try {
      const providers = await adapter.providers.list()
      dispatch({ type: 'SET_PROVIDERS', providers })
      hasLoadedProvidersRef.current = true
    } catch (error) {
      toast.error(errorText(error))
    }
  }, [adapter])

  const refreshProviders = useCallback(async () => {
    hasLoadedProvidersRef.current = false
    await loadProviders()
  }, [loadProviders])

  const hasLoadedModelsRef = useRef(false)

  const loadModels = useCallback(async () => {
    if (hasLoadedModelsRef.current) {
      return
    }
    dispatch({ type: 'SET_LOADING_MODELS', isLoadingModels: true })
    try {
      const { models, unreachableSessions, providerIssues } = await adapter.models.list()
      dispatch({
        type: 'SET_MODELS',
        models,
        unreachableSessions,
        providerIssues,
      })
      hasLoadedModelsRef.current = true
      const current = selectedProviderRef.current
      const stored = storedModelRef.current
      const offers = (id: string | null) => !!id && models.some((m) => m.id === id)
      // A remembered choice survives even when its provider is broken (the
      // banner explains); only the fresh default skips broken providers.
      const firstUsable =
        models.find((model) => !providerIssueFor(providerIssues, model)) ?? models[0]
      const resolved = offers(current)
        ? current
        : offers(stored)
          ? stored
          : (firstUsable?.id ?? null)
      if (resolved !== current) {
        dispatch({
          type: 'SET_SELECTED_PROVIDER',
          providerId: resolved,
        })
      }
    } catch (error) {
      console.error('Failed to load models:', error)
      dispatch({ type: 'SET_MODELS_ERROR', error: errorText(error) })
      hasLoadedModelsRef.current = true
    } finally {
      dispatch({ type: 'SET_LOADING_MODELS', isLoadingModels: false })
    }
  }, [adapter])

  const refreshModels = useCallback(async () => {
    hasLoadedModelsRef.current = false
    dispatch({ type: 'SET_MODELS_ERROR', error: null })
    await loadModels()
  }, [loadModels])

  useEffect(() => {
    loadProviders()
    loadModels()
  }, [loadProviders, loadModels])

  const resolvedConfig = useMemo(() => resolveChatConfig(config), [config])

  const createConversation = useCallback(
    async (title?: string): Promise<string | null> => {
      try {
        const conversation = await adapter.conversations.create(title)
        dispatch({ type: 'ADD_CONVERSATION', conversation })
        return conversation.id
      } catch (error) {
        toast.error(errorText(error))
        return null
      }
    },
    [adapter],
  )

  const deleteConversation = useCallback(
    async (id: string): Promise<boolean> => {
      try {
        await adapter.conversations.remove(id)
      } catch (error) {
        toast.error(errorText(error))
        return false
      }
      dispatch({ type: 'REMOVE_CONVERSATION', conversationId: id })

      if (state.currentConversation?.id === id) {
        dispatch({ type: 'SET_CURRENT_CONVERSATION', conversation: null })
        navigation.toNewChat()
      }

      return true
    },
    [adapter, state.currentConversation, navigation],
  )

  // Streams one assistant reply under parentId and adds it to the
  // conversation. routePart takes a part delta meant for another message,
  // such as the result of a call an earlier reply paused on.
  const streamReply = useCallback(
    async (
      targetConversationId: string,
      request: StreamRequest,
      parentId: string,
      onFailure: (message: string) => void,
      routePart?: (delta: PartDelta) => boolean,
      onAccepted?: () => void,
    ): Promise<StreamOutcome> => {
      backgroundStreamsRef.current.set(targetConversationId, {
        content: '',
        reasoning: '',
        parts: [],
        messageId: null,
        isActive: true,
      })
      dispatch({
        type: 'SET_STREAMING',
        isStreaming: true,
        conversationId: targetConversationId,
      })
      dispatch({
        type: 'CLEAR_STREAMING_CONTENT',
        conversationId: targetConversationId,
      })

      const controller = new AbortController()
      abortControllerRef.current = controller

      try {
        // Timed from the first streamed event, not the request, so the
        // duration excludes request setup — the response only became readable
        // at the first chunk before the transport moved behind the adapter.
        let thinkingStart: number | null = null
        // The last reasoning chunk, so "Thought for" stops where the thinking
        // did rather than running on through the answer.
        let thinkingEnd: number | null = null
        const markStreamStart = () => {
          if (thinkingStart === null) {
            thinkingStart = Date.now()
            onAccepted?.()
          }
        }

        // Parts timeline accumulated from onPart deltas (tool calls etc.).
        // Kept locally as well as in the background stream so the final
        // message can attach it after the stream's map entry is deleted.
        let liveParts: MessagePart[] = []
        // The reply's text so far, which leads the timeline once a part
        // arrives, so text and tool calls keep the order they came in.
        let liveText = ''

        const {
          content: assistantContent,
          messageId: assistantMessageId,
          toolCalls,
          model: resolvedModel,
          reasoning: assistantReasoning,
          responsesOutput,
        } = await adapter.streamCompletion(
          request,
          {
            onContent: (chunk: string) => {
              markStreamStart()
              liveText += chunk
              if (liveParts.length) {
                liveParts = applyPartDelta(liveParts, { type: 'text', text: chunk })
              }
              onStreamingChunk(chunk)
            },
            onReasoning: (reasoning: string) => {
              markStreamStart()
              thinkingEnd = Date.now()
              dispatch({
                type: 'APPEND_STREAMING_REASONING',
                reasoning,
                conversationId: targetConversationId,
              })
              const bgStream = backgroundStreamsRef.current.get(targetConversationId)
              if (bgStream) {
                bgStream.reasoning += reasoning
              }
            },
            onUsage: (usage) => {
              dispatch({
                type: 'SET_STREAMING_USAGE',
                usage,
                conversationId: targetConversationId,
              })
            },
            onMessageId: (messageId: string) => {
              markStreamStart()
              const bgStream = backgroundStreamsRef.current.get(targetConversationId)
              if (bgStream) {
                bgStream.messageId = messageId
              }
            },
            onPart: (delta: PartDelta) => {
              markStreamStart()
              if (routePart?.(delta)) {
                return
              }
              liveParts = applyPartDelta(
                liveParts.length || !liveText ? liveParts : [{ kind: 'text', text: liveText }],
                delta,
              )
              // A part shows once the text the model wrote before it has.
              afterReveal(() =>
                dispatch({
                  type: 'APPLY_STREAMING_PART',
                  delta,
                  conversationId: targetConversationId,
                }),
              )
              const bgStream = backgroundStreamsRef.current.get(targetConversationId)
              if (bgStream) {
                bgStream.parts = liveParts
              }
            },
          },
          controller.signal,
        )

        // Let the reveal catch up so the reply's end is not dropped in at once.
        await drainReveal()

        const thinkingDuration =
          assistantReasoning && thinkingStart !== null
            ? (thinkingEnd ?? Date.now()) - thinkingStart
            : null

        const assistantMessage: Message = {
          id: assistantMessageId || crypto.randomUUID(),
          parentId,
          role: 'assistant',
          content: assistantContent || (toolCalls.length > 0 ? null : ''),
          toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
          // The Responses proxy forwards the upstream SSE, whose model is the
          // bare upstream name; keep the composite id so the history echo's
          // model-match gate works within the live session.
          model: request.useResponses ? request.model : resolvedModel || request.model,
          providerId: state.selectedProvider,
          timestamp: new Date().toISOString(),
          reasoning: assistantReasoning || undefined,
          reasoningDuration: thinkingDuration ?? undefined,
          responsesOutput: responsesOutput.length ? responsesOutput : undefined,
          ...(liveParts.length ? splitAnswer(finalizeParts(liveParts)) : {}),
        }
        dispatch({
          type: 'ADD_MESSAGE',
          message: assistantMessage,
          conversationId: targetConversationId,
        })
        return 'sent'
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') {
          return 'aborted'
        }
        console.error('Failed to send message:', error)
        onFailure(errorText(error))
        return 'failed'
      } finally {
        abortControllerRef.current = null

        const { unrevealed } = stopAnimationLoop()
        if (unrevealed) {
          dispatch({
            type: 'APPEND_STREAMING_CONTENT',
            content: unrevealed,
            conversationId: targetConversationId,
          })
        }

        streamingConversationIdRef.current = null

        backgroundStreamsRef.current.delete(targetConversationId)

        // Delay clear so any in-flight navigation can read the ref before it resets
        setTimeout(() => {
          streamingToConversationRef.current = null
        }, 500)
        dispatch({
          type: 'SET_STREAMING',
          isStreaming: false,
          conversationId: targetConversationId,
        })
        dispatch({
          type: 'CLEAR_STREAMING_CONTENT',
          conversationId: targetConversationId,
        })
      }
    },
    [
      adapter,
      state.selectedProvider,
      onStreamingChunk,
      stopAnimationLoop,
      drainReveal,
      afterReveal,
      streamingConversationIdRef,
      backgroundStreamsRef,
      abortControllerRef,
    ],
  )

  const sendMessage = useCallback<SendMessage>(
    async (content, attachmentIds, parentId, attachmentMeta, precedingMessages) => {
      if (isSendingRef.current) {
        const convId = currentConversationIdRef.current
        if (!convId) {
          return false
        }

        const MAX_QUEUED_MESSAGES = 10
        if (pendingQueueRef.current.length >= MAX_QUEUED_MESSAGES) {
          toast.error(
            `You can queue up to ${MAX_QUEUED_MESSAGES} messages while waiting for a response`,
          )
          return false
        }

        const queuedId = crypto.randomUUID()
        pendingQueueRef.current.push({
          id: queuedId,
          content,
          attachmentIds: attachmentIds ? [...attachmentIds] : [],
          attachmentMeta: attachmentMeta ? { ...attachmentMeta } : {},
        })

        dispatch({
          type: 'ADD_QUEUED_MESSAGE',
          message: {
            id: queuedId,
            role: 'user',
            content,
            timestamp: DateTime.now().toISO(),
            author: currentUser,
            attachments: attachmentRefs(attachmentIds, attachmentMeta),
          },
          conversationId: convId,
        })
        return true
      }

      const modelString = state.selectedProvider
      if (!isSelectedModelAvailable || !modelString) {
        toast.error(resolvedConfig.strings.modelPicker.selectFirst)
        return false
      }

      isSendingRef.current = true

      // A queue held across a canceled or failed turn drains ahead of this
      // send, so nothing the user typed is lost or reordered.
      if (pendingQueueRef.current.length > 0) {
        const held = pendingQueueRef.current
        pendingQueueRef.current = []
        dispatch({ type: 'CLEAR_QUEUED_MESSAGES' })
        precedingMessages = [
          ...held.map(({ id: _id, ...rest }) => rest),
          ...(precedingMessages ?? []),
        ]
      }

      // Read from ref, not state — state.currentConversation may be stale at call time
      let conversationId = currentConversationIdRef.current
      let isNewConversation = false

      if (!conversationId) {
        const newId = await createConversation()
        if (!newId) {
          // Release here: the try/finally that normally clears this is not entered yet
          isSendingRef.current = false
          return false
        }
        conversationId = newId
        isNewConversation = true

        currentConversationIdRef.current = newId

        const generatedTitle = content.trim() ? generateTitleFromMessage(content) : null

        dispatch({
          type: 'SET_CURRENT_CONVERSATION',
          conversation: {
            id: newId,
            title: generatedTitle,
            messages: [],
            activeBranchId: null,
            createdAt: new Date().toISOString(),
            isOwner: true,
            canCollaborate: true,
          },
        })

        inputFocusPendingRef.current = newId
        navigation.toConversation(newId)

        if (generatedTitle) {
          adapter.conversations
            .rename(newId, generatedTitle)
            .then(() => {
              loadConversations()
            })
            .catch((err) => console.error('Failed to set title:', err))
        }
      }

      streamingToConversationRef.current = conversationId

      // Capture now so dispatch calls target the right conversation even after navigation
      const targetConversationId = conversationId

      startStreaming(targetConversationId)

      let lastBranchId = parentId || state.currentConversation?.activeBranchId || null
      const precedingApiMessages: CompletionMessage[] = []
      if (precedingMessages?.length) {
        for (const pm of precedingMessages) {
          const pmId = crypto.randomUUID()
          const pmMessage: Message = {
            id: pmId,
            parentId: lastBranchId,
            role: 'user',
            content: pm.content,
            attachments: attachmentRefs(pm.attachmentIds, pm.attachmentMeta),
            timestamp: DateTime.now().toISO(),
            author: currentUser,
          }
          dispatch({
            type: 'ADD_MESSAGE',
            message: pmMessage,
            conversationId: targetConversationId,
          })
          precedingApiMessages.push({
            role: 'user' as const,
            content: pm.content,
            attachment_ids: pm.attachmentIds.length ? pm.attachmentIds : undefined,
          })
          lastBranchId = pmId
        }
      }

      const userMessageId = crypto.randomUUID()
      const userMessage: Message = {
        id: userMessageId,
        parentId: lastBranchId,
        role: 'user',
        content,
        attachments: attachmentRefs(attachmentIds, attachmentMeta),
        timestamp: new Date().toISOString(),
        author: currentUser,
      }
      dispatch({
        type: 'ADD_MESSAGE',
        message: userMessage,
        conversationId: targetConversationId,
      })

      const setMessageError = (errorMsg: string) => {
        dispatch({
          type: 'UPDATE_MESSAGE',
          messageId: userMessageId,
          updates: { error: errorMsg },
          conversationId: targetConversationId,
        })
      }

      const existingMessages = isNewConversation ? [] : state.currentConversation?.messages || []
      const apiMessages: CompletionMessage[] = [
        ...historyMessages(existingMessages, state.selectedProvider),
        ...precedingApiMessages,
        {
          role: 'user' as const,
          content,
          attachment_ids: attachmentIds?.length ? attachmentIds : undefined,
        },
      ]

      // Responses-capable models use the native OpenAI Responses API; the
      // gateway advertises capability per model in the models list.
      const useResponses =
        state.models.find((m) => m.id === modelString)?.supports_responses === true

      let outcome: StreamOutcome = 'failed'
      try {
        outcome = await streamReply(
          targetConversationId,
          {
            model: modelString,
            messages: apiMessages,
            conversationId,
            parentMessageId: userMessage.parentId ?? null,
            userMessageId,
            allocation: state.selectedAllocation,
            useResponses,
            ...(tools ? { tools: enabledToolIds } : {}),
          },
          userMessageId,
          setMessageError,
        )
        if (outcome === 'sent' && isNewConversation) {
          loadConversations()
        }
        return outcome === 'sent'
      } finally {
        // Success drains the queue into the next turn. Cancel and error both
        // keep it — the user stopped the stream to intervene, so the queue
        // waits and rides along with their next explicit send.
        if (outcome === 'sent') {
          const next = heldSendArgs(pendingQueueRef.current)
          pendingQueueRef.current = []
          dispatch({ type: 'CLEAR_QUEUED_MESSAGES' })

          if (next) {
            // Yield to React so the assistant message and activeBranchId are committed before the next send
            setTimeout(() => {
              isSendingRef.current = false
              sendMessageRef.current?.(...next)
            }, 0)
          } else {
            isSendingRef.current = false
          }
        } else {
          isSendingRef.current = false
        }
      }
    },
    [
      adapter,
      resolvedConfig,
      isSelectedModelAvailable,
      state.selectedProvider,
      state.selectedAllocation,
      state.currentConversation,
      state.models,
      tools,
      enabledToolIds,
      currentUser,
      createConversation,
      loadConversations,
      navigation,
      startStreaming,
      streamReply,
    ],
  )

  useEffect(() => {
    sendMessageRef.current = sendMessage
  }, [sendMessage])

  const answerToolApproval = useCallback(
    async (approvalId: string, answer: ApprovalAnswerValue) => {
      const conversation = state.currentConversation
      const modelString = state.selectedProvider
      if (answer.kind !== 'confirm' || !conversation || !modelString || isSendingRef.current) {
        return
      }
      const pausedAt = conversation.messages.findIndex(
        (m) =>
          m.role === 'assistant' &&
          m.parts?.some((p) => p.kind === 'approval' && p.id === approvalId && !p.resolved),
      )
      const paused = conversation.messages[pausedAt]
      if (!paused) {
        return
      }
      isSendingRef.current = true
      const targetConversationId = conversation.id
      const t = resolvedConfig.strings.agentTranscript
      const askedParts = paused.parts ?? []
      let pausedParts = askedParts
      const updatePaused = (updates: Partial<Message>) =>
        dispatch({
          type: 'UPDATE_MESSAGE',
          messageId: paused.id,
          updates,
          conversationId: targetConversationId,
        })
      const applyToPaused = (delta: PartDelta) => {
        pausedParts = applyPartDelta(pausedParts, delta)
        updatePaused({ parts: pausedParts })
      }
      if (paused.error) {
        updatePaused({ error: null })
      }
      applyToPaused({
        type: 'approval_resolved',
        id: approvalId,
        answer: answer.allowed ? t.approvalAllowed : t.approvalDenied,
      })
      const instead = answer.allowed ? answer.instead : undefined
      const asked = pausedParts.find(
        (p): p is ToolCallPart => p.kind === 'tool_call' && p.id === approvalId,
      )
      const args = answer.allowed && answer.args !== asked?.args ? answer.args : undefined
      applyToPaused({
        type: 'tool_decision',
        id: approvalId,
        decision: {
          status: answer.allowed ? 'approved' : 'denied',
          by: 'user',
          name: currentUser.name || currentUser.username,
          at: DateTime.now().toUTC().toISO(),
          ...(args !== undefined ? { edited: true } : {}),
        },
      })
      if (instead || args !== undefined) {
        pausedParts = pausedParts.map((p) =>
          p.kind === 'tool_call' && p.id === approvalId
            ? {
                ...p,
                ...(instead ? { name: instead } : {}),
                ...(args !== undefined ? { args } : {}),
              }
            : p,
        )
        updatePaused({ parts: pausedParts })
      }

      streamingToConversationRef.current = targetConversationId
      startStreaming(targetConversationId)
      let accepted = false
      try {
        const outcome = await streamReply(
          targetConversationId,
          {
            model: modelString,
            messages: historyMessages(
              conversation.messages.slice(0, pausedAt + 1),
              state.selectedProvider,
            ),
            conversationId: targetConversationId,
            parentMessageId: paused.id,
            userMessageId: crypto.randomUUID(),
            allocation: state.selectedAllocation,
            ...(tools ? { tools: enabledToolIds } : {}),
            resume: {
              messageId: paused.id,
              toolCallId: approvalId,
              allowed: answer.allowed,
              ...(answer.denyMessage ? { feedback: answer.denyMessage } : {}),
              ...(instead ? { tool: instead } : {}),
              ...(args !== undefined ? { args } : {}),
            },
          },
          paused.id,
          (message) => updatePaused({ error: message }),
          (delta) => {
            if (delta.type !== 'tool_end' || delta.id !== approvalId) {
              return false
            }
            applyToPaused(delta)
            return true
          },
          () => {
            accepted = true
          },
        )
        // Refused before anything streamed (a conflict, a denied permission,
        // arguments that don't validate, no network): the call is still held,
        // so it asks again beside the error.
        if (outcome === 'failed' && !accepted) {
          pausedParts = askedParts
          updatePaused({ parts: askedParts })
        }
      } finally {
        isSendingRef.current = false
      }
    },
    [
      resolvedConfig,
      state.currentConversation,
      state.selectedProvider,
      state.selectedAllocation,
      tools,
      enabledToolIds,
      startStreaming,
      streamReply,
      currentUser,
    ],
  )

  const updateConversationTitle = useCallback(
    async (id: string, title: string): Promise<boolean> => {
      try {
        await adapter.conversations.rename(id, title)
      } catch (error) {
        toast.error(errorText(error))
        return false
      }

      dispatch({
        type: 'SET_CONVERSATIONS',
        conversations: state.conversations.map((c) => (c.id === id ? { ...c, title } : c)),
      })

      if (state.currentConversation?.id === id) {
        dispatch({
          type: 'SET_CURRENT_CONVERSATION',
          conversation: { ...state.currentConversation, title },
        })
      }

      return true
    },
    [adapter, state.conversations, state.currentConversation],
  )

  const setSelectedProvider = useCallback(
    (providerId: string | null) => {
      if (providerId && state.models.some((m) => m.id === providerId)) {
        storeModel(providerId)
      }
      dispatch({ type: 'SET_SELECTED_PROVIDER', providerId })
    },
    [state.models, storeModel],
  )

  const setSelectedAllocation = useCallback((allocation: string | null) => {
    dispatch({ type: 'SET_SELECTED_ALLOCATION', allocation })
  }, [])

  const retryMessage = useCallback(
    async (messageId: string): Promise<boolean> => {
      const currentConvId = state.currentConversation?.id
      const messages = state.currentConversation?.messages || []
      const failedMessage = messages.find((m) => m.id === messageId)

      if (!failedMessage?.error || !currentConvId) {
        return false
      }

      if (failedMessage.role === 'user') {
        dispatch({
          type: 'UPDATE_MESSAGE',
          messageId,
          updates: { error: null },
          conversationId: currentConvId,
        })

        return sendMessage(
          failedMessage.content || '',
          failedMessage.attachments?.map((a) => a.id),
          failedMessage.parentId || undefined,
        )
      }

      if (failedMessage.role === 'assistant') {
        const parentMessage = messages.find((m) => m.id === failedMessage.parentId)
        if (parentMessage && parentMessage.role === 'user') {
          dispatch({
            type: 'UPDATE_MESSAGE',
            messageId,
            updates: { error: null },
            conversationId: currentConvId,
          })

          return sendMessage(
            parentMessage.content || '',
            parentMessage.attachments?.map((a) => a.id),
            parentMessage.parentId || undefined,
          )
        }
      }

      return false
    },
    [state.currentConversation?.messages, state.currentConversation?.id, sendMessage],
  )

  const stopStreaming = useCallback(() => {
    // Backend detects cancellation and persists partial content via defer
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
    }

    const conversationId = streamingConversationIdRef.current
    const bgStream = conversationId ? backgroundStreamsRef.current.get(conversationId) : null
    const stoppedContent = bgStream?.content || ''
    const stoppedReasoning = bgStream?.reasoning || ''
    const stoppedParts = bgStream?.parts ?? []
    const stoppedMessageId = bgStream?.messageId || null
    const hasContent = stoppedContent || stoppedReasoning || stoppedParts.length

    stopAnimationLoop()
    if (conversationId) {
      backgroundStreamsRef.current.delete(conversationId)
    }
    streamingConversationIdRef.current = null
    streamingToConversationRef.current = null
    resetAnimationRefs()
    dispatch({ type: 'SET_STREAMING', isStreaming: false })
    dispatch({ type: 'CLEAR_STREAMING_CONTENT' })

    // Backend persists via defer; we reload after to sync the server-assigned message ID
    if (!conversationId || !hasContent) {
      return
    }

    const messages = state.currentConversation?.messages || []
    const lastUserMessage = messages.findLast((m) => m.role === 'user')

    // Use the server-assigned messageId if available; fall back to UUID if stopped before first chunk
    const messageId = stoppedMessageId || crypto.randomUUID()

    dispatch({
      type: 'ADD_MESSAGE',
      message: {
        id: messageId,
        parentId: lastUserMessage?.id || null,
        role: 'assistant',
        content: stoppedContent || null,
        reasoning: stoppedReasoning || undefined,
        ...(stoppedParts.length ? { parts: finalizeParts(stoppedParts) } : {}),
        reasoningDuration: state.thinkingStartTime
          ? Date.now() - state.thinkingStartTime
          : undefined,
        timestamp: new Date().toISOString(),
        stopped: true,
      },
      conversationId,
    })

    setTimeout(() => {
      if (currentConversationIdRef.current === conversationId) {
        loadConversation(conversationId)
      }
    }, 500)
  }, [
    resetAnimationRefs,
    streamingConversationIdRef,
    abortControllerRef,
    backgroundStreamsRef,
    stopAnimationLoop,
    loadConversation,
    state.currentConversation?.messages,
    state.thinkingStartTime,
  ])

  const [sidebar, setSidebar, sidebarRef] = useControllable(
    sidebarProp,
    useOwnSidebar(),
    onSidebarChange,
  )
  const [drawerOpen, setDrawerOpen, drawerOpenRef] = useControllable(
    drawerOpenProp,
    useState(false),
    onDrawerOpenChange,
  )
  const [sidebarPresentation, setSidebarPresentation] = useState<SidebarPresentation>('inline')
  const presentationRef = useRef(sidebarPresentation)
  presentationRef.current = sidebarPresentation

  const reportSidebarPresentation = useCallback(
    (presentation: SidebarPresentation) => {
      setSidebarPresentation(presentation)
      // A drawer left open while the layout widened would be open again the
      // moment it narrows.
      if (presentation === 'inline') {
        setDrawerOpen(false)
      }
    },
    [setDrawerOpen],
  )

  const toggleSidebar = useCallback(() => {
    if (presentationRef.current === 'drawer') {
      setDrawerOpen(!drawerOpenRef.current.value)
    } else {
      setSidebar(sidebarRef.current.value === 'expanded' ? 'collapsed' : 'expanded')
    }
  }, [setDrawerOpen, drawerOpenRef, setSidebar, sidebarRef])

  const navigateToBranch = useCallback(
    (messageId: string) => {
      if (!state.currentConversation) {
        return
      }
      dispatch({
        type: 'SET_CURRENT_CONVERSATION',
        conversation: {
          ...state.currentConversation,
          activeBranchId: messageId,
        },
      })
    },
    [state.currentConversation],
  )

  const removeQueuedMessage = useCallback((id: string) => {
    pendingQueueRef.current = pendingQueueRef.current.filter((m) => m.id !== id)
    dispatch({ type: 'REMOVE_QUEUED_MESSAGE', id })
  }, [])

  // Sends the held queue on its own, when the composer is empty after a
  // cancel or error.
  const flushQueuedMessages = useCallback(() => {
    if (isSendingRef.current) {
      return
    }
    const next = heldSendArgs(pendingQueueRef.current)
    if (!next) {
      return
    }
    pendingQueueRef.current = []
    dispatch({ type: 'CLEAR_QUEUED_MESSAGES' })
    sendMessageRef.current?.(...next)
  }, [])

  const clearCurrentConversation = useCallback(() => {
    // Clear ref immediately (before re-render) to prevent stale-closure reads in sendMessage
    currentConversationIdRef.current = null
    loadSequenceRef.current++

    streamingConversationIdRef.current = null
    resetAnimationRefs()
    // backgroundStreamsRef intentionally not cleared — the in-flight fetch owns its cleanup

    pendingQueueRef.current = []
    isSendingRef.current = false
    inputFocusPendingRef.current = null

    dispatch({ type: 'SET_CURRENT_CONVERSATION', conversation: null })
  }, [resetAnimationRefs, streamingConversationIdRef])

  const value = useMemo<ChatContextValue>(
    () => ({
      adapter,
      currentUser,
      navigation,
      activeConversationId,
      conversations: state.conversations,
      currentConversation: state.currentConversation,
      providers: state.providers,
      models: state.models,
      unreachableSessions: state.unreachableSessions,
      providerIssues: state.providerIssues,
      selectedProvider: state.selectedProvider,
      isSelectedModelAvailable,
      selectedAllocation: state.selectedAllocation,
      tools: tools ?? NO_TOOLS,
      enabledToolIds,
      isLoading: state.isLoading,
      isLoadingConversation: state.isLoadingConversation,
      isLoadingModels: state.isLoadingModels,
      hasLoadedModels: state.hasLoadedModels,
      modelsError: state.modelsError,
      isStreaming: state.isStreaming,
      sidebar,
      sidebarCollapsed: sidebar !== 'expanded',
      sidebarPresentation,
      drawerOpen,
      queuedMessages: state.queuedMessages,
      loadConversations,
      loadConversation,
      loadProviders,
      refreshProviders,
      refreshModels,
      createConversation,
      deleteConversation,
      sendMessage,
      retryMessage,
      answerToolApproval,
      setSelectedProvider,
      setSelectedAllocation,
      setToolEnabled,
      stopStreaming,
      removeQueuedMessage,
      flushQueuedMessages,
      setSidebar,
      setDrawerOpen,
      toggleSidebar,
      updateConversationTitle,
      navigateToBranch,
      clearCurrentConversation,
      consumeInputFocus,
    }),
    [
      adapter,
      currentUser,
      navigation,
      activeConversationId,
      state.conversations,
      state.currentConversation,
      state.providers,
      state.models,
      state.unreachableSessions,
      state.providerIssues,
      state.selectedProvider,
      state.selectedAllocation,
      tools,
      enabledToolIds,
      state.isLoading,
      state.isLoadingConversation,
      state.isLoadingModels,
      state.hasLoadedModels,
      state.modelsError,
      state.isStreaming,
      state.queuedMessages,
      sidebar,
      sidebarPresentation,
      drawerOpen,
      isSelectedModelAvailable,
      loadConversations,
      loadConversation,
      loadProviders,
      refreshProviders,
      refreshModels,
      createConversation,
      deleteConversation,
      sendMessage,
      retryMessage,
      answerToolApproval,
      setSelectedProvider,
      setSelectedAllocation,
      setToolEnabled,
      stopStreaming,
      removeQueuedMessage,
      flushQueuedMessages,
      setSidebar,
      setDrawerOpen,
      toggleSidebar,
      updateConversationTitle,
      navigateToBranch,
      clearCurrentConversation,
      consumeInputFocus,
    ],
  )

  const stream = useMemo<ChatStream>(
    () => ({
      isThinking: state.isThinking,
      streamingContent: state.streamingContent,
      streamingReasoning: state.streamingReasoning,
      streamingParts: state.streamingParts,
      streamingUsage: state.streamingUsage,
      thinkingStartTime: state.thinkingStartTime,
    }),
    [
      state.isThinking,
      state.streamingContent,
      state.streamingReasoning,
      state.streamingParts,
      state.streamingUsage,
      state.thinkingStartTime,
    ],
  )

  return (
    <ChatConfigProvider value={resolvedConfig}>
      <ReportSidebarPresentationContext.Provider value={reportSidebarPresentation}>
        <ChatContext.Provider value={value}>
          <ChatModelsContext.Provider value={state.models}>
            <ChatStreamContext.Provider value={stream}>{children}</ChatStreamContext.Provider>
          </ChatModelsContext.Provider>
        </ChatContext.Provider>
      </ReportSidebarPresentationContext.Provider>
    </ChatConfigProvider>
  )
}
