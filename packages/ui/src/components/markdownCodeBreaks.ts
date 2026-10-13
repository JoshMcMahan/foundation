// A rehype plugin that gives inline code a place to wrap: a <wbr> after each
// path separator, so `/api/storage/:type/:name` breaks between segments
// rather than forcing a table column as wide as itself or splitting mid-word.
// Fenced blocks are left alone, and <wbr> never reaches the clipboard.

interface HastText {
  type: 'text'
  value: string
}

interface HastElement {
  type: 'element'
  tagName: string
  properties?: Record<string, unknown>
  children: HastNode[]
}

type HastNode = HastText | HastElement | { type: string; children?: HastNode[] }

const BREAK_AFTER = /(?<=[/])/

function withBreaks(text: string): HastNode[] {
  const pieces = text.split(BREAK_AFTER)
  const out: HastNode[] = []
  pieces.forEach((piece, i) => {
    if (i > 0) {
      out.push({
        type: 'element',
        tagName: 'wbr',
        properties: {},
        children: [],
      })
    }
    if (piece !== '') {
      out.push({ type: 'text', value: piece })
    }
  })
  return out
}

function walk(node: HastNode, insidePre: boolean) {
  if (!('children' in node) || !node.children) {
    return
  }
  const el = node as HastElement
  const pre = insidePre || (node.type === 'element' && el.tagName === 'pre')
  if (node.type === 'element' && el.tagName === 'code' && !pre) {
    el.children = el.children.flatMap((child) =>
      child.type === 'text' ? withBreaks((child as HastText).value) : [child],
    )
    return
  }
  for (const child of node.children) {
    walk(child, pre)
  }
}

export function rehypeCodeBreaks() {
  return (tree: HastNode) => {
    walk(tree, false)
  }
}
