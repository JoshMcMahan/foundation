import { describe, expect, it, vi } from 'vitest'
import { ChatAdapterError, type PartDelta, type StreamRequest } from '../types'
import { createOpenAICompatibleStream, TOOLS_HEADER } from './createOpenAIStream'

function sseResponse(lines: string[]): Response {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(`${lines.join('\n')}\n`))
      controller.close()
    },
  })
  return new Response(body, { status: 200 })
}

function baseRequest(overrides?: Partial<StreamRequest>): StreamRequest {
  return {
    model: 'org:acme/model-a',
    messages: [{ role: 'user', content: 'hi' }],
    conversationId: 'conv-1',
    userMessageId: 'msg-1',
    ...overrides,
  }
}

describe('createOpenAICompatibleStream', () => {
  it('streams chat completions and accumulates the result', async () => {
    const fetchMock = vi.fn<typeof globalThis.fetch>(async () =>
      sseResponse([
        'data: {"id":"cmpl-1","model":"model-a","messageId":"srv-1","choices":[{"delta":{"content":"Hel"},"finish_reason":null}]}',
        'data: {"id":"cmpl-1","model":"model-a","choices":[{"delta":{"content":"lo"},"finish_reason":"stop"}]}',
        'data: [DONE]',
      ]),
    )
    const stream = createOpenAICompatibleStream({
      completionsUrl: '/v1/chat/completions',
      buildHeaders: (req) => ({ 'X-Conversation-Id': req.conversationId }),
      fetch: fetchMock,
    })

    const chunks: string[] = []
    const result = await stream(baseRequest(), {
      onContent: (chunk) => chunks.push(chunk),
    })

    expect(result.content).toBe('Hello')
    expect(result.messageId).toBe('srv-1')
    expect(result.finishReason).toBe('stop')
    expect(result.model).toBe('model-a')
    expect(chunks.join('')).toBe('Hello')

    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe('/v1/chat/completions')
    const headers = init?.headers as Record<string, string>
    expect(headers['X-Conversation-Id']).toBe('conv-1')
    expect(headers['Accept']).toBe('text/event-stream')
    const body = JSON.parse(String(init?.body))
    expect(body.model).toBe('org:acme/model-a')
    expect(body.stream).toBe(true)
    expect(body.messages).toEqual([{ role: 'user', content: 'hi' }])
  })

  it('streams tool calls the gateway runs as parts and keeps them off the result', async () => {
    const fetchMock = vi.fn<typeof globalThis.fetch>(async () =>
      sseResponse([
        'data: {"id":"c","model":"m","messageId":"srv-1","choices":[{"delta":{"tool_calls":[{"index":0,"id":"call-1","type":"function","function":{"name":"list_clusters","arguments":"{\\"st"}}]}}]}',
        'data: {"id":"c","model":"m","choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"ate\\":\\"on\\"}"}}]}}]}',
        'data: {"id":"c","model":"m","toolResult":{"toolCallId":"call-1","content":"[\\"gpu-a\\"]"}}',
        'data: {"id":"c","model":"m","choices":[{"delta":{"content":"You have gpu-a."},"finish_reason":"stop"}]}',
        'data: [DONE]',
      ]),
    )
    const stream = createOpenAICompatibleStream({
      completionsUrl: '/v1/chat/completions',
      fetch: fetchMock,
    })

    const parts: PartDelta[] = []
    const result = await stream(baseRequest(), {
      onContent: () => {},
      onPart: (delta) => parts.push(delta),
    })

    expect(parts).toEqual([
      { type: 'tool_start', id: 'call-1', name: 'list_clusters', args: '{"st' },
      { type: 'tool_update', id: 'call-1', args: 'ate":"on"}' },
      { type: 'tool_end', id: 'call-1', result: '["gpu-a"]' },
    ])
    expect(result.toolCalls).toEqual([])
    expect(result.content).toBe('You have gpu-a.')
  })

  it('streams a call the gateway holds for approval as a waiting call with a confirm', async () => {
    const fetchMock = vi.fn<typeof globalThis.fetch>(async () =>
      sseResponse([
        'data: {"id":"c","model":"m","messageId":"srv-1","choices":[{"delta":{"tool_calls":[{"index":0,"id":"call-1","type":"function","function":{"name":"stop_cluster","arguments":"{}"}}]}}]}',
        'data: {"id":"c","model":"m","toolApproval":{"toolCallId":"call-1","expiresAt":"2026-10-18T12:00:00Z"}}',
        'data: {"id":"c","model":"m","choices":[{"delta":{},"finish_reason":"stop"}]}',
        'data: [DONE]',
      ]),
    )
    const stream = createOpenAICompatibleStream({
      completionsUrl: '/v1/chat/completions',
      fetch: fetchMock,
    })

    const parts: PartDelta[] = []
    const result = await stream(baseRequest(), {
      onContent: () => {},
      onPart: (delta) => parts.push(delta),
    })

    expect(parts).toEqual([
      { type: 'tool_start', id: 'call-1', name: 'stop_cluster', args: '{}' },
      { type: 'tool_wait', id: 'call-1' },
      {
        type: 'approval_request',
        approval: {
          kind: 'approval',
          id: 'call-1',
          approvalKind: 'confirm',
          subject: 'call',
          canAllowDirectory: false,
          expiresAt: '2026-10-18T12:00:00Z',
        },
      },
    ])
    expect(result.toolCalls).toEqual([])
  })

  it('sends the answer to a held call in the body', async () => {
    const fetchMock = vi.fn<typeof globalThis.fetch>(async () => sseResponse(['data: [DONE]']))
    const stream = createOpenAICompatibleStream({
      completionsUrl: '/v1/chat/completions',
      fetch: fetchMock,
    })
    const resume = { messageId: 'srv-1', toolCallId: 'call-1', allowed: false, feedback: 'Not now' }

    await stream(baseRequest({ resume }), { onContent: () => {} })

    const body = JSON.parse(String(fetchMock.mock.calls[0]![1]?.body))
    expect(body.resume).toEqual(resume)
  })

  it('returns tool calls the gateway left for the caller to run', async () => {
    const fetchMock = vi.fn<typeof globalThis.fetch>(async () =>
      sseResponse([
        'data: {"id":"c","model":"m","choices":[{"delta":{"tool_calls":[{"index":0,"id":"call-1","type":"function","function":{"name":"lookup","arguments":"{}"}}]},"finish_reason":"tool_calls"}]}',
        'data: [DONE]',
      ]),
    )
    const stream = createOpenAICompatibleStream({
      completionsUrl: '/v1/chat/completions',
      fetch: fetchMock,
    })

    const result = await stream(baseRequest(), { onContent: () => {} })

    expect(result.finishReason).toBe('tool_calls')
    expect(result.toolCalls).toEqual([
      { id: 'call-1', type: 'function', function: { name: 'lookup', arguments: '{}' } },
    ])
  })

  it('uses the Responses transport when requested and available', async () => {
    const fetchMock = vi.fn<typeof globalThis.fetch>(async () =>
      sseResponse([
        'data: {"type":"response.output_text.delta","delta":"Hey"}',
        'data: {"type":"response.completed","response":{"model":"gpt-5","output":[]}}',
      ]),
    )
    const stream = createOpenAICompatibleStream({
      completionsUrl: '/v1/chat/completions',
      responsesUrl: '/v1/responses',
      fetch: fetchMock,
    })

    const result = await stream(baseRequest({ useResponses: true }), {
      onContent: () => {},
    })

    expect(result.content).toBe('Hey')
    expect(result.finishReason).toBe('stop')
    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe('/v1/responses')
    const body = JSON.parse(String(init?.body))
    expect(body.store).toBe(false)
    expect(body.input).toEqual([{ type: 'message', role: 'user', content: 'hi' }])
  })

  it('falls back to chat completions when no responses URL is configured', async () => {
    const fetchMock = vi.fn<typeof globalThis.fetch>(async () => sseResponse(['data: [DONE]']))
    const stream = createOpenAICompatibleStream({
      completionsUrl: '/v1/chat/completions',
      fetch: fetchMock,
    })

    await stream(baseRequest({ useResponses: true }), { onContent: () => {} })

    expect(fetchMock.mock.calls[0]![0]).toBe('/v1/chat/completions')
  })

  it('throws ChatAdapterError with the body message on a failed response', async () => {
    const fetchMock = vi.fn<typeof globalThis.fetch>(
      async () =>
        new Response(JSON.stringify({ message: 'quota exhausted' }), {
          status: 429,
          headers: { 'content-type': 'application/json' },
        }),
    )
    const stream = createOpenAICompatibleStream({
      completionsUrl: '/v1/chat/completions',
      fetch: fetchMock,
    })

    const promise = stream(baseRequest(), { onContent: () => {} })
    await expect(promise).rejects.toBeInstanceOf(ChatAdapterError)
    await expect(promise).rejects.toMatchObject({
      message: 'quota exhausted',
      status: 429,
    })
  })

  describe('the tools header', () => {
    async function headersFor(
      req: StreamRequest,
      hostHeaders?: Record<string, string>,
    ): Promise<Record<string, string>> {
      const fetchMock = vi.fn<typeof globalThis.fetch>(async () => sseResponse(['data: [DONE]']))
      const stream = createOpenAICompatibleStream({
        completionsUrl: '/v1/chat/completions',
        ...(hostHeaders ? { buildHeaders: () => hostHeaders } : {}),
        fetch: fetchMock,
      })
      await stream(req, { onContent: () => {} })
      return fetchMock.mock.calls[0]![1]?.headers as Record<string, string>
    }

    it('names the enabled tools', async () => {
      const headers = await headersFor(baseRequest({ tools: ['list_clusters', 'read_docs'] }))
      expect(headers[TOOLS_HEADER]).toBe('list_clusters,read_docs')
    })

    it('is sent empty when every tool is off', async () => {
      const headers = await headersFor(baseRequest({ tools: [] }))
      expect(headers).toHaveProperty(TOOLS_HEADER, '')
    })

    it('is left out when the request carries no tool choice', async () => {
      const headers = await headersFor(baseRequest(), { 'X-Conversation-Id': 'conv-1' })
      expect(Object.keys(headers).map((name) => name.toLowerCase())).not.toContain(
        TOOLS_HEADER.toLowerCase(),
      )
      expect(headers['X-Conversation-Id']).toBe('conv-1')
    })

    it("wins over the host's own value", async () => {
      const headers = await headersFor(baseRequest({ tools: ['read_docs'] }), {
        'x-platform-tools': 'list_clusters',
        Authorization: 'Bearer t',
      })
      expect(headers).not.toHaveProperty('x-platform-tools')
      expect(headers[TOOLS_HEADER]).toBe('read_docs')
      expect(headers['Authorization']).toBe('Bearer t')
    })
  })
})
