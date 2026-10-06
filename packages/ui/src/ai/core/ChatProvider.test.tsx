// @vitest-environment jsdom
import { render } from '@testing-library/react'
import { act } from 'react'
import type { ChatAdapter, StreamResult } from '../adapter/types'
import ChatMessageList from '../components/ChatMessageList'
import type { ChatModel, ChatNavigation, ChatNotify, Conversation } from '../types'
import { ChatProvider, useChat } from './ChatProvider'

const SELECTED_MODEL_KEY = 'aiChatSelectedModel'

const storage = new Map<string, string>()
Object.defineProperty(window, 'localStorage', {
  configurable: true,
  value: {
    getItem: (k: string) => storage.get(k) ?? null,
    setItem: (k: string, v: string) => storage.set(k, String(v)),
    removeItem: (k: string) => storage.delete(k),
    clear: () => storage.clear(),
  },
})

const testModels: ChatModel[] = [
  {
    id: 'org:acme/model-a',
    object: 'model',
    created: 0,
    owned_by: 'acme',
    tool_calling_mode: 'native',
  },
  {
    id: 'org:acme/model-b',
    object: 'model',
    created: 0,
    owned_by: 'acme',
    tool_calling_mode: 'native',
  },
]

function deferred<T>() {
  let resolve: (value: T) => void = () => {}
  const promise = new Promise<T>((r) => {
    resolve = r
  })
  return { promise, resolve }
}

function emptyStreamResult(): StreamResult {
  return {
    content: '',
    messageId: '',
    toolCalls: [],
    finishReason: null,
    model: null,
    reasoning: '',
    responsesOutput: [],
  }
}

function makeAdapter(overrides?: Partial<ChatAdapter>): ChatAdapter {
  return {
    conversations: {
      list: vi.fn(async () => []),
      get: vi.fn(async (id: string): Promise<Conversation> => {
        return { id, messages: [] }
      }),
      create: vi.fn(async (title?: string) => ({
        id: 'conv-new',
        ...(title ? { title } : {}),
        messageCount: 0,
        createdAt: '2026-08-04T00:00:00Z',
        isOwner: true,
        canCollaborate: true,
      })),
      rename: vi.fn(async () => {}),
      remove: vi.fn(async () => {}),
    },
    models: {
      list: vi.fn(async () => ({
        models: testModels,
        unreachableSessions: [],
        providerIssues: [],
      })),
    },
    providers: {
      list: vi.fn(async () => []),
    },
    streamCompletion: vi.fn(async () => emptyStreamResult()),
    ...overrides,
  }
}

const currentUser = { id: 'user-1', username: 'tester', name: 'Tester' }

const navigation: ChatNavigation = {
  toConversation: vi.fn(),
  toNewChat: vi.fn(),
}

const notify: ChatNotify = {
  success: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
}

let chat: ReturnType<typeof useChat>

function Probe() {
  chat = useChat()
  return null
}

