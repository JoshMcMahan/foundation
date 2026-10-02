import type { Conversation, ConversationSummary, ChatMessage as Message } from '../types'
import { type ChatState, chatReducer, initialState } from './chatReducer'

// ==========================================
// Test Helpers
// ==========================================

const createMockMessage = (overrides: Partial<Message> = {}): Message => ({
  id: `msg-${Math.random().toString(36).substring(7)}`,
  role: 'user',
  content: 'Test message',
  ...overrides,
})

const createMockConversation = (overrides: Partial<Conversation> = {}): Conversation => ({
  id: `conv-${Math.random().toString(36).substring(7)}`,
  title: 'Test Conversation',
  messages: [],
  createdAt: new Date().toISOString(),
  isOwner: true,
  canCollaborate: false,
  ...overrides,
})

const createMockConversationSummary = (
  overrides: Partial<ConversationSummary> = {},
): ConversationSummary => ({
  id: `conv-${Math.random().toString(36).substring(7)}`,
  title: 'Test Conversation',
  preview: 'Test preview',
  messageCount: 0,
  createdAt: new Date().toISOString(),
  isOwner: true,
  canCollaborate: false,
  ...overrides,
})

// Helper to create a state with a current conversation (needed for conversationId-based actions)
const stateWithConversation = (convId: string, overrides: Partial<ChatState> = {}): ChatState => ({
  ...initialState,
  currentConversation: createMockConversation({ id: convId }),
  ...overrides,
})

// ==========================================
// Tests
// ==========================================

