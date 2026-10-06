import { createMemoryConversationStore } from '../memoryStore'
import type { ChatAdapter, StreamResult } from '../types'

const CANNED_REPLIES = [
  "Here's a canned reply from the mock adapter. It streams word by word so the typewriter animation, cancel behavior, and background streams all exercise the same code paths as a real backend.\n\n- No network requests are made\n- Conversations persist in localStorage\n- Try cancelling mid-stream: the partial reply is kept",
  "Everything you see is generated locally. The mock adapter implements the same `ChatAdapter` interface as the OpenAI-compatible adapter and any backend's own, so the UI can't tell the difference.\n\n```ts\nconst adapter = createMockChatAdapter()\n```\n\nMarkdown, `inline code`, and code blocks render through the same pipeline.",
  'Branching works too: edit one of your earlier messages or hit regenerate on a reply, then use the arrows to flip between branches.',
]

const THINKING_PREAMBLE =
  'Thinking about the question, weighing a few canned options, and picking the next reply in the rotation...'

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('The operation was aborted.', 'AbortError'))
      return
    }
    const onAbort = () => {
      clearTimeout(timer)
      reject(new DOMException('The operation was aborted.', 'AbortError'))
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

export function createMockChatAdapter(options?: { storageKey?: string }): ChatAdapter {
  const store = createMemoryConversationStore({
    storageKey: options?.storageKey ?? 'ai-chat-mock-conversations',
  })
  let replyIndex = 0

  return {
    conversations: store.conversations,
    models: {
      async list() {
        return {
          models: [
            {
              id: 'mock:local/canned-small',
              object: 'model',
              created: 0,
              owned_by: 'mock',
              provider: 'Mock Provider',
              tool_calling_mode: 'none' as const,
            },
            {
              id: 'mock:local/canned-thinking',
              object: 'model',
              created: 0,
              owned_by: 'mock',
              provider: 'Mock Provider',
              tool_calling_mode: 'none' as const,
            },
          ],
          unreachableSessions: [],
          providerIssues: [],
        }
      },
    },
    streamCompletion: store.recordingStream(
      async (req, handlers, signal): Promise<StreamResult> => {
        if (signal?.aborted) {
          throw new DOMException('The operation was aborted.', 'AbortError')
        }

        let reasoning = ''
        if (req.model.includes('thinking')) {
          for (const word of THINKING_PREAMBLE.split(/(?<= )/)) {
            await sleep(40, signal)
            reasoning += word
            handlers.onReasoning?.(word)
          }
        }

        const reply = CANNED_REPLIES[replyIndex % CANNED_REPLIES.length] ?? ''
        replyIndex++

        await sleep(250, signal)
        let content = ''
        for (const word of reply.split(/(?<= )/)) {
          await sleep(25, signal)
          content += word
          handlers.onContent(word)
        }

        return {
          content,
          messageId: '',
          toolCalls: [],
          finishReason: 'stop',
          model: req.model,
          reasoning,
          responsesOutput: [],
        }
      },
    ),
  }
}
