import { useCallback, useEffect, useRef, useState } from 'react'
import {
  countLines,
  normalizeNewlines,
  PASTE_CARD_MIN_BYTES,
  PASTE_INLINE_CAP,
  utf8Bytes,
} from '../core/pastes'
import type { MessagePaste } from '../types'

export type PasteUploadResult =
  | { paste: MessagePaste }
  | { error: string }
  // The target cannot store pastes, so the text goes into the box after all.
  | { unsupported: true }

/** Pastes over inlineMaxBytes are saved with the target and sent by placeholder; undefined keeps them text. */
export interface ComposerPastes {
  inlineMaxBytes: number | undefined
  upload: (text: string) => Promise<PasteUploadResult>
}

/** A paste waiting in the composer as a file card; paste is set once saved. */
export interface PasteCard {
  key: string
  text: string
  lines: number
  bytes: number
  paste?: MessagePaste
  error?: string
}

function appendText(box: string, text: string): string {
  return box.trim() ? `${box}\n\n${text}` : text
}

/** Keeps the composer's cards in step with the model, so text or card shows how each paste is sent. */
export function usePasteCards(
  pastes: ComposerPastes | undefined,
  input: string,
  setInput: (value: string) => void,
) {
  const [cards, setCards] = useState<PasteCard[]>([])
  // Large pastes that went into the box as text, so a model with a smaller
  // window can turn them into cards while they are still there verbatim.
  const inBox = useRef<string[]>([])
  // Pastes already saved, by their text, so one moving between the box and a
  // card as the limit settles is not saved again under a new number.
  const saved = useRef(new Map<string, MessagePaste>())
  // Cards still waiting on their upload; one removed, sent, or moved into the
  // box meanwhile must not have its text put back when the upload answers.
  const uploading = useRef(new Set<string>())
  const seq = useRef(0)
  const latest = useRef({ cards, input, pastes, setInput })
  latest.current = { cards, input, pastes, setInput }

  const addCard = useCallback((text: string) => {
    const target = latest.current.pastes
    if (!target) {
      return
    }
    seq.current += 1
    const card: PasteCard = {
      key: `paste-${seq.current}`,
      text,
      lines: countLines(text),
      bytes: utf8Bytes(text),
    }
    const known = saved.current.get(text)
    if (known) {
      setCards((current) => [...current, { ...card, paste: known }])
      return
    }
    setCards((current) => [...current, card])
    uploading.current.add(card.key)
    const settle = (result: PasteUploadResult) => {
      const waiting = uploading.current.delete(card.key)
      if ('unsupported' in result) {
        setCards((current) => current.filter((c) => c.key !== card.key))
        if (waiting) {
          latest.current.setInput(appendText(latest.current.input, text))
        }
        return
      }
      if ('paste' in result) {
        saved.current.set(text, result.paste)
      }
      setCards((current) =>
        current.map((c) => {
          if (c.key !== card.key) {
            return c
          }
          return 'error' in result ? { ...c, error: result.error } : { ...c, paste: result.paste }
        }),
      )
    }
    target
      .upload(text)
      .then(settle, (err: unknown) =>
        settle({ error: err instanceof Error ? err.message : String(err) }),
      )
  }, [])

  /** Reports whether the paste became a card, so the caller stops the browser pasting it too. */
  const handleTextPaste = (raw: string): boolean => {
    if (!pastes || !raw) {
      return false
    }
    const text = normalizeNewlines(raw)
    const bytes = utf8Bytes(text)
    if (
      pastes.inlineMaxBytes === undefined ||
      (bytes <= pastes.inlineMaxBytes && utf8Bytes(input) + bytes <= PASTE_INLINE_CAP)
    ) {
      if (bytes >= PASTE_CARD_MIN_BYTES) {
        inBox.current.push(text)
      }
      return false
    }
    addCard(text)
    return true
  }

  const inlineMax = pastes?.inlineMaxBytes
  useEffect(() => {
    if (inlineMax === undefined) {
      return
    }
    const { cards: current, input: box, setInput: set } = latest.current
    const boxed = inBox.current.filter((text) => box.includes(text))
    const outgrown = boxed.filter((text) => utf8Bytes(text) > inlineMax)
    let boxBytes = utf8Bytes(box) - outgrown.reduce((sum, text) => sum + utf8Bytes(text), 0)
    // Pastes that each fit can still add up past what one message takes
    // inline; the latest become cards first.
    for (const text of boxed.toReversed()) {
      if (boxBytes <= PASTE_INLINE_CAP) {
        break
      }
      if (!outgrown.includes(text)) {
        outgrown.push(text)
        boxBytes -= utf8Bytes(text)
      }
    }
    const fitting = current.filter((c) => {
      if (c.bytes > inlineMax || boxBytes + c.bytes > PASTE_INLINE_CAP) {
        return false
      }
      boxBytes += c.bytes
      return true
    })
    if (fitting.length === 0 && outgrown.length === 0) {
      return
    }
    let next = box
    for (const text of outgrown) {
      next = next.replace(text, () => '')
    }
    for (const card of fitting) {
      next = appendText(next, card.text)
      uploading.current.delete(card.key)
    }
    inBox.current = [
      ...inBox.current.filter((text) => !outgrown.includes(text)),
      ...fitting.map((c) => c.text),
    ]
    setCards((cs) => cs.filter((c) => !fitting.some((f) => f.key === c.key)))
    set(next)
    for (const text of outgrown) {
      addCard(text)
    }
  }, [inlineMax, addCard])

  const removeCard = useCallback((key: string) => {
    uploading.current.delete(key)
    setCards((current) => current.filter((c) => c.key !== key))
  }, [])

  /** Empties the cards, answering with the pastes that were saved. */
  const takeCards = useCallback((): MessagePaste[] => {
    const sent = latest.current.cards.flatMap((c) => (c.paste ? [c.paste] : []))
    setCards([])
    uploading.current.clear()
    inBox.current = []
    saved.current.clear()
    return sent
  }, [])

  return {
    cards,
    handleTextPaste,
    removeCard,
    takeCards,
    blocking: cards.some((c) => !c.paste),
  }
}
