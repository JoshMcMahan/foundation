import { useEffect, useState } from 'react'
import { CorsError } from '../lib/errors'
import { fetchPreviewObject, loadPreviewContent, peekPreviewContent } from './previewCache'
import { readCappedBytes } from './readCappedBytes'

interface BlobResult {
  blobUrl: string | null
  tooLarge: boolean
}

interface ObjectBlobState extends BlobResult {
  loading: boolean
  error: string | null
  corsError: boolean
}

const IDLE: ObjectBlobState = {
  blobUrl: null,
  loading: false,
  error: null,
  tooLarge: false,
  corsError: false,
}

function toState(result: BlobResult): ObjectBlobState {
  return { ...IDLE, ...result }
}

function disposeBlob(result: BlobResult) {
  if (result.blobUrl) {
    URL.revokeObjectURL(result.blobUrl)
  }
}

/** Fetch an object into a blob URL with a forced MIME type so e.g. PDFs render inline even when served as octet-stream; cached per `cacheKey` so repeated mounts share one download and one blob URL, revoked when the cache drops it. */
export function useObjectBlobUrl(
  url: string,
  {
    maxBytes,
    knownSize,
    mimeType,
    cacheKey,
  }: {
    maxBytes: number
    knownSize?: number | undefined
    mimeType: string
    cacheKey: string
  },
): ObjectBlobState {
  const [state, setState] = useState<ObjectBlobState>({ ...IDLE, loading: true })

  const tooLarge = typeof knownSize === 'number' && knownSize > maxBytes

  useEffect(() => {
    if (tooLarge) {
      setState({ ...IDLE, tooLarge: true })
      return
    }

    let cancelled = false
    const record = loadPreviewContent<BlobResult>(
      cacheKey,
      async (signal) => {
        const response = await fetchPreviewObject(cacheKey, url, signal)
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
    setState(record.value ? toState(record.value) : { ...IDLE, loading: true })
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
            ...IDLE,
            error: err instanceof Error ? err.message : 'Failed to load file',
            corsError: err instanceof CorsError,
          })
        }
      })

    return () => {
      cancelled = true
    }
  }, [url, cacheKey, maxBytes, mimeType, tooLarge])

  if (tooLarge) {
    return { ...IDLE, tooLarge: true }
  }
  const cached = peekPreviewContent<BlobResult>(cacheKey)
  return cached ? toState(cached) : state
}
