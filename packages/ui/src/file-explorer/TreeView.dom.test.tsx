// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { fireEvent, render } from '@testing-library/react'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import type { TreeNode } from './lib/types'
import { TREE_ROW_HEIGHT, TreeView } from './TreeView'

const VIEWPORT = 300
const TOTAL = 100

beforeAll(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  )
  const isScroller = (el: HTMLElement) => el.classList?.contains('overflow-auto')
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
    configurable: true,
    get(this: HTMLElement) {
      return isScroller(this) ? VIEWPORT : 0
    },
  })
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
    configurable: true,
    get(this: HTMLElement) {
      return isScroller(this) ? VIEWPORT : 0
    },
  })
  Object.defineProperty(HTMLElement.prototype, 'scrollHeight', {
    configurable: true,
    get(this: HTMLElement) {
      return isScroller(this) ? TOTAL * TREE_ROW_HEIGHT : 0
    },
  })
  HTMLElement.prototype.scrollTo = vi.fn()
})

const rootNodes: TreeNode[] = Array.from({ length: TOTAL }, (_, i) => ({
  name: `d${i}`,
  path: `d${i}/`,
  type: 'directory',
  storageId: 's1',
})) as TreeNode[]

const parentToChildrenMap: Record<string, TreeNode[]> = { '': rootNodes }

function renderTree(selectedPath: string, onSelect: (path: string) => void) {
  const element = (path: string) => (
    <TreeView
      rootNodes={rootNodes}
      parentToChildrenMap={parentToChildrenMap}
      expandedPaths={new Set([''])}
      selectedPath={path}
      loadingPaths={new Set()}
      onToggleExpand={() => {}}
      onSelect={onSelect}
      onDropToFolder={() => {}}
      onContextMenu={() => {}}
      onPreviewFile={() => {}}
    />
  )
  const utils = render(element(selectedPath))
  // Stands in for the router committing a selection, which is asynchronous and
  // can land after later keypresses have already advanced the cursor.
  const commit = (path: string) => utils.rerender(element(path))
  const rowAt = (index: number) => {
    const row = utils.container.querySelector<HTMLElement>(
      `[data-index="${index}"] [role="treeitem"]`,
    )
    if (!row) {
      throw new Error(`row ${index} is not rendered`)
    }
    return row
  }
  return { ...utils, commit, rowAt }
}

describe('TreeView keyboard cursor', () => {
  it('advances one row per ArrowDown', () => {
    const selected: string[] = []
    const { rowAt, commit } = renderTree('d0/', (p) => selected.push(p))

    fireEvent.keyDown(rowAt(0), { key: 'ArrowDown' })
    expect(selected).toEqual(['d1/'])
    commit('d1/')

    fireEvent.keyDown(rowAt(1), { key: 'ArrowDown' })
    expect(selected).toEqual(['d1/', 'd2/'])
  })

  // The cursor runs ahead of the router during a held arrow key, so selections
  // commit out of date. Adopting one of those stale commits rewinds the cursor and
  // the next keypress re-selects the row the user is already on — a dropped press.
  it('does not rewind the cursor when an earlier selection commits late', () => {
    const selected: string[] = []
    const { rowAt, commit } = renderTree('d0/', (p) => selected.push(p))

    fireEvent.keyDown(rowAt(0), { key: 'ArrowDown' })
    fireEvent.keyDown(rowAt(0), { key: 'ArrowDown' })
    expect(selected).toEqual(['d1/', 'd2/'])

    // Both navigations now land, in order and both stale by the time they arrive.
    commit('d1/')
    commit('d2/')

    fireEvent.keyDown(rowAt(2), { key: 'ArrowDown' })
    expect(selected).toEqual(['d1/', 'd2/', 'd3/'])
  })

  // A selection this component did not drive — a click elsewhere, a breadcrumb, a
  // deep link — must still move the cursor, or arrows would resume from a row the
  // user has left.
  it('adopts a selection that came from outside the tree', () => {
    const selected: string[] = []
    const { rowAt, commit } = renderTree('d0/', (p) => selected.push(p))

    fireEvent.keyDown(rowAt(0), { key: 'ArrowDown' })
    commit('d1/')
    commit('d5/')

    fireEvent.keyDown(rowAt(5), { key: 'ArrowDown' })
    expect(selected).toEqual(['d1/', 'd6/'])
  })
})
