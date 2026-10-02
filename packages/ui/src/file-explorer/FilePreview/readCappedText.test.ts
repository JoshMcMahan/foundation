import { describe, expect, it } from 'vitest'
import {
  countLines,
  lastLines,
  readCappedText,
  readTailText,
  tailRangeFor,
  tailWindow,
} from './readCappedBytes'

function makeStreamResponse(chunks: string[]) {
  const encoder = new TextEncoder()
  const queue = [...chunks]
  const state = { pulled: 0, cancelled: false }
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      const next = queue.shift()
      if (next === undefined) {
        controller.close()
        return
      }
      state.pulled++
      controller.enqueue(encoder.encode(next))
    },
    cancel() {
      state.cancelled = true
    },
  })
  return { response: new Response(stream), state }
}

describe('readCappedText', () => {
  it('cancels the stream once maxLines terminators arrive and returns only that prefix', async () => {
    const { response, state } = makeStreamResponse(['a\nb\n', 'c\nd\n', 'e\nf\n'])
    const { text, tooLarge } = await readCappedText(response, 1_000, 3)
    expect(text).toBe('a\nb\nc\n')
    expect(tooLarge).toBe(false)
    expect(state.cancelled).toBe(true)
    expect(state.pulled).toBe(2)
  })

  it('reads the whole stream when maxLines is not given', async () => {
    const { response } = makeStreamResponse(['a\nb\n', 'c\n'])
    const { text, tooLarge } = await readCappedText(response, 1_000)
    expect(text).toBe('a\nb\nc\n')
    expect(tooLarge).toBe(false)
  })

  it('returns the full body when the stream ends before maxLines', async () => {
    const { response } = makeStreamResponse(['a\nb\n'])
    const { text, tooLarge } = await readCappedText(response, 1_000, 10)
    expect(text).toBe('a\nb\n')
    expect(tooLarge).toBe(false)
  })

  it('reports tooLarge when the stream passes maxBytes with no line to cut on', async () => {
    const { response, state } = makeStreamResponse(['aaaa', 'bbbb'])
    const { text, tooLarge } = await readCappedText(response, 3, 100)
    expect(tooLarge).toBe(true)
    expect(text).toBe('')
    expect(state.cancelled).toBe(true)
  })

  it('keeps the complete lines already read when maxBytes trips before maxLines', async () => {
    const { response, state } = makeStreamResponse(['a\nb\n', 'c\nd\n'])
    const { text, tooLarge, truncated } = await readCappedText(response, 5, 100)
    expect(text).toBe('a\nb\n')
    expect(tooLarge).toBe(false)
    expect(truncated).toBe(true)
    expect(state.cancelled).toBe(true)
  })

  it('drops the incomplete trailing line when maxBytes trips', async () => {
    const { response } = makeStreamResponse(['a\nb\nhalf', 'rest\n'])
    const { text, tooLarge, truncated } = await readCappedText(response, 9, 100)
    expect(text).toBe('a\nb\n')
    expect(tooLarge).toBe(false)
    expect(truncated).toBe(true)
  })

  it('still refuses when there is no line cap to fall back on', async () => {
    const { response } = makeStreamResponse(['a\nb\n', 'c\nd\n'])
    const { text, tooLarge } = await readCappedText(response, 5)
    expect(text).toBe('')
    expect(tooLarge).toBe(true)
  })

  it('falls back to a byte-capped read and still caps lines when there is no stream', async () => {
    const fake = {
      body: null,
      headers: new Headers({ 'content-length': '6' }),
      arrayBuffer: async () => new TextEncoder().encode('a\nb\nc\n').buffer,
    } as unknown as Response
    const { text, tooLarge } = await readCappedText(fake, 100, 2)
    expect(text).toBe('a\nb\n')
    expect(tooLarge).toBe(false)
  })

  it('reports truncated when the body continues past maxLines', async () => {
    const { response } = makeStreamResponse(['a\nb\nc\nd\n'])
    const { text, truncated } = await readCappedText(response, 1_000, 3)
    expect(text).toBe('a\nb\nc\n')
    expect(truncated).toBe(true)
  })

  it('does not report truncated when the body ends exactly at maxLines', async () => {
    const { response } = makeStreamResponse(['a\nb\nc\n'])
    const { text, truncated } = await readCappedText(response, 1_000, 3)
    expect(text).toBe('a\nb\nc\n')
    expect(truncated).toBe(false)
  })
})

