/** Whether the element drawn at an element's center is that element or inside it, so nothing covers it. */
export function onTop(el: Element): boolean {
  const box = el.getBoundingClientRect()
  const drawn = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2)
  return drawn !== null && el.contains(drawn)
}
