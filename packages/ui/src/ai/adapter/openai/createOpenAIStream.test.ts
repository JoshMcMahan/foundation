import { describe, expect, it, vi } from 'vitest'
import { ChatAdapterError, type StreamRequest } from '../types'
import { createOpenAICompatibleStream } from './createOpenAIStream'

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
})
