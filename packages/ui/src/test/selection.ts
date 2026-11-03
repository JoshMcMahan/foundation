/** Selects the text in `node`, as a press dragged over it leaves it before the click that
 *  follows. jsdom does no layout, so a test sets the selection rather than dragging. */
export function selectText(node: Node) {
  const range = document.createRange()
  range.selectNodeContents(node)
  const selection = window.getSelection()
  selection?.removeAllRanges()
  selection?.addRange(range)
}

export function clearSelection() {
  window.getSelection()?.removeAllRanges()
}
