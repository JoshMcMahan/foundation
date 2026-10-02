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

// Best user-facing message for a failed completion response: the body's error
// message when parseable, a raw text body for client errors, otherwise a
// status-based fallback.
export async function errorMessageFromResponse(res: Response): Promise<string> {
  let message = statusFallbackMessage(res.status)
  try {
    const contentType = res.headers.get('content-type')
    const text = await res.text()
    if (contentType?.includes('application/json') && text) {
      message = apiErrorMessage(JSON.parse(text), message)
    } else if (text && res.status < 500) {
      message = text.substring(0, 200)
    }
  } catch {
    // fall through to the status-based message
  }
  return message
}
