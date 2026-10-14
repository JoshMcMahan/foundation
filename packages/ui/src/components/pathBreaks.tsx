import { Children, cloneElement, Fragment, isValidElement, type ReactNode } from 'react'

// A path or URL holds no place the browser will wrap but its hyphens: it won't
// break after a slash before a letter. Text that must wrap then splits mid-word,
// "/projects/simulatio|n-runs". A <wbr> after each separator gives it the places
// a reader expects, and adds nothing to the copied or read-out text.
// A run of them, the // of a URL, stays whole.
const SEPARATOR = /(?<=[/\\])(?![/\\])/

/** The pieces of `text` with a break allowed after each, split after each path
 *  separator; one piece when it holds none. */
export function pathPieces(text: string): string[] {
  return text.split(SEPARATOR).filter((piece) => piece !== '')
}

function breakText(text: string): ReactNode {
  const pieces = pathPieces(text)
  if (pieces.length < 2) {
    return text
  }
  return pieces.map((piece, i) => (
    // Pieces repeat ("a/a/"), so their place is their identity.
    // biome-ignore lint/suspicious/noArrayIndexKey: the pieces never reorder
    <Fragment key={i}>
      {piece}
      {i < pieces.length - 1 && <wbr />}
    </Fragment>
  ))
}

/** `node` with a place to wrap after each path separator in its text: a string,
 *  or an element, such as a link, whose child is one. Deeper content is left as
 *  it is. */
export function withPathBreaks(node: ReactNode): ReactNode {
  if (typeof node === 'string') {
    return breakText(node)
  }
  if (isValidElement<{ children?: ReactNode }>(node)) {
    const inner = node.props.children
    return typeof inner === 'string' ? cloneElement(node, undefined, breakText(inner)) : node
  }
  if (Array.isArray(node)) {
    return Children.map(node, (child) => (typeof child === 'string' ? breakText(child) : child))
  }
  return node
}