describe('chatReducer', () => {
  describe('SET_CONVERSATIONS', () => {
    it('should set conversations list', () => {
      const conversations = [
        createMockConversationSummary({ id: '1', title: 'Conv 1' }),
        createMockConversationSummary({ id: '2', title: 'Conv 2' }),
      ]

      const result = chatReducer(initialState, {
        type: 'SET_CONVERSATIONS',
        conversations,
      })

      expect(result.conversations).toEqual(conversations)
      expect(result.conversations).toHaveLength(2)
    })

    it('should replace existing conversations', () => {
      const oldConversations = [createMockConversationSummary({ id: 'old', title: 'Old' })]
      const newConversations = [createMockConversationSummary({ id: 'new', title: 'New' })]

      const state = { ...initialState, conversations: oldConversations }
      const result = chatReducer(state, {
        type: 'SET_CONVERSATIONS',
        conversations: newConversations,
      })

      expect(result.conversations).toEqual(newConversations)
    })
  })

  describe('SET_CURRENT_CONVERSATION', () => {
    it('should set current conversation', () => {
      const conversation = createMockConversation({ id: 'test-conv' })

      const result = chatReducer(initialState, {
        type: 'SET_CURRENT_CONVERSATION',
        conversation,
      })

      expect(result.currentConversation).toEqual(conversation)
    })

    it('should clear the current conversation and its loading state', () => {
      const state = {
        ...initialState,
        currentConversation: createMockConversation(),
        isLoadingConversation: true,
      }

      const result = chatReducer(state, {
        type: 'SET_CURRENT_CONVERSATION',
        conversation: null,
      })

      expect(result.currentConversation).toBeNull()
      expect(result.isLoadingConversation).toBe(false)
    })

    it('should ignore a conversation model the loaded list no longer offers', () => {
      const state: ChatState = {
        ...initialState,
        hasLoadedModels: true,
        models: [
          {
            id: 'org:acme/model-a',
            object: 'model',
            created: 0,
            owned_by: 'acme',
            tool_calling_mode: 'native',
          },
        ],
        selectedProvider: 'org:acme/model-a',
      }
      const conversation = createMockConversation({
        id: 'conv-stale',
        messages: [
          createMockMessage({
            role: 'assistant',
            model: 'session:acme:stopped/latest',
          }),
        ],
      })

      const result = chatReducer(state, {
        type: 'SET_CURRENT_CONVERSATION',
        conversation,
      })

      expect(result.selectedProvider).toBe('org:acme/model-a')
    })

    it('should ensure messages is always an array', () => {
      const conversation = createMockConversation({
        messages: undefined as unknown as Message[],
      })

      const result = chatReducer(initialState, {
        type: 'SET_CURRENT_CONVERSATION',
        conversation,
      })

      expect(result.currentConversation?.messages).toEqual([])
    })
  })

  describe('UPDATE_CURRENT_CONVERSATION_TITLE', () => {
    it('should update conversation title', () => {
      const state = {
        ...initialState,
        currentConversation: createMockConversation({ title: 'Old Title' }),
      }

      const result = chatReducer(state, {
        type: 'UPDATE_CURRENT_CONVERSATION_TITLE',
        title: 'New Title',
      })

      expect(result.currentConversation?.title).toBe('New Title')
    })

    it('should not update if no current conversation', () => {
      const result = chatReducer(initialState, {
        type: 'UPDATE_CURRENT_CONVERSATION_TITLE',
        title: 'New Title',
      })

      expect(result).toEqual(initialState)
    })
  })

  describe('ADD_MESSAGE', () => {
    it('should add message to current conversation', () => {
      const convId = 'test-conv'
      const state = stateWithConversation(convId)
      const message = createMockMessage({ id: 'new-msg', content: 'Hello' })

      const result = chatReducer(state, {
        type: 'ADD_MESSAGE',
        message,
        conversationId: convId,
      })

      expect(result.currentConversation?.messages).toHaveLength(1)
      expect(result.currentConversation?.messages[0]).toEqual(message)
    })

    it('should append to existing messages', () => {
      const convId = 'test-conv'
      const existingMessage = createMockMessage({ id: 'existing' })
      const state = stateWithConversation(convId, {
        currentConversation: createMockConversation({
          id: convId,
          messages: [existingMessage],
        }),
      })
      const newMessage = createMockMessage({ id: 'new' })

      const result = chatReducer(state, {
        type: 'ADD_MESSAGE',
        message: newMessage,
        conversationId: convId,
      })

      expect(result.currentConversation?.messages).toHaveLength(2)
      expect(result.currentConversation?.messages[0]).toEqual(existingMessage)
      expect(result.currentConversation?.messages[1]).toEqual(newMessage)
    })

    it('should not add message if no current conversation', () => {
      const message = createMockMessage()

      const result = chatReducer(initialState, {
        type: 'ADD_MESSAGE',
        message,
        conversationId: 'some-conv',
      })

      expect(result).toEqual(initialState)
    })

    it('should not add message if conversationId does not match', () => {
      const state = stateWithConversation('conv-1')
      const message = createMockMessage()

      const result = chatReducer(state, {
        type: 'ADD_MESSAGE',
        message,
        conversationId: 'different-conv',
      })

      expect(result.currentConversation?.messages).toHaveLength(0)
    })
  })

  describe('UPDATE_MESSAGE', () => {
    it('should update message content', () => {
      const convId = 'test-conv'
      const message = createMockMessage({ id: 'msg-1', content: 'Original' })
      const state = stateWithConversation(convId, {
        currentConversation: createMockConversation({
          id: convId,
          messages: [message],
        }),
      })

      const result = chatReducer(state, {
        type: 'UPDATE_MESSAGE',
        messageId: 'msg-1',
        updates: { content: 'Updated' },
        conversationId: convId,
      })

      expect(result.currentConversation?.messages[0]?.content).toBe('Updated')
    })

    it('should add error to message', () => {
      const convId = 'test-conv'
      const message = createMockMessage({ id: 'msg-1' })
      const state = stateWithConversation(convId, {
        currentConversation: createMockConversation({
          id: convId,
          messages: [message],
        }),
      })

      const result = chatReducer(state, {
        type: 'UPDATE_MESSAGE',
        messageId: 'msg-1',
        updates: { error: 'Failed to send' },
        conversationId: convId,
      })

      expect(result.currentConversation?.messages[0]?.error).toBe('Failed to send')
    })

    it('should clear error from message', () => {
      const convId = 'test-conv'
      const message = createMockMessage({
        id: 'msg-1',
        error: 'Previous error',
      })
      const state = stateWithConversation(convId, {
        currentConversation: createMockConversation({
          id: convId,
          messages: [message],
        }),
      })

      const result = chatReducer(state, {
        type: 'UPDATE_MESSAGE',
        messageId: 'msg-1',
        updates: { error: null },
        conversationId: convId,
      })

      expect(result.currentConversation?.messages[0]?.error).toBeNull()
    })

    it('should only update the specified message', () => {
      const convId = 'test-conv'
      const message1 = createMockMessage({ id: 'msg-1', content: 'First' })
      const message2 = createMockMessage({ id: 'msg-2', content: 'Second' })
      const state = stateWithConversation(convId, {
        currentConversation: createMockConversation({
          id: convId,
          messages: [message1, message2],
        }),
      })

      const result = chatReducer(state, {
        type: 'UPDATE_MESSAGE',
        messageId: 'msg-2',
        updates: { content: 'Updated Second' },
        conversationId: convId,
      })

      expect(result.currentConversation?.messages[0]?.content).toBe('First')
      expect(result.currentConversation?.messages[1]?.content).toBe('Updated Second')
    })

    it('should not update if no current conversation', () => {
      const result = chatReducer(initialState, {
        type: 'UPDATE_MESSAGE',
        messageId: 'msg-1',
        updates: { content: 'Updated' },
        conversationId: 'some-conv',
      })

      expect(result).toEqual(initialState)
    })
  })

  describe('ADD_CONVERSATION', () => {
    it('should add conversation to the beginning of the list', () => {
      const existingConv = createMockConversationSummary({ id: 'existing' })
      const state = { ...initialState, conversations: [existingConv] }
      const newConv = createMockConversationSummary({ id: 'new' })

      const result = chatReducer(state, {
        type: 'ADD_CONVERSATION',
        conversation: newConv,
      })

      expect(result.conversations).toHaveLength(2)
      expect(result.conversations[0]).toEqual(newConv)
      expect(result.conversations[1]).toEqual(existingConv)
    })

    it('should not add duplicate conversation', () => {
      const conv = createMockConversationSummary({ id: 'dup-id' })
      const state = { ...initialState, conversations: [conv] }

      const result = chatReducer(state, {
        type: 'ADD_CONVERSATION',
        conversation: conv,
      })

      expect(result.conversations).toHaveLength(1)
    })
  })

  describe('REMOVE_CONVERSATION', () => {
    it('should remove conversation by id', () => {
      const conv1 = createMockConversationSummary({ id: 'conv-1' })
      const conv2 = createMockConversationSummary({ id: 'conv-2' })
      const state = { ...initialState, conversations: [conv1, conv2] }

      const result = chatReducer(state, {
        type: 'REMOVE_CONVERSATION',
        conversationId: 'conv-1',
      })

      expect(result.conversations).toHaveLength(1)
      expect(result.conversations[0]!.id).toBe('conv-2')
    })

    it('should handle removing non-existent conversation', () => {
      const conv = createMockConversationSummary({ id: 'existing' })
      const state = { ...initialState, conversations: [conv] }

      const result = chatReducer(state, {
        type: 'REMOVE_CONVERSATION',
        conversationId: 'non-existent',
      })

      expect(result.conversations).toHaveLength(1)
    })
  })

  describe('Streaming state', () => {
    it('should set streaming state', () => {
      const result = chatReducer(initialState, {
        type: 'SET_STREAMING',
        isStreaming: true,
      })

      expect(result.isStreaming).toBe(true)
    })

    it('should append streaming content', () => {
      const convId = 'test-conv'
      const state: ChatState = {
        ...initialState,
        streamingContent: 'Hello ',
        currentConversation: createMockConversation({ id: convId }),
      }

      const result = chatReducer(state, {
        type: 'APPEND_STREAMING_CONTENT',
        content: 'World',
        conversationId: convId,
      })

      expect(result.streamingContent).toBe('Hello World')
    })

    it('should not append streaming content for wrong conversation', () => {
      const state: ChatState = {
        ...initialState,
        streamingContent: 'Hello ',
        currentConversation: createMockConversation({ id: 'conv-1' }),
      }

      const result = chatReducer(state, {
        type: 'APPEND_STREAMING_CONTENT',
        content: 'World',
        conversationId: 'different-conv',
      })

      expect(result.streamingContent).toBe('Hello ')
    })

    it('should clear streaming content', () => {
      const state: ChatState = {
        ...initialState,
        streamingContent: 'Some content',
        streamingReasoning: 'Some reasoning',
        isThinking: true,
        thinkingStartTime: 12345,
      }

      const result = chatReducer(state, {
        type: 'CLEAR_STREAMING_CONTENT',
      })

      expect(result.streamingContent).toBe('')
      expect(result.streamingReasoning).toBe('')
      expect(result.isThinking).toBe(false)
      expect(result.thinkingStartTime).toBeNull()
    })
  })

  describe('TOGGLE_SIDEBAR', () => {
    it('should toggle sidebar from collapsed to expanded', () => {
      const state = { ...initialState, sidebarCollapsed: true }

      const result = chatReducer(state, { type: 'TOGGLE_SIDEBAR' })

      expect(result.sidebarCollapsed).toBe(false)
    })

    it('should toggle sidebar from expanded to collapsed', () => {
      const state = { ...initialState, sidebarCollapsed: false }

      const result = chatReducer(state, { type: 'TOGGLE_SIDEBAR' })

      expect(result.sidebarCollapsed).toBe(true)
    })
  })

  describe('Loading states', () => {
    it('should set loading state', () => {
      const result = chatReducer(initialState, {
        type: 'SET_LOADING',
        isLoading: true,
      })

      expect(result.isLoading).toBe(true)
    })

    it('should set loading conversation state', () => {
      const result = chatReducer(initialState, {
        type: 'SET_LOADING_CONVERSATION',
        isLoadingConversation: true,
      })

      expect(result.isLoadingConversation).toBe(true)
    })
  })

  describe('SET_SELECTED_PROVIDER', () => {
    it('should set selected provider', () => {
      const result = chatReducer(initialState, {
        type: 'SET_SELECTED_PROVIDER',
        providerId: 'openai-gpt4',
      })

      expect(result.selectedProvider).toBe('openai-gpt4')
    })

    it('should clear selected provider when null', () => {
      const state = { ...initialState, selectedProvider: 'some-provider' }

      const result = chatReducer(state, {
        type: 'SET_SELECTED_PROVIDER',
        providerId: null,
      })

      expect(result.selectedProvider).toBeNull()
    })
  })

  describe('SET_MODELS', () => {
    it('should set models list', () => {
      const models = [
        {
          id: 'model-1',
          object: 'model',
          created: 123,
          owned_by: 'test',
          tool_calling_mode: 'native' as const,
        },
      ]

      const result = chatReducer(initialState, {
        type: 'SET_MODELS',
        models,
      })

      expect(result.models).toEqual(models)
    })
  })

  describe('SET_THINKING', () => {
    it('should set thinking state and start time', () => {
      const before = Date.now()
      const result = chatReducer(initialState, {
        type: 'SET_THINKING',
        isThinking: true,
      })

      expect(result.isThinking).toBe(true)
      expect(result.thinkingStartTime).toBeGreaterThanOrEqual(before)
    })

    it('should preserve thinkingStartTime when setting to false', () => {
      const state: ChatState = {
        ...initialState,
        isThinking: true,
        thinkingStartTime: 12345,
      }

      const result = chatReducer(state, {
        type: 'SET_THINKING',
        isThinking: false,
      })

      expect(result.isThinking).toBe(false)
      expect(result.thinkingStartTime).toBe(12345)
    })
  })

  describe('APPEND_STREAMING_REASONING', () => {
    it('should append reasoning and set thinking state', () => {
      const convId = 'test-conv'
      const state = stateWithConversation(convId)

      const result = chatReducer(state, {
        type: 'APPEND_STREAMING_REASONING',
        reasoning: 'thinking...',
        conversationId: convId,
      })

      expect(result.streamingReasoning).toBe('thinking...')
      expect(result.isThinking).toBe(true)
      expect(result.thinkingStartTime).not.toBeNull()
    })

    it('should not append for wrong conversation', () => {
      const state = stateWithConversation('conv-1')

      const result = chatReducer(state, {
        type: 'APPEND_STREAMING_REASONING',
        reasoning: 'thinking...',
        conversationId: 'different-conv',
      })

      expect(result.streamingReasoning).toBe('')
    })
  })

  describe('RESTORE_BACKGROUND_STREAM', () => {
    it('should restore background stream content', () => {
      const result = chatReducer(initialState, {
        type: 'RESTORE_BACKGROUND_STREAM',
        content: 'restored content',
        reasoning: 'restored reasoning',
      })

      expect(result.streamingContent).toBe('restored content')
      expect(result.streamingReasoning).toBe('restored reasoning')
      expect(result.isStreaming).toBe(true)
    })
  })
})
