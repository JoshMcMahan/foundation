/** Read a Response body but stop once it passes `maxBytes` (returning `tooLarge`), so an object whose listed size is missing or under-reported can't be pulled fully into the tab. */
export async function readCappedBytes(
  response: Response,
  maxBytes: number,
): Promise<{ bytes: Uint8Array<ArrayBuffer>; tooLarge: boolean }> {
  const reader = response.body?.getReader()
  if (!reader) {
    // No stream to cap incrementally: without a reliable Content-Length the body
    // is unbounded, so refuse (a missing header would coerce to 0 and slip past).
    const header = response.headers.get('content-length')
    const declared = header === null ? Number.NaN : Number(header)
    if (!Number.isFinite(declared) || declared > maxBytes) {
      return { bytes: new Uint8Array(0), tooLarge: true }
    }
    const buffer = new Uint8Array(await response.arrayBuffer())
    return buffer.byteLength > maxBytes
      ? { bytes: new Uint8Array(0), tooLarge: true }
      : { bytes: buffer, tooLarge: false }
  }

  const chunks: Uint8Array[] = []
  let total = 0
  for (let chunk = await reader.read(); !chunk.done; chunk = await reader.read()) {
    total += chunk.value.byteLength
    if (total > maxBytes) {
      await reader.cancel()
      return { bytes: new Uint8Array(0), tooLarge: true }
    }
    chunks.push(chunk.value)
  }

  const bytes = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return { bytes, tooLarge: false }
}

function countNewlines(text: string): number {
  let count = 0
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '\n') {
      count++
    }
  }
  return count
}

/** Lines a preview will render; a trailing newline doesn't open another line. */
export function countLines(text: string): number {
  if (text === '') {
    return 0
  }
  return countNewlines(text) + (text.endsWith('\n') ? 0 : 1)
}

function capLines(text: string, maxLines: number | undefined): string {
  if (maxLines === undefined) {
    return text
  }
  let count = 0
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '\n') {
      count++
      if (count >= maxLines) {
        return text.slice(0, i + 1)
      }
    }
  }
  return text
}

interface CappedText {
  text: string
  tooLarge: boolean
  truncated: boolean
}

/** Reading one line past the cap is what makes `truncated` exact: a body that ends
 * right at `maxLines` is complete, not cut short. */
function capToLines(text: string, maxLines: number | undefined): CappedText {
  if (maxLines === undefined) {
    return { text, tooLarge: false, truncated: false }
  }
  const capped = capLines(text, maxLines)
  return {
    text: capped,
    tooLarge: false,
    truncated: capped.length < text.length,
  }
}

/** What a read yields when the byte cap trips mid-stream. Complete lines already read
 * are a usable preview, so the cap cuts them short rather than refusing; only a body
 * with no line break leaves nothing to show. */
function capAtBytes(text: string, lines: number, maxLines: number | undefined): CappedText {
  if (maxLines === undefined || lines === 0) {
    return { text: '', tooLarge: true, truncated: false }
  }
  return { text: capLines(text, lines), tooLarge: false, truncated: true }
}

/** Read a Response as text capped at `maxBytes`; when `maxLines` is given, cancel the stream
 * once that many `\n` arrive. Cutting on `\n` keeps the returned prefix on a clean UTF-8 boundary. */
export async function readCappedText(
  response: Response,
  maxBytes: number,
  maxLines?: number,
): Promise<CappedText> {
  const probeLines = maxLines === undefined ? undefined : maxLines + 1
  const reader = response.body?.getReader()
  if (!reader) {
    const { bytes, tooLarge } = await readCappedBytes(response, maxBytes)
    if (tooLarge) {
      return { text: '', tooLarge: true, truncated: false }
    }
    return capToLines(new TextDecoder().decode(bytes), maxLines)
  }

  const decoder = new TextDecoder()
  let text = ''
  let lines = 0
  let total = 0
  for (let chunk = await reader.read(); !chunk.done; chunk = await reader.read()) {
    total += chunk.value.byteLength
    if (total > maxBytes) {
      await reader.cancel()
      return capAtBytes(text, lines, maxLines)
    }
    const piece = decoder.decode(chunk.value, { stream: true })
    text += piece
    if (probeLines !== undefined) {
      lines += countNewlines(piece)
      if (lines >= probeLines) {
        await reader.cancel()
        return capToLines(text, maxLines)
      }
    }
  }
  text += decoder.decode()
  return capToLines(text, maxLines)
}

/** Keep the last `maxLines` lines, ignoring a single trailing newline so a file
 * ending in one doesn't spend a line on the empty remainder. */
export function lastLines(text: string, maxLines: number): { text: string; truncated: boolean } {
  const end = text.endsWith('\n') ? text.length - 1 : text.length
  let count = 0
  for (let i = end - 1; i >= 0; i--) {
    if (text[i] === '\n') {
      count++
      if (count === maxLines) {
        return { text: text.slice(i + 1), truncated: true }
      }
    }
  }
  return { text, truncated: false }
}

/** Range header for reading the last `maxBytes` of an object. A closed range is a
 * CORS-safelisted header value, so it travels without a preflight that a bucket's
 * CORS rules may not answer; the suffix form is not safelisted, and is only reached
 * for workspace files, which are same-origin and list no size. Closing the range at
 * the listed size also bounds the window: left open, an object that grew since the
 * listing would serve more than `maxBytes` and the read would refuse it. */
export function tailRangeFor(knownSize: number | undefined, maxBytes: number): string | null {
  if (typeof knownSize !== 'number') {
    return `bytes=-${maxBytes}`
  }
  const start = knownSize - maxBytes
  return start > 0 ? `bytes=${start}-${knownSize - 1}` : null
}

/** What a ranged response actually delivered: whether its first line arrives cut in
 * half, or `null` when the body can't be the object's end at all. */
export function tailWindow(
  response: Response,
  maxBytes: number,
): { startsMidObject: boolean } | null {
  if (response.status === 206) {
    const range = response.headers.get('content-range')
    // Buckets don't expose Content-Range to a cross-origin read, and those are
    // exactly the reads that asked to start mid-object, so treat it as such.
    return { startsMidObject: range === null || !range.startsWith('bytes 0-') }
  }
  // The range was ignored, so the body starts at byte zero. That is still the whole
  // object when it fits the window, and unusable as a tail when it doesn't.
  const length = response.headers.get('content-length')
  if (length === null) {
    return null
  }
  const size = Number(length)
  return Number.isFinite(size) && size <= maxBytes ? { startsMidObject: false } : null
}

/** Read a range covering the end of an object as text. `startsMidObject` says the
 * range began at an arbitrary byte, so the first line arrives cut in half. */
export async function readTailText(
  response: Response,
  maxBytes: number,
  maxLines: number | undefined,
  startsMidObject: boolean,
): Promise<CappedText> {
  const { bytes, tooLarge } = await readCappedBytes(response, maxBytes)
  if (tooLarge) {
    return { text: '', tooLarge: true, truncated: false }
  }

  let text = new TextDecoder().decode(bytes)
  if (startsMidObject) {
    const firstBreak = text.indexOf('\n')
    // A window with no break at all is one enormous partial line; its tail still
    // reads better than an empty preview.
    if (firstBreak !== -1) {
      text = text.slice(firstBreak + 1)
    }
  }

  const limited = maxLines === undefined ? { text, truncated: false } : lastLines(text, maxLines)
  return {
    text: limited.text,
    tooLarge: false,
    truncated: startsMidObject || limited.truncated,
  }
}
