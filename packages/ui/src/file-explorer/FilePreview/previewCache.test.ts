import { afterEach, describe, expect, it, vi } from 'vitest'
import { CorsError } from '../lib/errors'
import {
  clearPreviewCache,
  fetchPreviewObject,
  loadPreviewContent,
  loadPreviewUrl,
  peekPreviewContent,
  peekPreviewUrl,
} from './previewCache'

afterEach(() => {
  clearPreviewCache()
  vi.unstubAllGlobals()
})

describe('loadPreviewUrl', () => {
  it('requests one presigned URL per path and shares it across mounts', async () => {
    const loader = vi.fn(async () => ['https://signed/a', null] as [string, null])

    const first = loadPreviewUrl('a', loader)
    const second = loadPreviewUrl('a', loader)

    expect(second).toBe(first)
    expect(loader).toHaveBeenCalledTimes(1)
    await first.promise
    expect(peekPreviewUrl('a')).toEqual(['https://signed/a', null])
  })

  it('does not cache a failed result, so a later mount retries', async () => {
    const failing = vi.fn(async () => [null, new Error('nope')] as [null, Error])
    const record = loadPreviewUrl('a', failing)
    await record.promise
    expect(peekPreviewUrl('a')).toBeUndefined()

    loadPreviewUrl('a', failing)
    expect(failing).toHaveBeenCalledTimes(2)
  })
})

describe('loadPreviewContent', () => {
  it('downloads a path once and shares the value across mounts', async () => {
    const loader = vi.fn(async () => ({ text: 'hello' }))

    const first = loadPreviewContent('a', loader)
    const second = loadPreviewContent('a', loader)

    expect(second).toBe(first)
    expect(loader).toHaveBeenCalledTimes(1)
    await first.promise
    expect(peekPreviewContent('a')).toEqual({ text: 'hello' })
  })

  it('does not cache a rejected download, so a later mount retries', async () => {
    const failing = vi.fn(async () => {
      throw new Error('network')
    })
    const record = loadPreviewContent('a', failing)
    await expect(record.promise).rejects.toThrow('network')
    expect(peekPreviewContent('a')).toBeUndefined()

    loadPreviewContent('a', failing).promise.catch(() => {})
    expect(failing).toHaveBeenCalledTimes(2)
  })

  it('evicts and disposes the oldest entry past the cap, aborting its download', async () => {
    const dispose = vi.fn()
    const a = loadPreviewContent('a', async () => ({ v: 'a' }), dispose)
    await a.promise
    await loadPreviewContent('b', async () => ({ v: 'b' })).promise

    loadPreviewContent('c', async () => ({ v: 'c' }))

    expect(peekPreviewContent('a')).toBeUndefined()
    expect(a.controller.signal.aborted).toBe(true)
    expect(dispose).toHaveBeenCalledWith({ v: 'a' })
    expect(peekPreviewContent('b')).toEqual({ v: 'b' })
  })

  it('keeps a re-accessed entry newest so a later insert evicts a different one', async () => {
    await loadPreviewContent('a', async () => ({ v: 'a' })).promise
    await loadPreviewContent('b', async () => ({ v: 'b' })).promise

    loadPreviewContent('a', async () => ({ v: 'a' }))
    loadPreviewContent('c', async () => ({ v: 'c' }))

    expect(peekPreviewContent('b')).toBeUndefined()
    expect(peekPreviewContent('a')).toEqual({ v: 'a' })
  })
})

describe('fetchPreviewObject', () => {
  const signedUrl = ['https://signed/a', null] as [string, null]

  it('drops the cached URL on a 403 so the next mount re-presigns', async () => {
    const loader = vi.fn(async () => signedUrl)
    await loadPreviewUrl('a', loader).promise
    expect(peekPreviewUrl('a')).toEqual(signedUrl)

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(null, { status: 403 })),
    )
    await expect(
      fetchPreviewObject('a', 'https://signed/a', new AbortController().signal),
    ).rejects.toThrow('Failed to load file (403)')

    expect(peekPreviewUrl('a')).toBeUndefined()
    loadPreviewUrl('a', loader)
    expect(loader).toHaveBeenCalledTimes(2)
  })

  it('keeps the cached URL when the failure is not an auth error', async () => {
    const loader = vi.fn(async () => signedUrl)
    await loadPreviewUrl('a', loader).promise

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(null, { status: 500 })),
    )
    await expect(
      fetchPreviewObject('a', 'https://signed/a', new AbortController().signal),
    ).rejects.toThrow('Failed to load file (500)')

    expect(peekPreviewUrl('a')).toEqual(signedUrl)
  })

  it('returns the response when the fetch succeeds', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('body', { status: 200 })),
    )
    const response = await fetchPreviewObject('a', 'https://signed/a', new AbortController().signal)
    expect(response.ok).toBe(true)
    await expect(response.text()).resolves.toBe('body')
  })

  it('surfaces a cross-origin block as a CorsError', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch')
      }),
    )
    await expect(
      fetchPreviewObject('a', 'https://signed/a', new AbortController().signal),
    ).rejects.toBeInstanceOf(CorsError)
  })

  it('rethrows an abort without treating it as a CorsError', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new DOMException('aborted', 'AbortError')
      }),
    )
    const error = await fetchPreviewObject(
      'a',
      'https://signed/a',
      new AbortController().signal,
    ).catch((e) => e)
    expect(error).toBeInstanceOf(DOMException)
    expect(error).not.toBeInstanceOf(CorsError)
  })
})

describe('clearPreviewCache', () => {
  it('aborts downloads, disposes values, and empties both caches', async () => {
    const dispose = vi.fn()
    loadPreviewUrl('a', async () => ['https://signed/a', null] as [string, null])
    const content = loadPreviewContent('a', async () => ({ v: 'a' }), dispose)
    await content.promise

    clearPreviewCache()

    expect(peekPreviewUrl('a')).toBeUndefined()
    expect(peekPreviewContent('a')).toBeUndefined()
    expect(content.controller.signal.aborted).toBe(true)
    expect(dispose).toHaveBeenCalledWith({ v: 'a' })
  })
})
