import { ChatAdapterError, type StreamCompletion, type StreamRequest } from '../types'
import { errorMessageFromResponse } from './errors'
import { buildResponsesRequestBody, parseResponsesSSELine } from './responses'
import { processSSEStream } from './sse'

// Names the host's tools the reader left on, comma-separated. Sent empty when
// every tool is off, and left out when the request carries no tool choice.
export const TOOLS_HEADER = 'X-Platform-Tools'

function requestHeaders(
  hostHeaders: Record<string, string> | undefined,
  tools: string[] | undefined,
): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'text/event-stream',
  }
  const toolsKey = TOOLS_HEADER.toLowerCase()
  for (const [name, value] of Object.entries(hostHeaders ?? {})) {
    // The reader's choice for this request wins over a host's own value,
    // whatever case the host spelled it in.
    if (tools === undefined || name.toLowerCase() !== toolsKey) {
      headers[name] = value
    }
  }
  if (tools !== undefined) {
    headers[TOOLS_HEADER] = tools.join(',')
  }
  return headers
}

export interface OpenAIStreamConfig {
  completionsUrl: string
  // Enables the OpenAI Responses API transport for requests with
  // `useResponses`; without it every request uses chat completions.
  responsesUrl?: string
  // Per-request extra headers, e.g. gateway persistence headers or an
  // Authorization header.
  buildHeaders?: (req: StreamRequest) => Record<string, string>
  credentials?: RequestCredentials
  fetch?: typeof globalThis.fetch
}

// Shared OpenAI-compatible streaming transport. Aborting the signal
// propagates the DOMException so callers can distinguish user cancellation
// from failures; other errors surface as ChatAdapterError.
export function createOpenAICompatibleStream(config: OpenAIStreamConfig): StreamCompletion {
  return async (req, handlers, signal) => {
    const responsesUrl = req.useResponses === true ? config.responsesUrl : undefined
    const useResponses = !!responsesUrl
    const url = responsesUrl || config.completionsUrl
    const body: Record<string, unknown> = useResponses
      ? buildResponsesRequestBody(req.model, req.messages)
      : { model: req.model, messages: req.messages, stream: true }
    if (req.resume && !useResponses) {
      body['resume'] = req.resume
    }

    const doFetch = config.fetch ?? globalThis.fetch.bind(globalThis)
    const res = await doFetch(url, {
      method: 'POST',
      headers: requestHeaders(config.buildHeaders?.(req), req.tools),
      ...(config.credentials ? { credentials: config.credentials } : {}),
      body: JSON.stringify(body),
      ...(signal ? { signal } : {}),
    })

    if (!res.ok) {
      throw new ChatAdapterError(await errorMessageFromResponse(res), {
        status: res.status,
      })
    }

    const reader = res.body?.getReader()
    if (!reader) {
      throw new ChatAdapterError('No response body')
    }

    return processSSEStream(
      reader,
      handlers.onContent,
      undefined, // tool calls are returned on the result after the stream completes
      undefined,
      handlers.onReasoning,
      handlers.onMessageId,
      useResponses ? parseResponsesSSELine : undefined,
      handlers.onPart,
      handlers.onUsage,
    )
  }
}