describe('lastLines', () => {
  it('keeps the final lines and ignores the trailing newline', () => {
    expect(lastLines('a\nb\nc\n', 2)).toEqual({
      text: 'b\nc\n',
      truncated: true,
    })
  })

  it('keeps everything when the text has fewer lines than the cap', () => {
    expect(lastLines('a\nb\n', 5)).toEqual({ text: 'a\nb\n', truncated: false })
  })

  it('keeps the final line when the text does not end in a newline', () => {
    expect(lastLines('a\nb\nc', 1)).toEqual({ text: 'c', truncated: true })
  })
})

describe('readTailText', () => {
  it('drops the half line the range starts on, then caps lines', async () => {
    const { response } = makeStreamResponse(['alf\nb\nc\nd\n'])
    const { text, truncated } = await readTailText(response, 1_000, 2, true)
    expect(text).toBe('c\nd\n')
    expect(truncated).toBe(true)
  })

  it('keeps the whole body when the range covers the object', async () => {
    const { response } = makeStreamResponse(['a\nb\n'])
    const { text, truncated } = await readTailText(response, 1_000, 5, false)
    expect(text).toBe('a\nb\n')
    expect(truncated).toBe(false)
  })

  it('keeps a window with no line break rather than emptying the preview', async () => {
    const { response } = makeStreamResponse(['abcdef'])
    const { text, truncated } = await readTailText(response, 1_000, 2, true)
    expect(text).toBe('abcdef')
    expect(truncated).toBe(true)
  })

  it('reports tooLarge when the window passes maxBytes', async () => {
    const { response } = makeStreamResponse(['aaaa', 'bbbb'])
    const { text, tooLarge } = await readTailText(response, 3, 2, false)
    expect(text).toBe('')
    expect(tooLarge).toBe(true)
  })
})

describe('tailRangeFor', () => {
  it('asks for a closed range when the size is known, so the read stays preflight-free', () => {
    expect(tailRangeFor(30, 10)).toBe('bytes=20-29')
  })

  it('bounds the window at maxBytes so growth past the listed size cannot overrun it', () => {
    expect(tailRangeFor(20_000, 10_000)).toBe('bytes=10000-19999')
  })

  it('skips the range when the object already fits the window', () => {
    expect(tailRangeFor(10, 10)).toBeNull()
    expect(tailRangeFor(4, 10)).toBeNull()
  })

  it('falls back to a suffix range when the listing carries no size', () => {
    expect(tailRangeFor(undefined, 10)).toBe('bytes=-10')
  })
})

describe('tailWindow', () => {
  function ranged(status: number, headers: Record<string, string>) {
    return new Response('body', { status, headers })
  }

  it('reports a mid-object start for a range that begins past byte zero', () => {
    const response = ranged(206, { 'content-range': 'bytes 20-29/30' })
    expect(tailWindow(response, 10)).toEqual({ startsMidObject: true })
  })

  it('reports no cut when the served range covers the whole object', () => {
    const response = ranged(206, { 'content-range': 'bytes 0-3/4' })
    expect(tailWindow(response, 10)).toEqual({ startsMidObject: false })
  })

  it('assumes a mid-object start when Content-Range is not exposed', () => {
    expect(tailWindow(ranged(206, {}), 10)).toEqual({ startsMidObject: true })
  })

  it('accepts an ignored range when the whole object fits the window', () => {
    const response = ranged(200, { 'content-length': '4' })
    expect(tailWindow(response, 10)).toEqual({ startsMidObject: false })
  })

  it('rejects an ignored range on an object larger than the window', () => {
    expect(tailWindow(ranged(200, { 'content-length': '4000' }), 10)).toBeNull()
  })

  it('rejects an ignored range of unknown length', () => {
    expect(tailWindow(ranged(200, {}), 10)).toBeNull()
  })
})

describe('countLines', () => {
  it('counts rendered lines', () => {
    expect(countLines('')).toBe(0)
    expect(countLines('a')).toBe(1)
    expect(countLines('a\n')).toBe(1)
    expect(countLines('a\nb')).toBe(2)
    expect(countLines('a\nb\n')).toBe(2)
  })
})
