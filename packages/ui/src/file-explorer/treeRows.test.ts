import { describe, expect, it } from 'vitest'
import type { TreeNode } from './lib/types'
import { findRowIndex, flattenTreeRows, nextFileLimit, stepRow, TREE_FILE_CAP } from './treeRows'

const dir = (path: string): TreeNode => ({ name: path, path, type: 'directory' }) as TreeNode
const file = (path: string): TreeNode => ({ name: path, path, type: 'file' }) as TreeNode

// root/
//   a/        (dir, has b/ and f1)
//     b/      (dir, has f2)
//       f2
//     f1
//   f0
const roots = [dir('root/')]
const map: Record<string, TreeNode[]> = {
  'root/': [dir('root/a/'), file('root/f0')],
  'root/a/': [dir('root/a/b/'), file('root/a/f1')],
  'root/a/b/': [file('root/a/b/f2')],
}

const paths = (rows: { key: string }[]) => rows.map((r) => r.key)

describe('flattenTreeRows', () => {
  it('returns only the root when nothing is expanded', () => {
    const rows = flattenTreeRows(roots, map, new Set())
    expect(paths(rows)).toEqual(['root/'])
    expect(rows[0]?.depth).toBe(0)
    expect(rows[0]?.isExpanded).toBe(false)
  })

  it('includes children of expanded directories, in depth order', () => {
    const rows = flattenTreeRows(roots, map, new Set(['root/', 'root/a/']))
    expect(paths(rows)).toEqual(['root/', 'root/a/', 'root/a/b/', 'root/a/f1', 'root/f0'])
    expect(rows.map((r) => r.depth)).toEqual([0, 1, 2, 2, 1])
  })

  it('expands the full chain when every directory is open', () => {
    const rows = flattenTreeRows(roots, map, new Set(['root/', 'root/a/', 'root/a/b/']))
    expect(paths(rows)).toEqual([
      'root/',
      'root/a/',
      'root/a/b/',
      'root/a/b/f2',
      'root/a/f1',
      'root/f0',
    ])
    expect(rows.map((r) => r.depth)).toEqual([0, 1, 2, 3, 2, 1])
  })

  it('never expands a file, even if its path is in expandedPaths', () => {
    const rows = flattenTreeRows(roots, map, new Set(['root/', 'root/f0']))
    expect(paths(rows)).toEqual(['root/', 'root/a/', 'root/f0'])
    expect(rows.find((r) => r.key === 'root/f0')?.isExpanded).toBe(false)
  })

  it('numbers siblings for aria-posinset/setsize', () => {
    const rows = flattenTreeRows(roots, map, new Set(['root/']))
    const a = rows.find((r) => r.key === 'root/a/')
    const f0 = rows.find((r) => r.key === 'root/f0')
    expect([a?.posInSet, a?.setSize]).toEqual([1, 2])
    expect([f0?.posInSet, f0?.setSize]).toEqual([2, 2])
  })

  it('emits a skeleton row for an expanded directory that is still loading', () => {
    // 'root/c/' is expanded and has no children in the map yet.
    const withPending = {
      ...map,
      'root/': [...(map['root/'] ?? []), dir('root/c/')],
    }
    const rows = flattenTreeRows(roots, withPending, new Set(['root/', 'root/c/']), {
      loadingPaths: new Set(['root/c/']),
    })
    expect(paths(rows)).toEqual(['root/', 'root/a/', 'root/f0', 'root/c/', `root/c/\u0000skeleton`])
    const skeleton = rows[4]
    expect(skeleton?.kind).toBe('skeleton')
    expect(skeleton?.depth).toBe(2)
  })

  it('emits no skeleton for an expanded empty directory that is not loading', () => {
    const withEmpty = { ...map, 'root/': [dir('root/empty/')] }
    const rows = flattenTreeRows(roots, withEmpty, new Set(['root/', 'root/empty/']), {
      loadingPaths: new Set(),
    })
    expect(paths(rows)).toEqual(['root/', 'root/empty/'])
  })

  it('emits a more row after the children of an incomplete directory', () => {
    const rows = flattenTreeRows(roots, map, new Set(['root/', 'root/a/']), {
      loadingPaths: new Set(),
      incompletePaths: new Set(['root/a/']),
    })

    expect(paths(rows)).toEqual([
      'root/',
      'root/a/',
      'root/a/b/',
      'root/a/f1',
      `root/a/\u0000more`,
      'root/f0',
    ])
    expect(rows[4]?.kind).toBe('more')
    expect(rows[4]?.depth).toBe(2)
  })

  it('emits no more row for a directory that is collapsed', () => {
    const rows = flattenTreeRows(roots, map, new Set(['root/']), {
      loadingPaths: new Set(),
      incompletePaths: new Set(['root/a/']),
    })

    expect(paths(rows)).toEqual(['root/', 'root/a/', 'root/f0'])
  })

  it('emits no more row for a directory that is fully listed', () => {
    const rows = flattenTreeRows(roots, map, new Set(['root/', 'root/a/']), {
      loadingPaths: new Set(),
      incompletePaths: new Set(),
    })

    expect(paths(rows).filter((key) => key.includes('more'))).toEqual([])
  })

  // Page 1 has not landed, so there is nothing yet to say "more" about.
  it('prefers the skeleton over a more row while the first page is in flight', () => {
    const withPending = { ...map, 'root/': [dir('root/c/')] }
    const rows = flattenTreeRows(roots, withPending, new Set(['root/', 'root/c/']), {
      loadingPaths: new Set(['root/c/']),
      incompletePaths: new Set(['root/c/']),
    })

    expect(paths(rows)).toEqual(['root/', 'root/c/', `root/c/\u0000skeleton`])
  })

  it('keeps the children of a directory while it is being re-listed', () => {
    const rows = flattenTreeRows(roots, map, new Set(['root/', 'root/a/']), {
      loadingPaths: new Set(['root/a/']),
    })

    expect(paths(rows)).toEqual(['root/', 'root/a/', 'root/a/b/', 'root/a/f1', 'root/f0'])
  })

  // A first page can come back empty under a delimiter and still have more behind
  // it, which is the one case where a more row stands alone.
  it('emits a more row for an incomplete directory whose first page was empty', () => {
    const withEmpty = { ...map, 'root/': [dir('root/empty/')] }
    const rows = flattenTreeRows(roots, withEmpty, new Set(['root/', 'root/empty/']), {
      loadingPaths: new Set(),
      incompletePaths: new Set(['root/empty/']),
    })

    expect(paths(rows)).toEqual(['root/', 'root/empty/', `root/empty/\u0000more`])
  })
})

