/** Guards list-page shortcuts from firing inside inputs, terminals, editors, and dialogs. */
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
