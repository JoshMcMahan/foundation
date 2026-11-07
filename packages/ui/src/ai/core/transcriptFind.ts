// Find in a transcript: where the text is, and where the query appears in it.
// ChatMessageList marks the messages and the composer docked over their foot,
// so the search never depends on how the list happens to be nested.
const TRANSCRIPT = '[data-transcript]'
const COMPOSER_DOCK = '[data-composer-dock]'

export const MAX_MATCHES = 1000

const BLOCKS =
  'address,article,aside,blockquote,dd,details,div,dl,dt,figcaption,figure,footer,form,h1,h2,h3,h4,h5,h6,header,li,main,nav,ol,p,pre,section,summary,table,td,th,tr,ul'
// Text a reader can't see on screen: a form field's value isn't the DOM's
// text, and sr-only text is rendered but clipped away.
const SKIP = 'script,style,noscript,textarea,input,select,svg,.sr-only'

interface TextSegment {
  node: Text
  start: number
}

/** The query's words in order, across any run of whitespace, in any case. */
export function findPattern(query: string): RegExp | null {
  const words = query.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) {
    return null
  }
  return new RegExp(words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s+'), 'giu')
}

// One string of the visible text, with a line break between blocks so a word
// can't run from one paragraph into the next.
function collectText(scope: Element): { text: string; segments: TextSegment[] } {
  const shown = new Map<Element, boolean>()
  const isShown = (el: Element) => {
    let visible = shown.get(el)
    if (visible === undefined) {
      visible = !el.closest(SKIP) && (el.checkVisibility?.({ visibilityProperty: true }) ?? true)
      shown.set(el, visible)
    }
    return visible
  }
  const walker = scope.ownerDocument.createTreeWalker(scope, NodeFilter.SHOW_TEXT)
  const segments: TextSegment[] = []
  let text = ''
  let lastBlock: Element | null = null
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const textNode = node as Text
    const parent = textNode.parentElement
    if (!parent || !textNode.data || !isShown(parent)) {
      continue
    }
    const block = parent.closest(BLOCKS)
    if (segments.length > 0 && block !== lastBlock) {
      text += '\n'
    }
    lastBlock = block
    segments.push({ node: textNode, start: text.length })
    text += textNode.data
  }
  return { text, segments }
}

function locate(segments: TextSegment[], offset: number): TextSegment | undefined {
  let lo = 0
  let hi = segments.length - 1
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if ((segments[mid]?.start ?? 0) <= offset) {
      lo = mid
    } else {
      hi = mid - 1
    }
  }
  return segments[lo]
}

/** Each place the query appears in scope's visible text, in reading order,
 *  up to MAX_MATCHES. */
export function findRanges(scope: Element, query: string): Range[] {
  const pattern = findPattern(query)
  if (!pattern) {
    return []
  }
  const { text, segments } = collectText(scope)
  const ranges: Range[] = []
  for (const match of text.matchAll(pattern)) {
    if (ranges.length === MAX_MATCHES) {
      break
    }
    const start = match.index
    const end = start + match[0].length
    // A match starts and ends on a word, never on a line break between blocks.
    const first = locate(segments, start)
    const last = locate(segments, end - 1)
    if (!first || !last) {
      continue
    }
    const range = scope.ownerDocument.createRange()
    range.setStart(first.node, start - first.start)
    range.setEnd(last.node, end - last.start)
    ranges.push(range)
  }
  return ranges
}

/** The messages under root, without the composer that scrolls with them. */
export function transcriptOf(root: Element | null): Element | null {
  return root?.querySelector(TRANSCRIPT) ?? null
}

/** The first match from the top of what the reader is looking at, as a
 *  browser's find starts from where the page is scrolled to. */
export function firstInView(ranges: Range[], transcript: Element | null): number {
  const top = transcript?.closest('[role="log"]')?.getBoundingClientRect().top
  if (top === undefined) {
    return 0
  }
  const index = ranges.findIndex(
    (r) => typeof r.getBoundingClientRect !== 'function' || r.getBoundingClientRect().top >= top,
  )
  return index === -1 ? Math.max(ranges.length - 1, 0) : index
}

/** Brings a match into the part of the transcript the composer doesn't cover,
 *  a third of the way down, so the reader can read on from it. */
export function revealRange(range: Range): void {
  const element = range.startContainer.parentElement
  // Nearest first, for a match in a code block that scrolls sideways.
  element?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  const log = element?.closest('[role="log"]')
  if (!log || typeof range.getBoundingClientRect !== 'function') {
    return
  }
  const box = log.getBoundingClientRect()
  const dock = log.querySelector(COMPOSER_DOCK)
  const bottom = dock ? dock.getBoundingClientRect().top : box.bottom
  const rect = range.getBoundingClientRect()
  if (rect.top < box.top + 16 || rect.bottom > bottom - 16) {
    log.scrollTop += rect.top - box.top - (bottom - box.top) / 3
  }
}
