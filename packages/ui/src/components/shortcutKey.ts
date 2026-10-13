import { useEffect, useRef } from 'react'

/** Guards page shortcuts from firing inside inputs, terminals, editors, and dialogs. */
export function isTextEntryContext(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  if (!el) {
    return false
  }
  if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable) {
    return true
  }
  return Boolean(el.closest?.('.xterm, .monaco-editor, .cm-editor, [role="dialog"]'))
}

/** Calls `onPress` on a single key, such as F to filter, unless the key goes to a text field. */
export function useShortcutKey(key: string | undefined, onPress: () => void) {
  const press = useRef(onPress)
  press.current = onPress
  useEffect(() => {
    if (!key) {
      return
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.key.toLowerCase() !== key.toLowerCase()) {
        return
      }
      if (isTextEntryContext(e.target)) {
        return
      }
      e.preventDefault()
      press.current()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [key])
}
