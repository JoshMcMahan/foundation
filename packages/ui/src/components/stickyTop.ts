import { type RefObject, useLayoutEffect } from 'react'

// `clip` and `visible` clip or show what overflows without making a box
// that scrolls, so a sticky element looks past them.
const scrolls = (style: CSSStyleDeclaration) =>
  /auto|scroll|hidden|overlay/.test(`${style.overflow} ${style.overflowX} ${style.overflowY}`)

/** The box a sticky element sticks to: its nearest ancestor that scrolls, or
 *  the document's when none does. */
function scrollContainer(el: Element): Element {
  const root = el.ownerDocument.documentElement
  for (let node = el.parentElement; node && node !== root; node = node.parentElement) {
    if (scrolls(getComputedStyle(node))) {
      return node
    }
  }
  return root
}

/** Elements laid out as children of `parent`'s box: its children, with those
 *  of a `display: contents` child (such as a tab row's root) in its place. */
function boxChildren(nodes: Iterable<Element>, into: Element[]) {
  for (const node of nodes) {
    into.push(node)
    if (getComputedStyle(node).display === 'contents') {
      boxChildren(node.children, into)
    }
  }
}

interface Above {
  /** Elements pinned to the scroller's top that stay pinned while `el` passes. */
  chrome: HTMLElement[]
  /** Where an element joining or leaving them would appear. */
  parents: Element[]
  /** Any of which a new class or style could pin. */
  siblings: Element[]
}

// A sticky element can't leave its parent's box, so only one whose parent
// also holds `el` stays pinned as `el` scrolls by: a sibling of `el` or of one
// of its ancestors, up to the scroller. One after `el` in the page only pins
// once `el` has scrolled past it. So the candidates are the earlier siblings
// along that path, a short list, without searching the page.
function chromeAbove(el: Element, scroller: Element): Above {
  const above: Above = { chrome: [], parents: [], siblings: [] }
  for (let node: Element = el; node !== scroller && node.parentElement; ) {
    const parent: Element = node.parentElement
    const earlier: Element[] = []
    for (let sib = node.previousElementSibling; sib; sib = sib.previousElementSibling) {
      earlier.push(sib)
    }
    const laidOut: Element[] = []
    boxChildren(earlier, laidOut)
    for (const sib of laidOut) {
      above.siblings.push(sib)
      const style = getComputedStyle(sib)
      if (style.display === 'contents') {
        above.parents.push(sib)
      }
      if (style.position === 'sticky' && style.top !== 'auto' && sib instanceof HTMLElement) {
        above.chrome.push(sib)
      }
    }
    above.parents.push(parent)
    node = parent
  }
  return above
}

/** Where `chrome`'s bottom edge sits, below the scroller's top, while it's pinned. */
function pinnedBottom(chrome: HTMLElement): number {
  const height = chrome.getBoundingClientRect().height
  return height > 0 ? (Number.parseFloat(getComputedStyle(chrome).top) || 0) + height : 0
}

/**
 * Pins a `sticky` element just below whatever its scroller already pins at
 * the top, such as a page header, a toolbar and a tab row, rather than at
 * `top: 0` behind them. It finds them in the page, so neither they nor the
 * host declare anything, and it follows them as they change height (a toolbar
 * wrapping on a narrow screen) or come and go, before the browser paints.
 * In a box that scrolls on its own, nothing sits above, so it pins at 0.
 */
export function useStickyTop(ref: RefObject<HTMLElement | null>, enabled: boolean) {
  useLayoutEffect(() => {
    const el = ref.current
    if (!enabled || !el) {
      return
    }
    let chrome: HTMLElement[] = []
    const place = () => {
      el.style.top = `${Math.max(0, ...chrome.map(pinnedBottom))}px`
    }
    // Observing a box reports its size once, so only a change to the page,
    // never a resize, gathers and observes the chrome afresh.
    const resizes = new ResizeObserver(place)
    const changes = new MutationObserver(gather)
    function gather() {
      if (!el) {
        return
      }
      const above = chromeAbove(el, scrollContainer(el))
      chrome = above.chrome
      resizes.disconnect()
      changes.disconnect()
      for (const node of chrome) {
        resizes.observe(node)
      }
      for (const parent of above.parents) {
        changes.observe(parent, { childList: true })
      }
      // A class or style turning a sibling sticky, or moving where it pins.
      for (const sib of above.siblings) {
        changes.observe(sib, { attributes: true, attributeFilter: ['class', 'style'] })
      }
      place()
    }
    gather()
    return () => {
      resizes.disconnect()
      changes.disconnect()
      el.style.top = ''
    }
  }, [ref, enabled])
}
