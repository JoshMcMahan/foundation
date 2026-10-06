import type { ChatModel } from '../../types'
import { createMemoryConversationStore } from '../memoryStore'
import { type ChatAdapter, ChatAdapterError } from '../types'
import { createOpenAICompatibleStream } from './createOpenAIStream'
import { errorMessageFromResponse } from './errors'
import type { ModelsWireResponse } from './wire'

export interface OpenAIChatAdapterOptions {
  // e.g. https://api.openai.com/v1 or any OpenAI-compatible base URL.
  baseUrl: string
  apiKey?: string
  // Skip the /models request and offer exactly these model IDs.
  models?: string[]
  storageKey?: string
  fetch?: typeof globalThis.fetch
}

function providerLabelFor(baseUrl: string): string {
  try {
    return new URL(baseUrl).host
  } catch {
    return 'OpenAI compatible'
  }
}

function staticModel(id: string, provider: string): ChatModel {
  return {
    id,
    object: 'model',
    created: 0,
    owned_by: 'openai-compatible',
    provider,
    tool_calling_mode: 'none',
  }
}

// Standalone adapter for any OpenAI-compatible endpoint: conversations live
// client-side (localStorage), models come from GET {baseUrl}/models, and
// streaming reuses the shared transport.
export function createOpenAIChatAdapter(options: OpenAIChatAdapterOptions): ChatAdapter {
  const baseUrl = options.baseUrl.replace(/\/$/, '')
  const doFetch = options.fetch ?? globalThis.fetch.bind(globalThis)
  const headers: Record<string, string> = options.apiKey
    ? { Authorization: `Bearer ${options.apiKey}` }
    : {}
  const store = createMemoryConversationStore({
    storageKey: options.storageKey ?? 'ai-chat-openai-conversations',
  })

  return {
    conversations: store.conversations,
    models: {
      async list() {
        const providerLabel = providerLabelFor(baseUrl)
        if (options.models?.length) {
          return {
            models: options.models.map((id) => staticModel(id, providerLabel)),
            unreachableSessions: [],
            providerIssues: [],
          }
        }
        const res = await doFetch(`${baseUrl}/models`, { headers })
        if (!res.ok) {
          throw new ChatAdapterError(await errorMessageFromResponse(res), {
            status: res.status,
          })
        }
        const body = (await res.json()) as ModelsWireResponse
        return {
          models: (body.data ?? []).map((m) => ({
            ...staticModel(m.id, providerLabel),
            ...m,
          })),
          unreachableSessions: [],
          providerIssues: body.provider_issues ?? [],
        }
      },
    },
    streamCompletion: store.recordingStream(
      createOpenAICompatibleStream({
        completionsUrl: `${baseUrl}/chat/completions`,
        buildHeaders: () => headers,
        ...(options.fetch ? { fetch: options.fetch } : {}),
      }),
    ),
  }
}
