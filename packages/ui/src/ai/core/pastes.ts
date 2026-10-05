import type { MessagePaste } from '../types'

/** Pastes this small never turn into a card, whatever the model. */
export const PASTE_CARD_MIN_BYTES = 1000

/** The most text sent inline, for one paste and for a whole message. */
export const PASTE_INLINE_CAP = 1 << 20
const DEFAULT_CONTEXT_WINDOW = 128_000

const encoder = new TextEncoder()

export function utf8Bytes(text: string): number {
  return encoder.encode(text).length
}

/** Terminals and some browsers put CR line endings on the clipboard. */
export function normalizeNewlines(text: string): string {
  return text.replace(/\r\n?/g, '\n')
}

/** Counts lines as a paste's label shows them: a final newline starts none. */
export function countLines(text: string): number {
  return (text.endsWith('\n') ? text.slice(0, -1) : text).split('\n').length
}

/** The inline limit for a context window, for a host that has not reported its own. */
export function pasteInlineMaxBytes(contextWindow: number | undefined): number {
  return Math.min(
    Math.floor(((contextWindow || DEFAULT_CONTEXT_WINDOW) * 4) / 10),
    PASTE_INLINE_CAP,
  )
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Splits a message into its text and the pastes its placeholders stand for. */
export function splitPastes(content: string, pastes: MessagePaste[]): (string | MessagePaste)[] {
  const byPlaceholder = new Map(pastes.map((p) => [p.placeholder, p]))
  if (byPlaceholder.size === 0) {
    return [content]
  }
  const pattern = new RegExp([...byPlaceholder.keys()].map(escapeRegExp).join('|'), 'g')
  const out: (string | MessagePaste)[] = []
  let last = 0
  for (const match of content.matchAll(pattern)) {
    if (match.index > last) {
      out.push(content.slice(last, match.index))
    }
    const paste = byPlaceholder.get(match[0])
    if (paste) {
      out.push(paste)
    }
    last = match.index + match[0].length
  }
  if (last < content.length) {
    out.push(content.slice(last))
  }
  return out
}