async function renderProvider(adapter: ChatAdapter) {
  await act(async () => {
    render(
      <ChatProvider
        adapter={adapter}
        currentUser={currentUser}
        navigation={navigation}
        notify={notify}
      >
        <Probe />
      </ChatProvider>,
    )
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  storage.clear()
})

describe('model auto-selection', () => {
  it('skips models from a broken provider and exposes the issue', async () => {
    const issue = {
      provider: 'Acme',
      provider_name: 'acme',
      status: 'unauthorized' as const,
      message: 'API key locked',
    }
    const adapter = makeAdapter({
      models: {
        list: vi.fn(async () => ({
          models: [
            {
              id: 'org:acme/model-a',
              object: 'model',
              created: 0,
              owned_by: 'acme',
              provider_name: 'acme',
              tool_calling_mode: 'native' as const,
            },
            {
              id: 'tester:healthy/model-b',
              object: 'model',
              created: 0,
              owned_by: 'healthy',
              provider_name: 'healthy',
              provider_owner: 'tester',
              tool_calling_mode: 'native' as const,
            },
          ],
          unreachableSessions: [],
          providerIssues: [issue],
        })),
      },
    })
    await renderProvider(adapter)

    expect(chat.selectedProvider).toBe('tester:healthy/model-b')
    expect(chat.providerIssues).toEqual([issue])
  })

  it('falls back to the first model when every provider is broken', async () => {
    const adapter = makeAdapter({
      models: {
        list: vi.fn(async () => ({
          models: [
            {
              id: 'org:acme/model-a',
              object: 'model',
              created: 0,
              owned_by: 'acme',
              provider_name: 'acme',
              tool_calling_mode: 'native' as const,
            },
          ],
          unreachableSessions: [],
          providerIssues: [
            {
              provider: 'Acme',
              provider_name: 'acme',
              status: 'unreachable' as const,
            },
          ],
        })),
      },
    })
    await renderProvider(adapter)

    expect(chat.selectedProvider).toBe('org:acme/model-a')
  })
})

describe('starting a new chat', () => {
  it('ignores a conversation load that resolves after the conversation is cleared', async () => {
    const pendingLoad = deferred<Conversation>()
    const adapter = makeAdapter()
    vi.mocked(adapter.conversations.get).mockImplementation(() => pendingLoad.promise)

    await renderProvider(adapter)

    act(() => {
      chat.setSelectedProvider('org:acme/model-b')
    })

    act(() => {
      void chat.loadConversation('conv-old')
    })

    act(() => {
      chat.clearCurrentConversation()
    })

    await act(async () => {
      pendingLoad.resolve({
        id: 'conv-old',
        title: 'Old thread',
        messages: [
          { id: 'm1', role: 'user', content: 'hi' },
          {
            id: 'm2',
            role: 'assistant',
            content: 'hello',
            model: 'org:acme/model-a',
          },
        ],
      })
    })

    expect(chat.currentConversation).toBeNull()
    expect(chat.selectedProvider).toBe('org:acme/model-b')

    await act(async () => {
      await chat.sendMessage('start a new thread')
    })

    expect(adapter.conversations.create).toHaveBeenCalled()
    expect(navigation.toConversation).toHaveBeenCalledWith('conv-new')
  })

  it('still sends after a failed conversation creation', async () => {
    const adapter = makeAdapter()
    await renderProvider(adapter)

    vi.mocked(adapter.conversations.create).mockRejectedValueOnce(
      new Error('Failed to create conversation'),
    )

    await act(async () => {
      await expect(chat.sendMessage('first try')).resolves.toBe(false)
    })

    expect(navigation.toConversation).not.toHaveBeenCalled()

    await act(async () => {
      await chat.sendMessage('second try')
    })

    expect(navigation.toConversation).toHaveBeenCalledWith('conv-new')
  })
})

type StreamControl = {
  req: import('../adapter/types').StreamRequest
  resolve: (r: StreamResult) => void
  reject: (e: unknown) => void
}

function makeStreamingAdapter() {
  const streams: StreamControl[] = []
  const adapter = makeAdapter({
    streamCompletion: vi.fn(
      (req, _handlers, signal?: AbortSignal) =>
        new Promise<StreamResult>((resolve, reject) => {
          streams.push({ req, resolve, reject })
          signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
        }),
    ),
  })
  const stream = (i: number): StreamControl => {
    const control = streams[i]
    if (!control) {
      throw new Error(`no stream ${i} started (${streams.length} so far)`)
    }
    return control
  }
  return { adapter, stream }
}

const flush = () => new Promise((r) => setTimeout(r, 20))

describe('composer queue', () => {
  async function startFirstTurn(adapter: ChatAdapter) {
    await renderProvider(adapter)
    act(() => {
      chat.setSelectedProvider('org:acme/model-a')
    })
    await act(async () => {
      void chat.sendMessage('first')
      await flush()
    })
    expect(adapter.streamCompletion).toHaveBeenCalledTimes(1)
    expect(chat.isStreaming).toBe(true)
  }

  it('queues sends during a stream and drains them all, in order, as separate messages', async () => {
    const { adapter, stream } = makeStreamingAdapter()
    await startFirstTurn(adapter)

    await act(async () => {
      await chat.sendMessage('second')
      await chat.sendMessage('third')
    })
    expect(chat.queuedMessages.map((m) => m.content)).toEqual(['second', 'third'])

    await act(async () => {
      stream(0).resolve(emptyStreamResult())
      await flush()
    })

    expect(adapter.streamCompletion).toHaveBeenCalledTimes(2)
    expect(chat.queuedMessages).toEqual([])
    const drained = stream(1).req.messages.filter((m) => m.role === 'user')
    expect(drained.map((m) => m.content)).toEqual(['first', 'second', 'third'])
    // Separate wire messages, newest last — never concatenated
    expect(stream(1).req.messages.at(-1)?.content).toBe('third')
    expect(stream(1).req.messages.at(-2)?.content).toBe('second')
  })

  it('removes a queued message before it is sent', async () => {
    const { adapter, stream } = makeStreamingAdapter()
    await startFirstTurn(adapter)

    await act(async () => {
      await chat.sendMessage('second')
      await chat.sendMessage('third')
    })
    const second = chat.queuedMessages[0]
    if (!second) {
      throw new Error('nothing queued')
    }
    const secondId = second.id
    act(() => {
      chat.removeQueuedMessage(secondId)
    })
    expect(chat.queuedMessages.map((m) => m.content)).toEqual(['third'])

    await act(async () => {
      stream(0).resolve(emptyStreamResult())
      await flush()
    })
    const drained = stream(1).req.messages.filter((m) => m.role === 'user')
    expect(drained.map((m) => m.content)).toEqual(['first', 'third'])
  })

  it('cancelling a stream keeps the queue and the next send carries it', async () => {
    const { adapter, stream } = makeStreamingAdapter()
    await startFirstTurn(adapter)

    await act(async () => {
      await chat.sendMessage('second')
    })
    await act(async () => {
      chat.stopStreaming()
      await flush()
    })

    expect(adapter.streamCompletion).toHaveBeenCalledTimes(1)
    expect(chat.queuedMessages.map((m) => m.content)).toEqual(['second'])

    await act(async () => {
      void chat.sendMessage('after cancel')
      await flush()
    })
    expect(adapter.streamCompletion).toHaveBeenCalledTimes(2)
    const users = stream(1).req.messages.filter((m) => m.role === 'user')
    expect(users.map((m) => m.content)).toEqual(['first', 'second', 'after cancel'])
  })

  it('a failed stream keeps the queue and flushQueuedMessages sends it alone', async () => {
    const { adapter, stream } = makeStreamingAdapter()
    await startFirstTurn(adapter)

    await act(async () => {
      await chat.sendMessage('second')
      await chat.sendMessage('third')
    })
    await act(async () => {
      stream(0).reject(new Error('boom'))
      await flush()
    })

    expect(adapter.streamCompletion).toHaveBeenCalledTimes(1)
    expect(chat.queuedMessages.map((m) => m.content)).toEqual(['second', 'third'])

    await act(async () => {
      chat.flushQueuedMessages()
      await flush()
    })
    expect(adapter.streamCompletion).toHaveBeenCalledTimes(2)
    expect(chat.queuedMessages).toEqual([])
    const users = stream(1).req.messages.filter((m) => m.role === 'user')
    expect(users.map((m) => m.content)).toEqual(['first', 'second', 'third'])
    expect(stream(1).req.messages.at(-1)?.content).toBe('third')
  })
})

describe('queued message rendering', () => {
  it('shows queued messages with a working remove affordance', async () => {
    const adapter = makeAdapter()
    const onRemoveQueued = vi.fn()
    const queued = [
      {
        id: 'q1',
        role: 'user' as const,
        content: 'queued one',
        timestamp: '2026-08-15T00:00:00Z',
      },
    ]
    const { getByText, getByLabelText } = render(
      <ChatProvider
        adapter={adapter}
        currentUser={currentUser}
        navigation={navigation}
        notify={notify}
      >
        <ChatMessageList
          messages={[]}
          allMessages={[]}
          queuedMessages={queued}
          onRemoveQueued={onRemoveQueued}
        />
      </ChatProvider>,
    )
    expect(getByText('queued one')).toBeTruthy()
    getByLabelText('Remove queued message').click()
    expect(onRemoveQueued).toHaveBeenCalledWith('q1')
  })
})

describe('streamed parts', () => {
  it('exposes onPart deltas as streamingParts and attaches them to the finished message', async () => {
    let handlers!: import('../adapter/types').StreamHandlers
    const done = deferred<StreamResult>()
    const adapter = makeAdapter({
      streamCompletion: vi.fn((_req, h) => {
        handlers = h
        return done.promise
      }),
    })
    await renderProvider(adapter)
    await act(async () => {
      void chat.sendMessage('whats the diagram look like')
      await flush()
    })

    await act(async () => {
      handlers.onPart?.({
        type: 'tool_start',
        id: 't1',
        name: 'get_workflow',
        args: '{"name":"helloworld"}',
      })
    })
    expect(chat.streamingParts).toEqual([
      {
        kind: 'tool_call',
        id: 't1',
        name: 'get_workflow',
        args: '{"name":"helloworld"}',
        status: 'running',
      },
    ])

    await act(async () => {
      handlers.onPart?.({ type: 'tool_end', id: 't1', result: '1 jobs' })
      done.resolve({ ...emptyStreamResult(), content: 'One job.' })
      await flush()
    })

    expect(chat.streamingParts).toEqual([])
    const assistant = chat.currentConversation?.messages.find((m) => m.role === 'assistant')
    expect(assistant?.parts).toEqual([
      {
        kind: 'tool_call',
        id: 't1',
        name: 'get_workflow',
        args: '{"name":"helloworld"}',
        status: 'ok',
        result: '1 jobs',
      },
    ])
  })

  it('closes out a tool call the stream never resolved', async () => {
    const adapter = makeAdapter({
      streamCompletion: vi.fn(async (_req, handlers) => {
        handlers.onPart?.({
          type: 'tool_start',
          id: 't1',
          name: 'Bash',
          args: '{}',
        })
        return { ...emptyStreamResult(), content: 'done' }
      }),
    })
    await renderProvider(adapter)
    await act(async () => {
      await chat.sendMessage('run it')
    })

    const assistant = chat.currentConversation?.messages.find((m) => m.role === 'assistant')
    expect(assistant?.parts?.[0]).toMatchObject({
      status: 'error',
      result: 'interrupted',
    })
  })
})

describe('model selection', () => {
  const GONE = 'session:acme:stopped/latest'

  function conversationUsing(model: string): Conversation {
    return {
      id: 'conv-1',
      title: 'Earlier thread',
      messages: [
        { id: 'm1', role: 'user', content: 'hi' },
        { id: 'm2', role: 'assistant', content: 'hello', model },
      ],
    }
  }

  it('prefers the last used model over the first one offered', async () => {
    storage.set(SELECTED_MODEL_KEY, 'org:acme/model-b')

    await renderProvider(makeAdapter())

    expect(chat.selectedProvider).toBe('org:acme/model-b')
  })

  it('persists an explicit selection but not one that is not offered', async () => {
    await renderProvider(makeAdapter())

    act(() => {
      chat.setSelectedProvider('org:acme/model-b')
    })
    expect(storage.get(SELECTED_MODEL_KEY)).toBe('org:acme/model-b')

    act(() => {
      chat.setSelectedProvider(GONE)
    })
    expect(storage.get(SELECTED_MODEL_KEY)).toBe('org:acme/model-b')
  })

  it('falls back to the last used model when a conversation names a model that is gone', async () => {
    storage.set(SELECTED_MODEL_KEY, 'org:acme/model-b')
    const adapter = makeAdapter()
    vi.mocked(adapter.conversations.get).mockResolvedValue(conversationUsing(GONE))

    await renderProvider(adapter)
    await act(async () => {
      await chat.loadConversation('conv-1')
    })

    expect(chat.selectedProvider).toBe('org:acme/model-b')
  })

  it('falls back to the first offered model when nothing was used before', async () => {
    const adapter = makeAdapter()
    vi.mocked(adapter.conversations.get).mockResolvedValue(conversationUsing(GONE))

    await renderProvider(adapter)
    await act(async () => {
      await chat.loadConversation('conv-1')
    })

    expect(chat.selectedProvider).toBe('org:acme/model-a')
  })

  it('still restores a conversation model that is offered', async () => {
    const adapter = makeAdapter()
    vi.mocked(adapter.conversations.get).mockResolvedValue(conversationUsing('org:acme/model-b'))

    await renderProvider(adapter)
    await act(async () => {
      await chat.loadConversation('conv-1')
    })

    expect(chat.selectedProvider).toBe('org:acme/model-b')
  })

  it('drops a restored model once a later model list does not offer it', async () => {
    const pendingModels = deferred<{
      models: ChatModel[]
      unreachableSessions: never[]
      providerIssues: never[]
    }>()
    const adapter = makeAdapter()
    vi.mocked(adapter.models.list).mockImplementation(() => pendingModels.promise)
    vi.mocked(adapter.conversations.get).mockResolvedValue(conversationUsing(GONE))

    await renderProvider(adapter)
    await act(async () => {
      await chat.loadConversation('conv-1')
    })
    expect(chat.selectedProvider).toBe(GONE)

    await act(async () => {
      pendingModels.resolve({
        models: testModels,
        unreachableSessions: [],
        providerIssues: [],
      })
      await flush()
    })

    expect(chat.selectedProvider).toBe('org:acme/model-a')
  })

  it('refuses to send against a model that is not offered', async () => {
    const adapter = makeAdapter()
    await renderProvider(adapter)

    act(() => {
      chat.setSelectedProvider(GONE)
    })
    expect(chat.isSelectedModelAvailable).toBe(false)

    await act(async () => {
      await expect(chat.sendMessage('still there?')).resolves.toBe(false)
    })

    expect(adapter.streamCompletion).not.toHaveBeenCalled()
  })
})
