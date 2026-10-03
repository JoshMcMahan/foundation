import { CorsError } from '../lib/errors'

// The inline preview and the full-screen modal are separate mounts of the same
// object, keyed here on node.path so they share one presigned URL and one
// download and — via peekPreview* during render — skip a second loader. Reuse is
// safe because the signed URL outlives a viewing session (PREVIEW_URL_EXPIRES_IN).
// The oldest entry is dropped past MAX_ENTRIES (aborting its download, revoking its
// blob URL); clearPreviewCache frees everything on unmount.

const MAX_ENTRIES = 2

type UrlResult = [string | null, Error | null]

interface UrlRecord {
  promise: Promise<UrlResult>
  value?: UrlResult
}

interface ContentRecord<T> {
  promise: Promise<T>
  value?: T
  controller: AbortController
  dispose?: ((value: T) => void) | undefined
}

const urlCache = new Map<string, UrlRecord>()
const contentCache = new Map<string, ContentRecord<unknown>>()

function trim<T>(cache: Map<string, T>, onEvict: (value: T) => void) {
  while (cache.size > MAX_ENTRIES) {
    const oldest = cache.keys().next().value
    if (oldest === undefined) {
      return
    }
    const evicted = cache.get(oldest)
    cache.delete(oldest)
    if (evicted !== undefined) {
      onEvict(evicted)
    }
  }
}

function disposeContent(record: ContentRecord<unknown>) {
  record.controller.abort()
  if (record.value !== undefined) {
    record.dispose?.(record.value)
  }
}

function moveToNewest<T>(cache: Map<string, T>, path: string, record: T) {
  cache.delete(path)
  cache.set(path, record)
}

/** Request a presigned URL for `path` once and remember the result; a failed or
 * empty result is not cached so a later mount retries. */
export function loadPreviewUrl(path: string, loader: () => Promise<UrlResult>): UrlRecord {
  const existing = urlCache.get(path)
  if (existing) {
    moveToNewest(urlCache, path, existing)
    return existing
  }
  const record: UrlRecord = { promise: loader() }
  record.promise
    .then((value) => {
      if (value[0] && !value[1]) {
        record.value = value
      } else if (urlCache.get(path) === record) {
        urlCache.delete(path)
      }
    })
    .catch(() => {
      if (urlCache.get(path) === record) {
        urlCache.delete(path)
      }
    })
  urlCache.set(path, record)
  trim(urlCache, () => {})
  return record
}

/** Fetch the object for `path` once and remember it; `dispose` frees the value
 * (e.g. revokes a blob URL) when the entry is evicted. A rejected fetch is not
 * cached so a later mount retries. */
export function loadPreviewContent<T>(
  path: string,
  loader: (signal: AbortSignal) => Promise<T>,
  dispose?: (value: T) => void,
): ContentRecord<T> {
  const existing = contentCache.get(path) as ContentRecord<T> | undefined
  if (existing) {
    moveToNewest(contentCache, path, existing as ContentRecord<unknown>)
    return existing
  }
  const controller = new AbortController()
  const record: ContentRecord<T> = {
    promise: loader(controller.signal),
    controller,
    dispose,
  }
  record.promise
    .then((value) => {
      record.value = value
    })
    .catch(() => {
      if (contentCache.get(path) === (record as ContentRecord<unknown>)) {
        contentCache.delete(path)
      }
    })
  contentCache.set(path, record as ContentRecord<unknown>)
  trim(contentCache, disposeContent)
  return record
}

/** Fetch a preview object over its signed URL; a 401/403 means the URL is stale
 * or unauthorized, so drop it from the cache and let the next mount fetch a fresh
 * one instead of replaying the dead one. */
export async function fetchPreviewObject(
  path: string,
  url: string,
  signal: AbortSignal,
  headers?: HeadersInit,
): Promise<Response> {
  let response: Response
  try {
    // This reads a signed preview URL outside the product API.
    response = await fetch(url, {
      signal,
      ...(headers ? { headers } : {}),
    })
  } catch (error) {
    // A CORS-blocked cross-origin read rejects as a TypeError; an abort is an AbortError.
    if (error instanceof TypeError) {
      throw new CorsError()
    }
    throw error
  }
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      urlCache.delete(path)
    }
    throw new Error(`Failed to load file (${response.status})`)
  }
  return response
}

export function peekPreviewUrl(path: string): UrlResult | undefined {
  return urlCache.get(path)?.value
}

export function peekPreviewContent<T>(path: string): T | undefined {
  return (contentCache.get(path) as ContentRecord<T> | undefined)?.value
}

export function clearPreviewCache() {
  for (const record of contentCache.values()) {
    disposeContent(record)
  }
  contentCache.clear()
  urlCache.clear()
}
