import type { PartDelta } from '../adapter/types'
import type {
  ChatMessage,
  ChatModel,
  Conversation,
  ConversationSummary,
  MessagePart,
  ProviderInfo,
  UnreachableSession,
} from '../types'
import { applyPartDelta } from './parts'

export interface ChatState {
  conversations: ConversationSummary[]
  currentConversation: Conversation | null
  providers: ProviderInfo[]
  models: ChatModel[]
  unreachableSessions: UnreachableSession[]
  selectedProvider: string | null
  selectedAllocation: string | null
  isLoading: boolean
  isLoadingConversation: boolean
  isLoadingModels: boolean
  hasLoadedModels: boolean
  modelsError: string | null
  isStreaming: boolean
  isThinking: boolean // Whether the model is currently in thinking/reasoning phase
  streamingContent: string
  streamingReasoning: string // Accumulated reasoning content during streaming
  streamingParts: MessagePart[] // Tool calls etc. accumulated from onPart deltas
  thinkingStartTime: number | null // When thinking started (for duration tracking)
  sidebarCollapsed: boolean
  queuedMessages: ChatMessage[] // Messages queued while AI is responding
}

export type ChatAction =
  | { type: 'SET_CONVERSATIONS'; conversations: ConversationSummary[] }
  | { type: 'SET_CURRENT_CONVERSATION'; conversation: Conversation | null }
  | { type: 'UPDATE_CURRENT_CONVERSATION_TITLE'; title: string }
  | { type: 'SET_PROVIDERS'; providers: ProviderInfo[] }
  | {
      type: 'SET_MODELS'
      models: ChatModel[]
      unreachableSessions?: UnreachableSession[]
    }
  | { type: 'SET_SELECTED_PROVIDER'; providerId: string | null }
  | { type: 'SET_SELECTED_ALLOCATION'; allocation: string | null }
  | { type: 'SET_LOADING'; isLoading: boolean }
  | { type: 'SET_LOADING_MODELS'; isLoadingModels: boolean }
  | { type: 'SET_MODELS_ERROR'; error: string | null }
  | { type: 'SET_STREAMING'; isStreaming: boolean; conversationId?: string }
  | { type: 'SET_THINKING'; isThinking: boolean }
  | {
      type: 'APPEND_STREAMING_CONTENT'
      content: string
      conversationId: string
    }
  | {
      type: 'APPEND_STREAMING_REASONING'
      reasoning: string
      conversationId: string
    }
  | {
      type: 'APPLY_STREAMING_PART'
      delta: PartDelta
      conversationId: string
    }
  | { type: 'CLEAR_STREAMING_CONTENT'; conversationId?: string }
  | { type: 'ADD_MESSAGE'; message: ChatMessage; conversationId: string }
  | {
      type: 'UPDATE_MESSAGE'
      messageId: string
      updates: Partial<ChatMessage>
      conversationId: string
    }
  | { type: 'TOGGLE_SIDEBAR' }
  | { type: 'ADD_CONVERSATION'; conversation: ConversationSummary }
  | { type: 'REMOVE_CONVERSATION'; conversationId: string }
  | { type: 'SET_LOADING_CONVERSATION'; isLoadingConversation: boolean }
  | {
      type: 'RESTORE_BACKGROUND_STREAM'
      content: string
      reasoning: string
      parts?: MessagePart[]
    }
  | {
      type: 'ADD_QUEUED_MESSAGE'
      message: ChatMessage
      conversationId?: string
    }
  | { type: 'REMOVE_QUEUED_MESSAGE'; id: string }
  | { type: 'CLEAR_QUEUED_MESSAGES' }

export const initialState: ChatState = {
  conversations: [],
  currentConversation: null,
  providers: [],
  models: [],
  unreachableSessions: [],
  selectedProvider: null,
  selectedAllocation: null,
  isLoading: false,
  isLoadingConversation: false,
  isLoadingModels: false,
  hasLoadedModels: false,
  modelsError: null,
  isStreaming: false,
  isThinking: false,
  streamingContent: '',
  streamingReasoning: '',
  streamingParts: [],
  thinkingStartTime: null,
  sidebarCollapsed: false,
  queuedMessages: [],
}

