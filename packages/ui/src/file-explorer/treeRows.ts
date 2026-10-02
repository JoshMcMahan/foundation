import type { TreeNode } from './lib/types'
import { getNodeChildren } from './lib/utils'

/** 10,000 file rows render cheaply but stand 300,000px tall, burying the folder's
 *  next sibling. Directories are never held back. */
export const TREE_FILE_CAP = 50

/** One visible line in the sidebar tree. */
export interface TreeRow {
  kind: 'node' | 'skeleton' | 'more'
  /** Non-node rows suffix the parent path after a NUL, which object keys effectively
   *  never contain; nothing is derived from the key, so a collision only warns. */
  key: string
  node: TreeNode
  /** Roots are 0. Drives indent and aria-level (which is 1-based). */
  depth: number
  posInSet: number
  /** The true sibling count, which aria-setsize wants even when the cap shows fewer. */
  setSize: number
  isExpanded: boolean
  /** `more` rows only: files held back by the cap, 0 when only pages remain. */
  hiddenFiles?: number
}

interface FlattenTreeOptions {
  loadingPaths?: ReadonlySet<string>
  incompletePaths?: ReadonlySet<string>
  /** Absent means `TREE_FILE_CAP`. */
  fileLimits?: ReadonlyMap<string, number>
}

/** `stepRow` skips these, so neither kind is ever an arrow-key stop. */
function statusRow(
  kind: 'skeleton' | 'more',
  node: TreeNode,
  depth: number,
  hiddenFiles = 0,
): TreeRow {
  return {
    kind,
    key: `${node.path}\u0000${kind}`,
    node,
    depth,
    posInSet: 1,
    setSize: 1,
    isExpanded: false,
    hiddenFiles,
  }
}

function countFiles(children: readonly TreeNode[]): number {
  return children.reduce((total, child) => (child.type === 'directory' ? total : total + 1), 0)
}

/** Flattens the tree to exactly the rows that should be on screen, so the sidebar
 *  can be windowed and keyboard navigation can move by index instead of by DOM. */
export function flattenTreeRows(
  roots: TreeNode[],
  parentToChildrenMap: Record<string, TreeNode[]>,
  expandedPaths: ReadonlySet<string>,
  options?: FlattenTreeOptions,
): TreeRow[] {
  const rows: TreeRow[] = []

  const visit = (node: TreeNode, index: number, setSize: number, depth: number) => {
    const isDirectory = node.type === 'directory'
    const children = isDirectory ? getNodeChildren(parentToChildrenMap, node.path) : []
    const isExpanded = isDirectory && expandedPaths.has(node.path)

    rows.push({
      kind: 'node',
      key: node.path,
      node,
      depth,
      posInSet: index + 1,
      setSize,
      isExpanded,
    })

    if (!isExpanded) {
      return
    }
    // Page 1 has not landed, so there is nothing yet to say "more" about.
    if (options?.loadingPaths?.has(node.path) && children.length === 0) {
      rows.push(statusRow('skeleton', node, depth + 1))
      return
    }

    const limit = options?.fileLimits?.get(node.path) ?? TREE_FILE_CAP
    walkChildren(children, depth + 1, limit)

    const hiddenFiles = Math.max(0, countFiles(children) - limit)
    if (hiddenFiles > 0 || options?.incompletePaths?.has(node.path)) {
      rows.push(statusRow('more', node, depth + 1, hiddenFiles))
    }
  }

  // `index` and `setSize` come from the full sibling list, not the shown subset, so
  // the ARIA position keeps describing the real folder.
  const walkChildren = (children: readonly TreeNode[], depth: number, limit: number) => {
    let files = 0
    children.forEach((child, index) => {
      if (child.type !== 'directory') {
        files += 1
        if (files > limit) {
          return
        }
      }
      visit(child, index, children.length, depth)
    })
  }

  walkChildren(roots, 0, TREE_FILE_CAP)
  return rows
}

export function nextFileLimit(current: number | undefined): number {
  return (current ?? TREE_FILE_CAP) + TREE_FILE_CAP
}

/** Index of `path` among the visible rows, or -1. */
export function findRowIndex(rows: readonly TreeRow[], path: string): number {
  return rows.findIndex((row) => row.kind === 'node' && row.node.path === path)
}

/** The next selectable row in `direction`, skipping skeleton and more rows. */
export function stepRow(
  rows: readonly TreeRow[],
  from: number,
  direction: 1 | -1,
): TreeRow | undefined {
  for (let i = from + direction; i >= 0 && i < rows.length; i += direction) {
    const row = rows[i]
    if (row?.kind === 'node') {
      return row
    }
  }
  return undefined
}
