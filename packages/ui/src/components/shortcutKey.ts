import { useEffect, useRef } from 'react'
import { useCharacterKeyShortcuts } from './Provider'

// Where a letter is the reader's input, not a page shortcut: text fields and
// editors, dialogs over the page, and widgets whose typeahead moves to the item
// starting with that letter (a menu, a list, a tree, a select).
const KEYS_ARE_INPUT = [
  '.xterm',
  '.monaco-editor',
  '.cm-editor',
  'select',
  '[role="dialog"]',
  '[role="alertdialog"]',
  '[role="textbox"]',
  '[role="combobox"]',
  '[role="listbox"]',
  '[role="menu"]',
  '[role="menubar"]',
  '[role="tree"]',
  '[role="grid"]',
].join(', ')

/** Guards page shortcuts from firing inside text fields, editors, dialogs, and
 *  widgets with typeahead such as menus, lists and trees. */
export function isTextEntryContext(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  if (!el) {
    return false
  }
  if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable) {
    return true
  }
  return Boolean(el.closest?.(KEYS_ARE_INPUT))
}

/** Calls `onPress` on a single key, such as F to filter, unless the key goes to a text field or
 *  UIProvider's `characterKeyShortcuts` is off. */
export function useShortcutKey(key: string | undefined, onPress: () => void) {
  const press = useRef(onPress)
  press.current = onPress
  const on = useCharacterKeyShortcuts()
  useEffect(() => {
    if (!key || !on) {
      return
    }
    const onKey = (e: KeyboardEvent) => {
      // A key another handler already took, one held down, or one composing text
      // in an input method is not a press of the shortcut.
      if (e.defaultPrevented || e.repeat || e.isComposing) {
        return
      }
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
  }, [key, on])
}