describe('flattenTreeRows file cap', () => {
  // 3 directories then 200 files, the order createTreeBuilder always produces.
  const many = {
    'root/': [
      ...Array.from({ length: 3 }, (_, i) => dir(`root/d${i}/`)),
      ...Array.from({ length: 200 }, (_, i) => file(`root/f${i}`)),
    ],
  }
  const expanded = new Set(['root/'])
  const kinds = (rows: { kind: string }[]) => rows.map((r) => r.kind)

  it('shows only the first 50 files of a folder', () => {
    const rows = flattenTreeRows(roots, many, expanded)
    const files = rows.filter((r) => r.kind === 'node' && r.node.type === 'file')

    expect(files).toHaveLength(TREE_FILE_CAP)
    expect(files.at(-1)?.node.path).toBe(`root/f${TREE_FILE_CAP - 1}`)
  })

  it('never holds a directory back', () => {
    const rows = flattenTreeRows(roots, many, expanded)
    const dirs = rows.filter((r) => r.kind === 'node' && r.node.type === 'directory')

    // The root plus all three subdirectories.
    expect(dirs).toHaveLength(4)
  })

  it('closes the folder with a more row counting what is held back', () => {
    const rows = flattenTreeRows(roots, many, expanded)

    expect(kinds(rows).at(-1)).toBe('more')
    expect(rows.at(-1)?.hiddenFiles).toBe(200 - TREE_FILE_CAP)
  })

  it('leaves a folder inside the cap untouched', () => {
    const rows = flattenTreeRows(roots, map, new Set(['root/']))

    expect(kinds(rows)).not.toContain('more')
  })

  // The cap must not distort the ARIA numbering: it still describes the real folder.
  it('numbers shown files by their real position and sibling count', () => {
    const rows = flattenTreeRows(roots, many, expanded)
    const firstFile = rows.find((r) => r.kind === 'node' && r.node.type === 'file')

    // Three directories come first, so the first file is the fourth of 203.
    expect(firstFile?.posInSet).toBe(4)
    expect(firstFile?.setSize).toBe(203)
  })

  it('reveals the next chunk when the folder is given a larger allowance', () => {
    const rows = flattenTreeRows(roots, many, expanded, {
      fileLimits: new Map([['root/', nextFileLimit(undefined)]]),
    })
    const files = rows.filter((r) => r.kind === 'node' && r.node.type === 'file')

    expect(files).toHaveLength(TREE_FILE_CAP * 2)
    expect(rows.at(-1)?.hiddenFiles).toBe(200 - TREE_FILE_CAP * 2)
  })

  it('drops the more row once the allowance covers every file', () => {
    const rows = flattenTreeRows(roots, many, expanded, {
      fileLimits: new Map([['root/', 200]]),
    })

    expect(kinds(rows)).not.toContain('more')
  })

  // The count is a floor while pages are missing, and the row has to stay so the
  // remaining pages are still reachable.
  it('keeps the more row for an incomplete folder whose files all fit', () => {
    const rows = flattenTreeRows(roots, many, expanded, {
      fileLimits: new Map([['root/', 200]]),
      incompletePaths: new Set(['root/']),
    })

    expect(kinds(rows).at(-1)).toBe('more')
    expect(rows.at(-1)?.hiddenFiles).toBe(0)
  })

  it('caps each folder independently', () => {
    const nested = {
      'root/': [dir('root/a/')],
      'root/a/': Array.from({ length: 120 }, (_, i) => file(`root/a/f${i}`)),
    }
    const rows = flattenTreeRows(roots, nested, new Set(['root/', 'root/a/']))

    expect(rows.filter((r) => r.kind === 'node' && r.node.type === 'file')).toHaveLength(
      TREE_FILE_CAP,
    )
    expect(rows.at(-1)?.hiddenFiles).toBe(120 - TREE_FILE_CAP)
  })
})