export function chatReducer(state: ChatState, action: ChatAction): ChatState {
  switch (action.type) {
    case 'SET_CONVERSATIONS':
      return { ...state, conversations: action.conversations }
    case 'SET_CURRENT_CONVERSATION':
      // Ensure messages is always an array
      if (action.conversation) {
        // If switching to a different conversation, clear streaming state
        // to prevent streaming content from one conversation showing in another
        const isNewConversation = state.currentConversation?.id !== action.conversation.id

        // Restore the model selector to the last model used in this
        // conversation, ignoring one the loaded list no longer offers.
        let restoredProvider = state.selectedProvider
        if (isNewConversation) {
          const messages = action.conversation.messages || []
          for (let i = messages.length - 1; i >= 0; i--) {
            const msg = messages[i]!
            if (msg.role === 'assistant' && msg.model) {
              const offered = !state.hasLoadedModels || state.models.some((m) => m.id === msg.model)
              if (offered) {
                restoredProvider = msg.model
              }
              break
            }
          }
        }

        return {
          ...state,
          currentConversation: {
            ...action.conversation,
            messages: action.conversation.messages || [],
          },
          selectedProvider: restoredProvider,
          // Clear streaming state if switching conversations
          ...(isNewConversation && {
            streamingContent: '',
            streamingReasoning: '',
            streamingParts: [],
            isStreaming: false,
            isThinking: false,
            thinkingStartTime: null,
            queuedMessages: [],
          }),
        }
      }
      // Switching to null conversation - clear streaming state
      return {
        ...state,
        currentConversation: null,
        isLoadingConversation: false,
        streamingContent: '',
        streamingReasoning: '',
        streamingParts: [],
        isStreaming: false,
        isThinking: false,
        thinkingStartTime: null,
        queuedMessages: [],
      }
    case 'UPDATE_CURRENT_CONVERSATION_TITLE':
      if (!state.currentConversation) {
        return state
      }
      return {
        ...state,
        currentConversation: {
          ...state.currentConversation,
          title: action.title,
        },
      }
    case 'SET_PROVIDERS':
      return { ...state, providers: action.providers }
    case 'SET_MODELS':
      return {
        ...state,
        models: action.models,
        unreachableSessions: action.unreachableSessions || [],
        hasLoadedModels: true,
        modelsError: null,
      }
    case 'SET_SELECTED_PROVIDER':
      return { ...state, selectedProvider: action.providerId }
    case 'SET_SELECTED_ALLOCATION':
      return { ...state, selectedAllocation: action.allocation }
    case 'SET_LOADING':
      return { ...state, isLoading: action.isLoading }
    case 'SET_LOADING_MODELS':
      return { ...state, isLoadingModels: action.isLoadingModels }
    case 'SET_MODELS_ERROR':
      return { ...state, modelsError: action.error, hasLoadedModels: true }
    case 'SET_STREAMING':
      // Only update streaming state if conversation matches or no conversationId specified
      if (action.conversationId && state.currentConversation?.id !== action.conversationId) {
        return state
      }
      return { ...state, isStreaming: action.isStreaming }
    case 'SET_THINKING':
      return {
        ...state,
        isThinking: action.isThinking,
        thinkingStartTime: action.isThinking ? Date.now() : state.thinkingStartTime,
      }
    case 'APPEND_STREAMING_CONTENT':
      // Only append streaming content if user is still viewing the same conversation
      if (state.currentConversation?.id !== action.conversationId) {
        return state
      }
      return {
        ...state,
        streamingContent: state.streamingContent + action.content,
        // Once we start getting content, we're no longer just thinking
        isThinking: false,
      }
    case 'APPEND_STREAMING_REASONING':
      // Only append reasoning if user is still viewing the same conversation
      if (state.currentConversation?.id !== action.conversationId) {
        return state
      }
      return {
        ...state,
        streamingReasoning: state.streamingReasoning + action.reasoning,
        // Mark as thinking when we receive reasoning content
        isThinking: true,
        thinkingStartTime: state.thinkingStartTime || Date.now(),
      }
    case 'APPLY_STREAMING_PART':
      // Only apply if user is still viewing the same conversation
      if (state.currentConversation?.id !== action.conversationId) {
        return state
      }
      return {
        ...state,
        streamingParts: applyPartDelta(state.streamingParts, action.delta),
      }
    case 'CLEAR_STREAMING_CONTENT':
      // Only clear if conversation matches or no conversationId specified
      if (action.conversationId && state.currentConversation?.id !== action.conversationId) {
        return state
      }
      return {
        ...state,
        streamingContent: '',
        streamingReasoning: '',
        streamingParts: [],
        isThinking: false,
        thinkingStartTime: null,
      }
    case 'ADD_MESSAGE':
      // Only add message if conversation ID matches the current conversation
      if (!state.currentConversation || state.currentConversation.id !== action.conversationId) {
        return state
      }
      return {
        ...state,
        currentConversation: {
          ...state.currentConversation,
          messages: [...(state.currentConversation.messages || []), action.message],
          // Update activeBranchId to the new message so subsequent messages
          // have the correct parentId
          activeBranchId: action.message.id,
        },
      }
    case 'UPDATE_MESSAGE':
      // Only update message if conversation ID matches the current conversation
      if (!state.currentConversation || state.currentConversation.id !== action.conversationId) {
        return state
      }
      return {
        ...state,
        currentConversation: {
          ...state.currentConversation,
          messages: (state.currentConversation.messages || []).map((msg) =>
            msg.id === action.messageId ? { ...msg, ...action.updates } : msg,
          ),
        },
      }
    case 'TOGGLE_SIDEBAR':
      return { ...state, sidebarCollapsed: !state.sidebarCollapsed }
    case 'ADD_CONVERSATION':
      // Check if conversation already exists to avoid duplicates
      if (state.conversations.some((c) => c.id === action.conversation.id)) {
        return state
      }
      return {
        ...state,
        conversations: [action.conversation, ...state.conversations],
      }
    case 'REMOVE_CONVERSATION':
      return {
        ...state,
        conversations: state.conversations.filter((c) => c.id !== action.conversationId),
      }
    case 'SET_LOADING_CONVERSATION':
      return { ...state, isLoadingConversation: action.isLoadingConversation }
    case 'RESTORE_BACKGROUND_STREAM':
      // Restore streaming content from a background stream
      // Note: We don't add the userMessage here because the server already has it
      // when we fetch the conversation - the IDs would differ causing duplicates
      return {
        ...state,
        streamingContent: action.content,
        streamingReasoning: action.reasoning,
        streamingParts: action.parts ?? [],
        isStreaming: true,
      }
    case 'ADD_QUEUED_MESSAGE':
      if (action.conversationId && state.currentConversation?.id !== action.conversationId) {
        return state
      }
      return {
        ...state,
        queuedMessages: [...state.queuedMessages, action.message],
      }
    case 'REMOVE_QUEUED_MESSAGE':
      return {
        ...state,
        queuedMessages: state.queuedMessages.filter((m) => m.id !== action.id),
      }
    case 'CLEAR_QUEUED_MESSAGES':
      return { ...state, queuedMessages: [] }
    default:
      return state
  }
}
