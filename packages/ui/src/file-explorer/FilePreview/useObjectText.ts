import { useEffect, useState } from 'react'
import { CorsError } from '../lib/errors'
import { fetchPreviewObject, loadPreviewContent, peekPreviewContent } from './previewCache'
import { readCappedText, readTailText, tailRangeFor, tailWindow } from './readCappedBytes'

interface TextResult {
  text: string | null
  tooLarge: boolean
  truncated: boolean
}

interface ObjectTextState extends TextResult {
  loading: boolean
  error: string | null
  corsError: boolean
}

const IDLE: ObjectTextState = {
  text: null,
  loading: false,
  error: null,
  tooLarge: false,
  truncated: false,
  corsError: false,
}

function toState(result: TextResult): ObjectTextState {
  return { ...IDLE, ...result }
}

interface ReadOptions {
  url: string
  cacheKey: string
  maxBytes: number
  maxLines: number | undefined
  knownSize: number | undefined
  tail: boolean
}

async function readObjectText(
  signal: AbortSignal,
  { url, cacheKey, maxBytes, maxLines, knownSize, tail }: ReadOptions,
): Promise<TextResult> {
  const range = tail ? tailRangeFor(knownSize, maxBytes) : null
  const response = await fetchPreviewObject(
    cacheKey,
    url,
    signal,
    range ? { Range: range } : undefined,
  )

  let startsMidObject = false
  if (range) {
    const window = tailWindow(response, maxBytes)
    // Refuse rather than label the head of the object as its end.
    if (!window) {
      throw new Error('range request was not honored')
    }
    startsMidObject = window.startsMidObject
  }

  const result = tail
    ? await readTailText(response, maxBytes, maxLines, startsMidObject)
    : await readCappedText(response, maxBytes, maxLines)
  return {
    text: result.tooLarge ? null : result.text,
    tooLarge: result.tooLarge,
    truncated: result.truncated,
  }
}

/** Fetch a text object from a presigned URL, cached per `cacheKey` so repeated mounts
 * download it once. `maxLines` stops the read early and `maxBytes` cuts short what it
 * hasn't. `tail` reads the end of the object instead of the start, and caches
 * separately because the same object yields different text. */
export function useObjectText(
  url: string | null,
  {
    enabled,
    maxBytes,
    maxLines,
    knownSize,
    cacheKey,
    tail = false,
  }: {
    enabled: boolean
    maxBytes: number
    maxLines?: number | undefined
    knownSize?: number | undefined
    cacheKey: string
    tail?: boolean | undefined
  },
): ObjectTextState {
  // Only an uncapped read has to refuse up front: with a line cap the stream stops
  // on its own, so a huge object is still previewable a screenful at a time.
  const tooLarge =
    maxLines === undefined && !tail && typeof knownSize === 'number' && knownSize > maxBytes
  const key = enabled ? (tail ? `${cacheKey}#tail` : cacheKey) : null

  const [state, setState] = useState<ObjectTextState>({
    ...IDLE,
    loading: enabled,
  })
  // Drop the previous read's state the moment the key changes, so toggling between
  // head and tail can't show one under the other's label.
  const [stateKey, setStateKey] = useState(key)
  if (stateKey !== key) {
    setStateKey(key)
    setState({ ...IDLE, loading: key !== null })
  }

  useEffect(() => {
    if (!enabled || !url || !key) {
      return
    }
    if (tooLarge) {
      setState({ ...IDLE, tooLarge: true })
      return
    }

    let cancelled = false
    const record = loadPreviewContent<TextResult>(key, (signal) =>
      readObjectText(signal, {
        url,
        cacheKey,
        maxBytes,
        maxLines,
        knownSize,
        tail,
      }),
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
  }, [url, enabled, key, maxBytes, maxLines, tooLarge, tail, cacheKey, knownSize])

  if (tooLarge) {
    return { ...IDLE, tooLarge: true }
  }
  const cached = key ? peekPreviewContent<TextResult>(key) : undefined
  return cached ? toState(cached) : state
}
