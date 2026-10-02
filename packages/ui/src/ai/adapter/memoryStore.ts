import type { ChatMessage, Conversation, ConversationSummary } from '../types'
import {
  ChatAdapterError,
  type ConversationsAdapter,
  type StreamCompletion,
  type StreamRequest,
} from './types'

// Client-side conversation persistence for backends without any (a bare
// OpenAI-compatible endpoint, or the mock adapter). Conversations optionally
// survive reloads via localStorage.

interface StoredConversation {
  id: string
  title: string | null
  createdAt: string
  updatedAt: string
  activeBranchId: string | null
  messages: ChatMessage[]
}

export interface MemoryConversationStore {
  conversations: ConversationsAdapter
  // Wraps a transport so completed (and cancelled-partial) turns are recorded
  // into the store; assigns the assistant message ID when the backend doesn't.
  recordingStream(inner: StreamCompletion): StreamCompletion
}

function newId(): string {
  return crypto.randomUUID()
}

export function createMemoryConversationStore(options?: {
  storageKey?: string
}): MemoryConversationStore {
  const storageKey = options?.storageKey
  let conversations: StoredConversation[] = []

  if (storageKey) {
    try {
      const raw = globalThis.localStorage?.getItem(storageKey)
      if (raw) {
        conversations = JSON.parse(raw) as StoredConversation[]
      }
    } catch {
      conversations = []
    }
  }

  const persist = () => {
    if (storageKey) {
      try {
        globalThis.localStorage?.setItem(storageKey, JSON.stringify(conversations))
      } catch {
        // Ignore quota/serialization errors — the session keeps working in memory.
      }
    }
  }

  const find = (id: string): StoredConversation => {
    const conversation = conversations.find((c) => c.id === id)
    if (!conversation) {
      throw new ChatAdapterError('Conversation not found', { status: 404 })
    }
    return conversation
  }

  const toSummary = (c: StoredConversation): ConversationSummary => ({
    id: c.id,
    ...(c.title !== null ? { title: c.title } : {}),
    messageCount: c.messages.length,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
    isOwner: true,
    canCollaborate: true,
  })

  // Mirror server-side persistence: the user turn is stored before the model
  // is dispatched, so it survives errors and pre-content cancellation.
  const recordUser = (req: StreamRequest) => {
    const conversation = conversations.find((c) => c.id === req.conversationId)
    if (!conversation) {
      return
    }
    const last = req.messages[req.messages.length - 1]
    const userContent = typeof last?.content === 'string' ? last.content : ''
    conversation.messages.push({
      id: req.userMessageId,
      role: 'user',
      content: userContent,
      parentId: req.parentMessageId ?? null,
      timestamp: new Date().toISOString(),
    })
    conversation.activeBranchId = req.userMessageId
    conversation.updatedAt = new Date().toISOString()
    persist()
  }

  const recordAssistant = (
    req: StreamRequest,
    assistant: Omit<ChatMessage, 'id' | 'role'> & { id: string },
  ) => {
    const conversation = conversations.find((c) => c.id === req.conversationId)
    if (!conversation) {
      return
    }
    conversation.messages.push({ ...assistant, role: 'assistant' })
    conversation.activeBranchId = assistant.id
    conversation.updatedAt = new Date().toISOString()
    persist()
  }

  return {
    conversations: {
      async list() {
        return [...conversations]
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
          .map(toSummary)
      },
      async get(id) {
        const c = find(id)
        const conversation: Conversation = {
          id: c.id,
          title: c.title,
          messages: [...c.messages],
          activeBranchId: c.activeBranchId,
          createdAt: c.createdAt,
          updatedAt: c.updatedAt,
          isOwner: true,
          canCollaborate: true,
        }
        return conversation
      },
      async create(title) {
        const now = new Date().toISOString()
        const conversation: StoredConversation = {
          id: newId(),
          title: title ?? null,
          createdAt: now,
          updatedAt: now,
          activeBranchId: null,
          messages: [],
        }
        conversations.push(conversation)
        persist()
        return toSummary(conversation)
      },
      async rename(id, title) {
        find(id).title = title
        persist()
      },
      async remove(id) {
        conversations = conversations.filter((c) => c.id !== id)
        persist()
      },
    },
    recordingStream(inner) {
      return async (req, handlers, signal) => {
        let partialContent = ''
        let partialReasoning = ''
        const wrappedHandlers = {
          ...handlers,
          onContent: (chunk: string) => {
            partialContent += chunk
            handlers.onContent(chunk)
          },
          onReasoning: (chunk: string) => {
            partialReasoning += chunk
            handlers.onReasoning?.(chunk)
          },
        }
        recordUser(req)
        try {
          const result = await inner(req, wrappedHandlers, signal)
          const assistantId = result.messageId || newId()
          recordAssistant(req, {
            id: assistantId,
            content: result.content || null,
            parentId: req.userMessageId,
            model: result.model ?? req.model,
            ...(result.reasoning ? { reasoning: result.reasoning } : {}),
            ...(result.responsesOutput.length ? { responsesOutput: result.responsesOutput } : {}),
            ...(result.toolCalls.length ? { toolCalls: result.toolCalls } : {}),
            timestamp: new Date().toISOString(),
          })
          return { ...result, messageId: assistantId }
        } catch (error) {
          // Keep the partial assistant turn on cancel, like the server does.
          if (
            error instanceof DOMException &&
            error.name === 'AbortError' &&
            (partialContent || partialReasoning)
          ) {
            recordAssistant(req, {
              id: newId(),
              content: partialContent || null,
              parentId: req.userMessageId,
              model: req.model,
              ...(partialReasoning ? { reasoning: partialReasoning } : {}),
              stopped: true,
              timestamp: new Date().toISOString(),
            })
          }
          throw error
        }
      }
    },
  }
}
