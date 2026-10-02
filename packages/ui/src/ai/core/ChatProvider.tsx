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
} from 'react'
import type { CompletionMessage } from '../adapter/openai/wire'
import type { ChatAdapter, PartDelta } from '../adapter/types'
import type {
  ChatModel,
  ChatNavigation,
  ChatNotify,
  ChatUser,
  Conversation,
  ConversationSummary,
  ChatMessage as Message,
  MessagePart,
  ProviderInfo,
  UnreachableSession,
} from '../types'
import { chatReducer, initialState } from './chatReducer'
import { ChatConfigProvider, type ChatUIConfig, resolveChatConfig } from './config'
import { applyPartDelta, finalizeParts } from './parts'
import { useSSEStream } from './useSSEStream'

const SELECTED_MODEL_STORAGE_KEY = 'aiChatSelectedModel'
const SIDEBAR_COLLAPSED_STORAGE_KEY = 'aiChatSidebarCollapsed'

function readStoredSidebarCollapsed(): boolean {
  try {
    return globalThis.localStorage?.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

function storeSidebarCollapsed(collapsed: boolean) {
  try {
    globalThis.localStorage?.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, collapsed ? '1' : '0')
  } catch {
    // Storage unavailable: the sidebar still toggles, it just does not remember.
  }
}

function readStoredModel(): string | null {
  try {
    return globalThis.localStorage?.getItem(SELECTED_MODEL_STORAGE_KEY) ?? null
  } catch {
    return null
  }
}

function storeSelectedModel(modelId: string) {
  try {
    globalThis.localStorage?.setItem(SELECTED_MODEL_STORAGE_KEY, modelId)
  } catch {
    // Storage unavailable (SSR, disabled storage): the selection just doesn't persist.
  }
}

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

interface ChatContextValue {
  adapter: ChatAdapter
  currentUser: ChatUser
  navigation: ChatNavigation
  notify: ChatNotify
  activeConversationId: string | null
  conversations: ConversationSummary[]
  currentConversation: Conversation | null
  providers: ProviderInfo[]
  models: ChatModel[]
  unreachableSessions: UnreachableSession[]
  selectedProvider: string | null
  isSelectedModelAvailable: boolean
  selectedAllocation: string | null
  isLoading: boolean
  isLoadingConversation: boolean
  isLoadingModels: boolean
  hasLoadedModels: boolean
  modelsError: string | null
  isStreaming: boolean
  isThinking: boolean
  streamingContent: string
  streamingReasoning: string
  streamingParts: MessagePart[]
  thinkingStartTime: number | null
  sidebarCollapsed: boolean
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
    attachmentMeta?: Record<string, { filename: string; contentType: string; size: number }>,
  ) => Promise<boolean>
  retryMessage: (messageId: string) => Promise<boolean>
  setSelectedProvider: (providerId: string | null) => void
  setSelectedAllocation: (allocation: string | null) => void
  stopStreaming: () => void
  removeQueuedMessage: (id: string) => void
  flushQueuedMessages: () => void
  toggleSidebar: () => void
  updateConversationTitle: (id: string, title: string) => Promise<boolean>
  navigateToBranch: (messageId: string) => void
  clearCurrentConversation: () => void
}

const ChatContext = createContext<ChatContextValue | undefined>(undefined)

export function useChat() {
  const context = useContext(ChatContext)
  if (!context) {
    throw new Error('useChat must be used within a ChatProvider')
  }
  return context
}

export interface ChatProviderProps {
  adapter: ChatAdapter
  currentUser: ChatUser
  navigation: ChatNavigation
  notify: ChatNotify
  activeConversationId?: string | null
  config?: ChatUIConfig
  children: ReactNode
}

