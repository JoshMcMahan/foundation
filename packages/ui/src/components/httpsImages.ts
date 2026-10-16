// Unsets every image source that is not an absolute https: URL, so nothing loads from the host's
// origin or over http. Runs before harden, which shows a sourceless image as blocked.

interface HastElement {
  type: 'element'
  tagName: string
  properties?: Record<string, unknown>
  children: HastNode[]
}

type HastNode = HastElement | { type: string; children?: HastNode[] }

function isHttpsUrl(url: unknown): boolean {
  if (typeof url !== 'string') {
    return false
  }
  try {
    return new URL(url).protocol === 'https:'
  } catch {
    return false
  }
}

// A srcset is a comma-separated list of URLs, each with an optional width or density descriptor.
// A comma inside a URL splits it into pieces that fail the check, so such a srcset is dropped.
function isHttpsSrcSet(srcSet: unknown): boolean {
  const entries = Array.isArray(srcSet) ? srcSet : [srcSet]
  return entries.every(
    (entry) =>
      typeof entry === 'string' &&
      entry.split(',').every((candidate) => isHttpsUrl(candidate.trim().split(/\s+/)[0])),
  )
}

function walk(node: HastNode) {
  if (node.type === 'element') {
    const { tagName, properties } = node as HastElement
    if (properties && tagName === 'img' && !isHttpsUrl(properties['src'])) {
      delete properties['src']
    }
    if (
      properties &&
      (tagName === 'img' || tagName === 'source') &&
      !isHttpsSrcSet(properties['srcSet'])
    ) {
      delete properties['srcSet']
    }
  }
  for (const child of node.children ?? []) {
    walk(child)
  }
}

export function rehypeHttpsImagesOnly() {
  return (tree: HastNode) => {
    walk(tree)
  }
}