describe('nextFileLimit', () => {
  it('starts from the cap and grows by it', () => {
    expect(nextFileLimit(undefined)).toBe(TREE_FILE_CAP * 2)
    expect(nextFileLimit(TREE_FILE_CAP * 2)).toBe(TREE_FILE_CAP * 3)
  })
})

describe('findRowIndex / stepRow', () => {
  const rows = flattenTreeRows(roots, map, new Set(['root/', 'root/a/', 'root/a/b/']))

  it('finds a node row by path', () => {
    expect(findRowIndex(rows, 'root/a/b/')).toBe(2)
    expect(findRowIndex(rows, 'nope/')).toBe(-1)
  })

  it('steps forward and back through visible rows', () => {
    const i = findRowIndex(rows, 'root/a/')
    expect(stepRow(rows, i, 1)?.key).toBe('root/a/b/')
    expect(stepRow(rows, i, -1)?.key).toBe('root/')
  })

  it('returns undefined at the ends instead of wrapping', () => {
    expect(stepRow(rows, 0, -1)).toBeUndefined()
    expect(stepRow(rows, rows.length - 1, 1)).toBeUndefined()
  })

  it('skips skeleton rows so arrow keys never land on one', () => {
    const withPending = { ...map, 'root/': [dir('root/c/'), file('root/f0')] }
    const pending = flattenTreeRows(roots, withPending, new Set(['root/', 'root/c/']), {
      loadingPaths: new Set(['root/c/']),
    })
    // root/, root/c/, skeleton, root/f0
    const i = findRowIndex(pending, 'root/c/')
    expect(pending[i + 1]?.kind).toBe('skeleton')
    expect(stepRow(pending, i, 1)?.key).toBe('root/f0')
  })

  // Arrow keys must keep moving between real nodes across a more row.
  it('skips more rows so arrow keys never land on one', () => {
    const incomplete = flattenTreeRows(roots, map, new Set(['root/', 'root/a/']), {
      loadingPaths: new Set(),
      incompletePaths: new Set(['root/a/']),
    })
    const i = findRowIndex(incomplete, 'root/a/f1')

    expect(incomplete[i + 1]?.kind).toBe('more')
    expect(stepRow(incomplete, i, 1)?.key).toBe('root/f0')
    expect(findRowIndex(incomplete, 'root/f0')).toBe(i + 2)
  })
})
