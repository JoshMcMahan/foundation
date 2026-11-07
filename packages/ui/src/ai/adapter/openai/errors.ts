export function apiErrorMessage(errorData: unknown, fallback: string): string {
  if (typeof errorData !== 'object' || errorData === null) {
    return fallback
  }
  const data = errorData as Record<string, unknown>
  const candidate = data['message'] ?? data['error'] ?? data['detail']
  if (typeof candidate === 'string' && candidate.trim()) {
    return candidate
  }
  if (candidate && typeof candidate === 'object') {
    const nested = (candidate as Record<string, unknown>)['message']
    if (typeof nested === 'string' && nested.trim()) {
      return nested
    }
    try {
      return JSON.stringify(candidate)
    } catch {
      return fallback
    }
  }
  return fallback
}

export function statusFallbackMessage(status: number): string {
  if (status === 401) {
    return 'Your session has expired. Please refresh the page and try again.'
  }
  if (status === 403) {
    return 'You do not have permission to use this AI provider.'
  }
  if (status === 404) {
    return 'The AI provider or model was not found. Please select a different provider.'
  }
  if (status === 429) {
    return 'Too many requests. Please wait a moment and try again.'
  }
  if (status >= 500) {
    return 'The AI service is temporarily unavailable. Please try again later.'
  }
  return 'Failed to send message'
}

// A failed completion response as the chat shows it: what went wrong, and
// when the service said the request can be sent again.
export interface ResponseFailure {
  message: string
  // An ISO time.
  retryAt?: string | undefined
}

// The data of an error sent as a stream event, as a gateway answers a streamed
// request it refuses before streaming anything.
function eventData(text: string): string | null {
  const data = text
    .split(/\r?\n/)
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).replace(/^ /, ''))
  return data.length ? data.join('\n') : null
}

function seconds(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null
}

// Retry-After first, then the body's own fields: a gateway's retry_after_seconds,
// or a usage limit's resets_in_seconds and resets_at (Unix seconds). The relative
// fields come before resets_at, which a skewed clock would misread.
function retryAtOf(header: string | null, body: unknown): string | undefined {
  const now = Date.now()
  if (header?.trim()) {
    const delay = /^\d+(\.\d+)?$/.test(header.trim())
      ? Number(header) * 1000
      : Date.parse(header) - now
    if (Number.isFinite(delay)) {
      return new Date(now + Math.max(delay, 0)).toISOString()
    }
  }
  if (typeof body !== 'object' || body === null) {
    return undefined
  }
  const top = body as Record<string, unknown>
  const error =
    typeof top['error'] === 'object' && top['error'] !== null
      ? (top['error'] as Record<string, unknown>)
      : {}
  for (const key of ['retry_after_seconds', 'resets_in_seconds']) {
    const wait = seconds(error[key]) ?? seconds(top[key])
    if (wait !== null) {
      return new Date(now + wait * 1000).toISOString()
    }
  }
  const resetsAt = seconds(error['resets_at']) ?? seconds(top['resets_at'])
  return resetsAt === null ? undefined : new Date(resetsAt * 1000).toISOString()
}

// Best user-facing message for a failed completion response: the body's error
// message when parseable, whether JSON or a stream event, a raw text body for
// client errors, otherwise a status-based fallback.
export async function responseFailure(res: Response): Promise<ResponseFailure> {
  let message = statusFallbackMessage(res.status)
  let body: unknown
  try {
    const contentType = res.headers.get('content-type') ?? ''
    const text = await res.text()
    const json = contentType.includes('application/json')
      ? text
      : contentType.includes('text/event-stream')
        ? eventData(text)
        : null
    if (json) {
      body = JSON.parse(json)
      message = apiErrorMessage(body, message)
    } else if (text && res.status < 500) {
      message = text.substring(0, 200)
    }
  } catch {
    // fall through to the status-based message
  }
  const retryAt = retryAtOf(res.headers.get('retry-after'), body)
  return retryAt ? { message, retryAt } : { message }
}

/** The message `responseFailure` reads off a failed response. */
export async function errorMessageFromResponse(res: Response): Promise<string> {
  return (await responseFailure(res)).message
}
