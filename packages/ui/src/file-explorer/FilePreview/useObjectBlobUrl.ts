import { useEffect, useState } from 'react'
import { CorsError } from '../lib/errors'
import { fetchPreviewObject, loadPreviewContent, peekPreviewContent } from './previewCache'
import { readCappedBytes } from './readCappedBytes'

interface BlobResult {
  blobUrl: string | null
  tooLarge: boolean
}

interface ObjectBlobState {
  blobUrl: string | null
  loading: boolean
  error: string | null
  tooLarge: boolean
  corsError: boolean
}

function toState(result: BlobResult): ObjectBlobState {
  return {
    blobUrl: result.blobUrl,
    loading: false,
    error: null,
    tooLarge: result.tooLarge,
    corsError: false,
  }
}

function disposeBlob(result: BlobResult) {
  if (result.blobUrl) {
    URL.revokeObjectURL(result.blobUrl)
  }
}

/** Fetch an object into a blob URL with a forced MIME type so e.g. PDFs render inline even when served as octet-stream; cached per `cacheKey` so repeated mounts share one download and one blob URL, revoked when the cache drops it. */
export function useObjectBlobUrl(
  url: string | null,
  {
    enabled,
    maxBytes,
    knownSize,
    mimeType,
    cacheKey,
  }: {
    enabled: boolean
    maxBytes: number
    knownSize?: number | undefined
    mimeType: string
    cacheKey: string
  },
): ObjectBlobState {
  const [state, setState] = useState<ObjectBlobState>({
    blobUrl: null,
    loading: enabled,
    error: null,
    tooLarge: false,
    corsError: false,
  })

  const tooLarge = typeof knownSize === 'number' && knownSize > maxBytes
  const key = enabled ? cacheKey : null

  useEffect(() => {
    if (!enabled || !url || !key) {
      return
    }
    if (tooLarge) {
      setState({
        blobUrl: null,
        loading: false,
        error: null,
        tooLarge: true,
        corsError: false,
      })
      return
    }

    let cancelled = false
    const record = loadPreviewContent<BlobResult>(
      key,
      async (signal) => {
        const response = await fetchPreviewObject(key, url, signal)
        const { bytes, tooLarge: exceeded } = await readCappedBytes(response, maxBytes)
        if (exceeded) {
          return { blobUrl: null, tooLarge: true }
        }
        return {
          blobUrl: URL.createObjectURL(new Blob([bytes], { type: mimeType })),
          tooLarge: false,
        }
      },
      disposeBlob,
    )
    setState(
      record.value
        ? toState(record.value)
        : {
            blobUrl: null,
            loading: true,
            error: null,
            tooLarge: false,
            corsError: false,
          },
    )
    record.promise
      .then((result) => {
        if (!cancelled) {
          setState(toState(result))
        }
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === 'AbortError') {
          return
        }
        if (!cancelled) {
          setState({
            blobUrl: null,
            loading: false,
            error: err instanceof Error ? err.message : 'Failed to load file',
            tooLarge: false,
            corsError: err instanceof CorsError,
          })
        }
      })

    return () => {
      cancelled = true
    }
  }, [url, enabled, key, maxBytes, mimeType, tooLarge])

  if (tooLarge) {
    return {
      blobUrl: null,
      loading: false,
      error: null,
      tooLarge: true,
      corsError: false,
    }
  }
  const cached = key ? peekPreviewContent<BlobResult>(key) : undefined
  return cached ? toState(cached) : state
}
