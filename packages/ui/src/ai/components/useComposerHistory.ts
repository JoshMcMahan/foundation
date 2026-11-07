import { type KeyboardEvent, useEffect, useRef } from 'react'
import { appendHistory, readHistory } from './chatHistory'

export interface ComposerHistory {
  /** Composers with the same name in a tab share one history, which ends with the tab. */
  name: string
  /** Text to forget, such as a command carrying a secret: no history, no draft, no return from a failed send. */
  skip?: ((text: string) => boolean) | undefined
}

interface Walk {
  entries: string[]
  index: number
}

/** ↑ and ↓ step through what was sent, as a shell's history does. A walk starts
 *  from an empty box, so arrows in a draft still move the caret. Moving the caret
 *  off the end of a recalled entry hands the arrows back too, so a long entry
 *  can be edited. */
export function useComposerHistory(
  history: ComposerHistory | undefined,
  input: string,
  setInput: (value: string) => void,
) {
  const walk = useRef<Walk | null>(null)
  const recalled = walk.current?.entries[walk.current.index] === input

  // An edit ends the walk, or retyping an entry's text would read as recalling it.
  useEffect(() => {
    if (!recalled) {
      walk.current = null
    }
  }, [recalled])

  const show = (entries: string[], index: number) => {
    walk.current = { entries, index }
    setInput(entries[index] ?? '')
  }

  /** Called before the send, so what fails is as recallable as what succeeds. */
  const record = (text: string) => {
    walk.current = null
    if (history && text && !history.skip?.(text)) {
      appendHistory(history.name, text)
    }
  }

  /** True when the key moved through the history. */
  const handleKey = (e: KeyboardEvent<HTMLTextAreaElement>): boolean => {
    const up = e.key === 'ArrowUp'
    if (
      !history ||
      (!up && e.key !== 'ArrowDown') ||
      e.shiftKey ||
      e.altKey ||
      e.metaKey ||
      e.ctrlKey ||
      e.nativeEvent.isComposing
    ) {
      return false
    }
    const { selectionStart, selectionEnd } = e.currentTarget
    if (
      recalled ? selectionStart !== input.length || selectionEnd !== input.length : input.trim()
    ) {
      return false
    }
    const current = recalled ? walk.current : null
    if (current) {
      const index = current.index + (up ? -1 : 1)
      if (index >= current.entries.length) {
        walk.current = null
        setInput('')
      } else if (index >= 0) {
        show(current.entries, index)
      }
      return true
    }
    const entries = up ? readHistory(history.name) : []
    if (entries.length === 0) {
      return false
    }
    show(entries, entries.length - 1)
    return true
  }

  return { recalled, record, handleKey }
}
