import { describe, expect, it } from 'vitest'
import { buildResponsesRequestBody, parseResponsesSSELine } from './responses'
import type { CompletionMessage } from './wire'

describe('buildResponsesRequestBody', () => {
  it('maps history to input items with store disabled', () => {
    const messages: CompletionMessage[] = [
      { role: 'user', content: 'hello' },
      { role: 'assistant', content: 'hi there' },
      { role: 'user', content: 'again' },
    ]
    const body = buildResponsesRequestBody('org:openai/gpt-5', messages)

    expect(body['model']).toBe('org:openai/gpt-5')
    expect(body['stream']).toBe(true)
    expect(body['store']).toBe(false)
    expect(body['input']).toEqual([
      { type: 'message', role: 'user', content: 'hello' },
      { type: 'message', role: 'assistant', content: 'hi there' },
      { type: 'message', role: 'user', content: 'again' },
    ])
    expect(body['attachment_ids']).toBeUndefined()
  })

  it('lifts attachment ids to the top-level gateway extension', () => {
    const body = buildResponsesRequestBody('org:openai/gpt-5', [
      { role: 'user', content: 'look at this', attachment_ids: ['a1', 'a2'] },
    ])
    expect(body['attachment_ids']).toEqual(['a1', 'a2'])
  })

  it('maps assistant tool calls and tool results to function call items', () => {
    const messages: CompletionMessage[] = [
      {
        role: 'assistant',
        content: null,
        tool_calls: [
          {
            id: 'call_1',
            type: 'function',
            function: { name: 'lookup', arguments: '{"q":1}' },
          },
        ],
      },
      { role: 'tool', content: 'result', tool_call_id: 'call_1' },
    ]
    const body = buildResponsesRequestBody('org:openai/gpt-5', messages)
    expect(body['input']).toEqual([
      {
        type: 'function_call',
        call_id: 'call_1',
        name: 'lookup',
        arguments: '{"q":1}',
      },
      { type: 'function_call_output', call_id: 'call_1', output: 'result' },
    ])
  })
})

describe('parseResponsesSSELine', () => {
  it('maps text deltas to content', () => {
    expect(
      parseResponsesSSELine('data: {"type":"response.output_text.delta","delta":"Hello"}'),
    ).toEqual({ content: 'Hello' })
  })

  it('maps reasoning summary deltas to reasoning content', () => {
    expect(
      parseResponsesSSELine('data: {"type":"response.reasoning_summary_text.delta","delta":"hmm"}'),
    ).toEqual({ reasoningContent: 'hmm' })
  })

  it('surfaces the gateway message id extension', () => {
    expect(parseResponsesSSELine('data: {"type":"pw.message_id","messageId":"msg-123"}')).toEqual({
      messageId: 'msg-123',
    })
  })

  it('maps completion to a finish reason and model', () => {
    expect(
      parseResponsesSSELine(
        'data: {"type":"response.completed","response":{"model":"gpt-5","output":[{"type":"reasoning","id":"rs_1","encrypted_content":"blob"},{"type":"other_item"}]}}',
      ),
    ).toEqual({
      model: 'gpt-5',
      finishReason: 'stop',
      responsesOutput: [{ type: 'reasoning', id: 'rs_1', encrypted_content: 'blob' }],
    })
  })

  it('surfaces failures as errors', () => {
    expect(
      parseResponsesSSELine(
        'data: {"type":"response.failed","response":{"error":{"message":"boom"}}}',
      ),
    ).toEqual({ error: 'boom' })
  })

  it('ignores housekeeping events and non-data lines', () => {
    expect(parseResponsesSSELine('data: {"type":"response.in_progress"}')).toBeNull()
    expect(parseResponsesSSELine('event: response.completed')).toBeNull()
    expect(parseResponsesSSELine('data: [DONE]')).toBeNull()
  })
})