export function ChatProvider({
  adapter,
  currentUser,
  navigation,
  notify,
  activeConversationId = null,
  config,
  children,
}: ChatProviderProps) {
  const [state, dispatch] = useReducer(chatReducer, initialState, (seed) => ({
    ...seed,
    sidebarCollapsed: readStoredSidebarCollapsed(),
  }))
  const hasLoadedConversationsRef = useRef(false)

  const {
    onStreamingChunk,
    startStreaming,
    stopAnimationLoop,
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

  const selectedProviderRef = useRef(state.selectedProvider)
  useEffect(() => {
    selectedProviderRef.current = state.selectedProvider
  }, [state.selectedProvider])

  const isSelectedModelAvailable =
    !!state.selectedProvider &&
    (!state.hasLoadedModels || state.models.some((m) => m.id === state.selectedProvider))

  const isSendingRef = useRef(false)
  const pendingQueueRef = useRef<
    Array<{
      id: string
      content: string
      attachmentIds: string[]
      attachmentMeta: Record<string, { filename: string; contentType: string; size: number }>
    }>
  >([])
  // Self-reference for calling sendMessage from the queue processor
  const sendMessageRef =
    useRef<
      (
        content: string,
        attachmentIds?: string[],
        parentId?: string,
        attachmentMeta?: Record<string, { filename: string; contentType: string; size: number }>,
        _precedingMessages?: Array<{
          content: string
          attachmentIds: string[]
          attachmentMeta: Record<string, { filename: string; contentType: string; size: number }>
        }>,
      ) => Promise<boolean>
    >(null)

  const loadConversations = useCallback(async () => {
    if (!hasLoadedConversationsRef.current) {
      dispatch({ type: 'SET_LOADING', isLoading: true })
    }
    try {
      const conversations = await adapter.conversations.list()
      dispatch({ type: 'SET_CONVERSATIONS', conversations })
      hasLoadedConversationsRef.current = true
    } catch (error) {
      notify.error(errorText(error))
    } finally {
      dispatch({ type: 'SET_LOADING', isLoading: false })
    }
  }, [adapter, notify])

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
        notify.error(errorText(error))
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
      notify,
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
      notify.error(errorText(error))
    }
  }, [adapter, notify])

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
      const { models, unreachableSessions } = await adapter.models.list()
      dispatch({
        type: 'SET_MODELS',
        models,
        unreachableSessions,
      })
      hasLoadedModelsRef.current = true
      const current = selectedProviderRef.current
      const stored = readStoredModel()
      const offers = (id: string | null) => !!id && models.some((m) => m.id === id)
      const resolved = offers(current) ? current : offers(stored) ? stored : (models[0]?.id ?? null)
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

  const createConversation = useCallback(
    async (title?: string): Promise<string | null> => {
      try {
        const conversation = await adapter.conversations.create(title)
        dispatch({ type: 'ADD_CONVERSATION', conversation })
        return conversation.id
      } catch (error) {
        notify.error(errorText(error))
        return null
      }
    },
    [adapter, notify],
  )

  const deleteConversation = useCallback(
    async (id: string): Promise<boolean> => {
      try {
        await adapter.conversations.remove(id)
      } catch (error) {
        notify.error(errorText(error))
        return false
      }
      dispatch({ type: 'REMOVE_CONVERSATION', conversationId: id })

      if (state.currentConversation?.id === id) {
        dispatch({ type: 'SET_CURRENT_CONVERSATION', conversation: null })
        navigation.toNewChat()
      }

      return true
    },
    [adapter, notify, state.currentConversation, navigation],
  )

  const sendMessage = useCallback(
    async (
      content: string,
      attachmentIds?: string[],
      parentId?: string,
      attachmentMeta?: Record<string, { filename: string; contentType: string; size: number }>,
      // Internal: preceding user messages from the queue, each rendered as its own bubble
      _precedingMessages?: Array<{
        content: string
        attachmentIds: string[]
        attachmentMeta: Record<string, { filename: string; contentType: string; size: number }>
      }>,
    ): Promise<boolean> => {
      if (isSendingRef.current) {
        const convId = currentConversationIdRef.current
        if (!convId) {
          return false
        }

        const MAX_QUEUED_MESSAGES = 10
        if (pendingQueueRef.current.length >= MAX_QUEUED_MESSAGES) {
          notify.error(
            `You can queue up to ${MAX_QUEUED_MESSAGES} messages while waiting for a response`,
          )
          return false
        }

        // A drain that lost the race to a fresh send arrives here carrying
        // preceding messages — requeue them ahead of the new content so
        // nothing is dropped and chronology holds.
        for (const pm of _precedingMessages ?? []) {
          const pmId = crypto.randomUUID()
          pendingQueueRef.current.push({ id: pmId, ...pm })
          dispatch({
            type: 'ADD_QUEUED_MESSAGE',
            message: {
              id: pmId,
              role: 'user',
              content: pm.content,
              timestamp: DateTime.now().toISO()!,
              author: currentUser,
              attachments: pm.attachmentIds.length
                ? pm.attachmentIds.map((id) => ({
                    id,
                    filename: pm.attachmentMeta[id]?.filename ?? '',
                    contentType: pm.attachmentMeta[id]?.contentType ?? '',
                    size: pm.attachmentMeta[id]?.size ?? 0,
                    uploadedAt: DateTime.now().toISO()!,
                  }))
                : undefined,
            },
            conversationId: convId,
          })
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
            timestamp: DateTime.now().toISO()!,
            author: currentUser,
            attachments: attachmentIds?.map((id) => ({
              id,
              filename: attachmentMeta?.[id]?.filename ?? '',
              contentType: attachmentMeta?.[id]?.contentType ?? '',
              size: attachmentMeta?.[id]?.size ?? 0,
              uploadedAt: DateTime.now().toISO()!,
            })),
          },
          conversationId: convId,
        })
        return true
      }

      if (!isSelectedModelAvailable) {
        notify.error('Please select a provider first')
        return false
      }

      isSendingRef.current = true

      // A queue held across a cancelled or failed turn drains ahead of this
      // send, so nothing the user typed is lost or reordered.
      if (pendingQueueRef.current.length > 0) {
        const held = pendingQueueRef.current
        pendingQueueRef.current = []
        dispatch({ type: 'CLEAR_QUEUED_MESSAGES' })
        _precedingMessages = [
          ...held.map(({ id: _id, ...rest }) => rest),
          ...(_precedingMessages ?? []),
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
      if (_precedingMessages?.length) {
        for (const pm of _precedingMessages) {
          const pmId = crypto.randomUUID()
          const pmMessage: Message = {
            id: pmId,
            parentId: lastBranchId,
            role: 'user',
            content: pm.content,
            attachments: pm.attachmentIds?.length
              ? pm.attachmentIds.map((id) => ({
                  id,
                  filename: pm.attachmentMeta[id]?.filename ?? '',
                  contentType: pm.attachmentMeta[id]?.contentType ?? '',
                  size: pm.attachmentMeta[id]?.size ?? 0,
                  uploadedAt: DateTime.now().toISO()!,
                }))
              : undefined,
            timestamp: DateTime.now().toISO()!,
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
            attachment_ids: pm.attachmentIds?.length ? pm.attachmentIds : undefined,
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
        attachments: attachmentIds?.map((id) => ({
          id,
          filename: attachmentMeta?.[id]?.filename ?? '',
          contentType: attachmentMeta?.[id]?.contentType ?? '',
          size: attachmentMeta?.[id]?.size ?? 0,
          uploadedAt: new Date().toISOString(),
        })),
        timestamp: new Date().toISOString(),
        author: currentUser,
      }
      dispatch({
        type: 'ADD_MESSAGE',
        message: userMessage,
        conversationId: targetConversationId,
      })

      backgroundStreamsRef.current.set(targetConversationId, {
        content: '',
        reasoning: '',
        parts: [],
        messageId: null,
        isActive: true,
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
        ...existingMessages
          .filter((m) => m.content || m.toolCalls?.length)
          .map((m) => {
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
            if (
              m.role === 'assistant' &&
              m.responsesOutput?.length &&
              m.model === state.selectedProvider
            ) {
              msg.responses_output = m.responsesOutput
            }
            if (m.role === 'tool' && m.toolCallId) {
              msg.tool_call_id = m.toolCallId
            }
            // NOTE: Do NOT include attachment_ids for existing messages in history.
            // The AI already processed those attachments when they were first sent.
            // Re-sending them would cause duplicate content and potential API errors
            // for non-vision models.
            return msg
          }),
        ...precedingApiMessages,
        {
          role: 'user' as const,
          content,
          attachment_ids: attachmentIds?.length ? attachmentIds : undefined,
        },
      ]

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

      let sendSucceeded = false
      let wasAborted = false
      try {
        const modelString = state.selectedProvider!

        // Responses-capable models use the native OpenAI Responses API; the
        // gateway advertises capability per model in the models list.
        const useResponses =
          state.models.find((m) => m.id === modelString)?.supports_responses === true

        // Timed from the first streamed event, not the request, so the
        // duration excludes request setup — the response only became readable
        // at the first chunk before the transport moved behind the adapter.
        let thinkingStart: number | null = null
        const markStreamStart = () => {
          if (thinkingStart === null) {
            thinkingStart = Date.now()
          }
        }

        // Parts timeline accumulated from onPart deltas (tool calls etc.).
        // Kept locally as well as in the background stream so the final
        // message can attach it after the stream's map entry is deleted.
        let liveParts: MessagePart[] = []

        const {
          content: assistantContent,
          messageId: assistantMessageId,
          toolCalls,
          model: resolvedModel,
          reasoning: assistantReasoning,
          responsesOutput,
        } = await adapter.streamCompletion(
          {
            model: modelString,
            messages: apiMessages,
            conversationId,
            parentMessageId: userMessage.parentId ?? null,
            userMessageId,
            allocation: state.selectedAllocation,
            useResponses,
          },
          {
            onContent: (chunk: string) => {
              markStreamStart()
              onStreamingChunk(chunk)
            },
            onReasoning: (reasoning: string) => {
              markStreamStart()
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
            onMessageId: (messageId: string) => {
              markStreamStart()
              const bgStream = backgroundStreamsRef.current.get(targetConversationId)
              if (bgStream) {
                bgStream.messageId = messageId
              }
            },
            onPart: (delta: PartDelta) => {
              markStreamStart()
              liveParts = applyPartDelta(liveParts, delta)
              dispatch({
                type: 'APPLY_STREAMING_PART',
                delta,
                conversationId: targetConversationId,
              })
              const bgStream = backgroundStreamsRef.current.get(targetConversationId)
              if (bgStream) {
                bgStream.parts = liveParts
              }
            },
          },
          controller.signal,
        )

        const thinkingDuration =
          assistantReasoning && thinkingStart !== null ? Date.now() - thinkingStart : null

        const assistantMessage: Message = {
          id: assistantMessageId || crypto.randomUUID(),
          parentId: userMessageId,
          role: 'assistant',
          content: assistantContent || (toolCalls.length > 0 ? null : ''),
          toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
          // The Responses proxy forwards the upstream SSE, whose model is the
          // bare upstream name; keep the composite id so the history echo's
          // model-match gate works within the live session.
          model: useResponses ? modelString : resolvedModel || modelString,
          providerId: state.selectedProvider,
          timestamp: new Date().toISOString(),
          reasoning: assistantReasoning || undefined,
          reasoningDuration: thinkingDuration ?? undefined,
          responsesOutput: responsesOutput.length ? responsesOutput : undefined,
          ...(liveParts.length ? { parts: finalizeParts(liveParts) } : {}),
        }
        dispatch({
          type: 'ADD_MESSAGE',
          message: assistantMessage,
          conversationId: targetConversationId,
        })

        if (isNewConversation) {
          loadConversations()
        }

        sendSucceeded = true
        return true
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') {
          wasAborted = true
          return false
        }
        console.error('Failed to send message:', error)
        setMessageError(errorText(error))
        return false
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

        // Success drains the queue into the next turn. Cancel and error both
        // keep it — the user stopped the stream to intervene, so the queue
        // waits and rides along with their next explicit send.
        if (wasAborted) {
          isSendingRef.current = false
        } else if (sendSucceeded) {
          const queued = pendingQueueRef.current
          pendingQueueRef.current = []
          dispatch({ type: 'CLEAR_QUEUED_MESSAGES' })

          if (queued.length > 0) {
            const lastQueued = queued[queued.length - 1]!
            const preceding = queued.slice(0, -1)

            // Yield to React so the assistant message and activeBranchId are committed before the next send
            setTimeout(() => {
              isSendingRef.current = false
              sendMessageRef.current?.(
                lastQueued.content,
                lastQueued.attachmentIds.length > 0 ? lastQueued.attachmentIds : undefined,
                undefined,
                Object.keys(lastQueued.attachmentMeta).length > 0
                  ? lastQueued.attachmentMeta
                  : undefined,
                preceding.length > 0 ? preceding : undefined,
              )
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
      notify,
      isSelectedModelAvailable,
      state.selectedProvider,
      state.selectedAllocation,
      state.currentConversation,
      state.models,
      currentUser,
      createConversation,
      loadConversations,
      navigation,
      onStreamingChunk,
      startStreaming,
      stopAnimationLoop,
      streamingConversationIdRef,
      backgroundStreamsRef,
      abortControllerRef,
    ],
  )

  useEffect(() => {
    sendMessageRef.current = sendMessage
  }, [sendMessage])

  const updateConversationTitle = useCallback(
    async (id: string, title: string): Promise<boolean> => {
      try {
        await adapter.conversations.rename(id, title)
      } catch (error) {
        notify.error(errorText(error))
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
    [adapter, notify, state.conversations, state.currentConversation],
  )

  const setSelectedProvider = useCallback(
    (providerId: string | null) => {
      if (providerId && state.models.some((m) => m.id === providerId)) {
        storeSelectedModel(providerId)
      }
      dispatch({ type: 'SET_SELECTED_PROVIDER', providerId })
    },
    [state.models],
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
    const lastUserMessage = [...messages].reverse().find((m) => m.role === 'user')

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

  const sidebarCollapsedRef = useRef(state.sidebarCollapsed)
  sidebarCollapsedRef.current = state.sidebarCollapsed
  const toggleSidebar = useCallback(() => {
    storeSidebarCollapsed(!sidebarCollapsedRef.current)
    dispatch({ type: 'TOGGLE_SIDEBAR' })
  }, [])

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

  // Sends the held queue on its own (composer empty after a cancel or error):
  // the newest queued message becomes the turn's final message, the rest ride
  // ahead of it as separate user messages.
  const flushQueuedMessages = useCallback(() => {
    if (isSendingRef.current) {
      return
    }
    const held = pendingQueueRef.current
    if (held.length === 0) {
      return
    }
    pendingQueueRef.current = []
    dispatch({ type: 'CLEAR_QUEUED_MESSAGES' })
    const last = held[held.length - 1]!
    const preceding = held.slice(0, -1).map(({ id: _id, ...rest }) => rest)
    sendMessageRef.current?.(
      last.content,
      last.attachmentIds.length > 0 ? last.attachmentIds : undefined,
      undefined,
      Object.keys(last.attachmentMeta).length > 0 ? last.attachmentMeta : undefined,
      preceding.length > 0 ? preceding : undefined,
    )
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

    dispatch({ type: 'SET_CURRENT_CONVERSATION', conversation: null })
  }, [resetAnimationRefs, streamingConversationIdRef])

  const resolvedConfig = useMemo(() => resolveChatConfig(config), [config])

  const value = useMemo<ChatContextValue>(
    () => ({
      adapter,
      currentUser,
      navigation,
      notify,
      activeConversationId,
      conversations: state.conversations,
      currentConversation: state.currentConversation,
      providers: state.providers,
      models: state.models,
      unreachableSessions: state.unreachableSessions,
      selectedProvider: state.selectedProvider,
      isSelectedModelAvailable,
      selectedAllocation: state.selectedAllocation,
      isLoading: state.isLoading,
      isLoadingConversation: state.isLoadingConversation,
      isLoadingModels: state.isLoadingModels,
      hasLoadedModels: state.hasLoadedModels,
      modelsError: state.modelsError,
      isStreaming: state.isStreaming,
      isThinking: state.isThinking,
      streamingContent: state.streamingContent,
      streamingReasoning: state.streamingReasoning,
      streamingParts: state.streamingParts,
      thinkingStartTime: state.thinkingStartTime,
      sidebarCollapsed: state.sidebarCollapsed,
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
      setSelectedProvider,
      setSelectedAllocation,
      stopStreaming,
      removeQueuedMessage,
      flushQueuedMessages,
      toggleSidebar,
      updateConversationTitle,
      navigateToBranch,
      clearCurrentConversation,
    }),
    [
      adapter,
      currentUser,
      navigation,
      notify,
      activeConversationId,
      state,
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
      setSelectedProvider,
      setSelectedAllocation,
      stopStreaming,
      removeQueuedMessage,
      flushQueuedMessages,
      toggleSidebar,
      updateConversationTitle,
      navigateToBranch,
      clearCurrentConversation,
    ],
  )

  return (
    <ChatConfigProvider value={resolvedConfig}>
      <ChatContext.Provider value={value}>{children}</ChatContext.Provider>
    </ChatConfigProvider>
  )
}
