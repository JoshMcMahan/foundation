// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { UIProvider } from '../components/Provider'
import { CorsError } from './lib/errors'
import type { TListPageRequest } from './lib/paging'
import type { TreeNode, TStorage, TStorageObject } from './lib/types'

vi.mock('./FilePreview', () => ({ FilePreview: () => null }))
vi.mock('./FilePreview/Inline', () => ({ FilePreviewInline: () => null }))

import FileExplorer from './FileExplorer'
import { FileExplorerProvider } from './FileExplorerContext'

const VIEWPORT = 600

beforeAll(() => {
  // react-virtual measures with offsetHeight and watches with a ResizeObserver;
  // jsdom does no layout and provides neither.
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  )
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  )
  const isScroller = (el: HTMLElement) =>
    el.classList?.contains('overflow-auto') &&
    (el.classList?.contains('h-full') || el.getAttribute('role') === 'tree')
  for (const property of ['clientHeight', 'offsetHeight']) {
    Object.defineProperty(HTMLElement.prototype, property, {
      configurable: true,
      get(this: HTMLElement) {
        return isScroller(this) ? VIEWPORT : 0
      },
    })
  }
  HTMLElement.prototype.scrollTo = vi.fn()
})

type ListCall = { dir: string; cursor: string | undefined }

const file = (path: string, size = 1): TStorageObject => ({
  path,
  type: 'file',
  size,
})
const dir = (path: string): TStorageObject => ({ path, type: 'directory' })

const PAGES: Record<string, TStorageObject[][]> = {
  '': [[dir('a/'), dir('b/')]],
  'a/': [[file('a/one.txt'), file('a/two.txt', 2), dir('a/sub/')]],
  'a/sub/': [[file('a/sub/deep.txt', 3)]],
  'b/': [[file('b/three.txt', 3)]],
}

/** Serves each directory from scripted pages, keyed by the object-key prefix the
 *  explorer asks for, and records every listing request. */
function scriptedStorage(pages: Record<string, TStorageObject[][]> = PAGES) {
  const fixture = new Map(Object.entries(pages))
  const calls: ListCall[] = []
  const failures = new Map<string, Error>()
  type Response = TStorageObject[] | Error | undefined
  type Gate = { opened: Promise<Response>; open: (response?: Response) => void }
  const pending = new Map<string, Gate[]>()
  const parked = new Map<string, Gate[]>()
  const gateKey = (dir: string, cursor?: string) => `${dir}@${cursor ?? ''}`

  const client = {
    getStorageName: () => 'bucket',
    getExpiresAt: () => new Date(Date.now() + 3_600_000),
    async listDirectory(input: unknown) {
      const { dir, cursor } = input as ListCall
      calls.push({ dir, cursor })
      const key = gateKey(dir, cursor)
      const gate = pending.get(key)?.shift()
      let response: Response
      if (gate) {
        parked.set(key, [...(parked.get(key) ?? []), gate])
        response = await gate.opened
      }
      if (response instanceof Error) {
        throw response
      }
      const failure = failures.get(dir)
      if (failure) {
        throw failure
      }
      if (response) {
        return { objects: response, next: undefined }
      }
      const dirPages = fixture.get(dir) ?? [[]]
      const index = cursor ? Number(cursor) : 0
      return {
        objects: dirPages[index] ?? [],
        next: index + 1 < dirPages.length ? String(index + 1) : undefined,
      }
    },
    getFile: async () => [null, null] as [string | null, Error | null],
    async deleteFiles(input: unknown) {
      const { keys } = input as { keys: string[] }
      for (const [path, dirPages] of fixture) {
        fixture.set(
          path,
          dirPages.map((page) => page.filter((o) => !keys.includes(o.path))),
        )
      }
      return {}
    },
    uploadFile: async () => ({}),
  }
  const provider = {
    createClient: null,
    listDirectoryInput: (_storage: TStorage, dirPath = '', page: TListPageRequest = {}) => ({
      dir: dirPath,
      cursor: page.cursor,
    }),
    convertDataToStorageObjects: (data: unknown) => (data as { objects: TStorageObject[] }).objects,
    nextPageCursor: (data: unknown) => (data as { next?: string }).next,
    deleteFilesInput: (_name: string, nodes: TreeNode[]) => ({
      keys: nodes.map((n) => n.relativePath ?? n.path),
    }),
  }

  return {
    calls,
    callsFor: (path: string) => calls.filter((c) => c.dir === path),
    fixture,
    failWith: (path: string, error: Error) => failures.set(path, error),
    recover: (path: string) => failures.delete(path),
    /** Parks the next request for this directory and cursor until `release`;
     *  each call parks one more request. */
    hold(path: string, cursor?: string) {
      let open: Gate['open'] = () => {}
      const opened = new Promise<Response>((resolve) => {
        open = resolve
      })
      const key = gateKey(path, cursor)
      pending.set(key, [...(pending.get(key) ?? []), { opened, open }])
    },
    /** Lets the oldest parked request through, answering with `response` in
     *  place of the fixture when given. */
    async release(path: string, cursor?: string, response?: Response) {
      const key = gateKey(path, cursor)
      const gate = parked.get(key)?.shift() ?? pending.get(key)?.shift()
      gate?.open(response)
      await act(async () => {})
    },
    getProviderAndClient: async () => ({ provider, client }),
  }
}

type Script = ReturnType<typeof scriptedStorage>

const storage: TStorage = {
  id: 'storage-1',
  name: 'bucket',
  user: 'user',
  displayName: 'bucket',
  csp: 'aws',
  type: 'bucket',
  canWrite: true,
}

// Tree paths are keyed on the owning user, and the router strips the trailing
// slash off a directory, which is the shape the explorer receives for a folder.
const ROOT = `${storage.user}/${storage.name}`
const FOLDER_A = `${ROOT}/a`
const FOLDER_B = `${ROOT}/b`

const explorer = (selectedPath: string, script: Script, storages: TStorage[] = [storage]) => (
  <FileExplorerProvider>
    <FileExplorer
      getProviderAndClient={script.getProviderAndClient}
      storages={storages}
      selectedPath={selectedPath}
      onPathChange={() => {}}
    />
  </FileExplorerProvider>
)

async function renderExplorer(selectedPath: string, script: Script = scriptedStorage()) {
  const utils = render(explorer(selectedPath, script))
  await act(async () => {})
  return {
    ...utils,
    script,
    /** Re-renders with a new prop value, the way the router does on back/forward. */
    async navigate(path: string, storages?: TStorage[]) {
      utils.rerender(explorer(path, script, storages))
      await act(async () => {})
    },
  }
}

const deleteButton = () => screen.getByLabelText('Delete')
const refreshButton = () => screen.getByLabelText('Refresh')
const check = (name: string) => fireEvent.click(screen.getByLabelText(`Select ${name}`))
const rowNames = () =>
  screen
    .getAllByLabelText(/^Select /)
    .map((el) => el.getAttribute('aria-label')?.replace('Select ', ''))
    .filter((name) => name !== 'all')
const treeItem = (name: string) =>
  screen.getAllByRole('treeitem').find((el) => el.textContent === name)
const findTreeItem = (name: string) =>
  waitFor(() => {
    const item = treeItem(name)
    expect(item).toBeDefined()
    return item as HTMLElement
  })
const grid = () => screen.getByRole('grid')
const loadMoreButton = () => within(grid()).queryByRole('button', { name: 'Load more' })
const listCall = (path: string, cursor?: string): ListCall => ({
  dir: path,
  cursor,
})

describe('FileExplorer listing on demand', () => {
  it('lists the root and then the deep-linked folder once each, with a skeleton in between', async () => {
    const script = scriptedStorage()
    script.hold('a/')
    await renderExplorer(FOLDER_A, script)

    await waitFor(() => expect(script.callsFor('a/')).toHaveLength(1))
    expect(screen.getByRole('status', { name: 'Loading…' })).toBeInTheDocument()
    expect(screen.queryByText('This folder is empty')).not.toBeInTheDocument()

    await script.release('a/')

    expect(await screen.findByLabelText('Select one.txt')).toBeInTheDocument()
    expect(script.calls).toEqual([listCall(''), listCall('a/')])
  })

  it('lists a folder expanded with ArrowRight once, and not again when re-expanded', async () => {
    const { script } = await renderExplorer(ROOT)
    await screen.findByLabelText('Select a')
    expect(script.callsFor('a/')).toHaveLength(0)

    fireEvent.keyDown(treeItem('a') as HTMLElement, { key: 'ArrowRight' })

    expect(await findTreeItem('one.txt')).toBeInTheDocument()
    expect(script.callsFor('a/')).toEqual([listCall('a/')])

    fireEvent.keyDown(treeItem('a') as HTMLElement, { key: 'ArrowLeft' })
    await act(async () => {})
    expect(treeItem('one.txt')).toBeUndefined()
    fireEvent.keyDown(treeItem('a') as HTMLElement, { key: 'ArrowRight' })
    await act(async () => {})

    expect(treeItem('one.txt')).toBeDefined()
    expect(script.callsFor('a/')).toHaveLength(1)
  })

  it('re-lists an expanded subfolder after its parent is refreshed', async () => {
    const { script, navigate } = await renderExplorer(`${FOLDER_A}/sub`)
    await screen.findByLabelText('Select deep.txt')
    await navigate(FOLDER_A)
    await screen.findByLabelText('Select one.txt')

    fireEvent.click(refreshButton())

    await waitFor(() => expect(script.callsFor('a/sub/')).toHaveLength(2))
    expect(script.callsFor('a/').at(-1)).toEqual(listCall('a/'))
    expect(await findTreeItem('deep.txt')).toBeInTheDocument()

    await navigate(`${FOLDER_A}/sub`)

    expect(await screen.findByLabelText('Select deep.txt')).toBeInTheDocument()
    expect(script.callsFor('a/sub/')).toHaveLength(2)
  })

  it('drops a row the refreshed listing no longer returns, and leaves collapsed folders alone', async () => {
    const { script } = await renderExplorer(FOLDER_A)
    await screen.findByLabelText('Select two.txt')
    script.fixture.set('a/', [[file('a/one.txt'), dir('a/sub/')]])

    fireEvent.click(refreshButton())

    await waitFor(() => expect(screen.queryByLabelText('Select two.txt')).not.toBeInTheDocument())
    expect(screen.getByLabelText('Select one.txt')).toBeInTheDocument()
    expect(script.callsFor('a/')).toHaveLength(2)
    expect(script.callsFor('')).toHaveLength(2)
    expect(script.callsFor('a/sub/')).toHaveLength(0)
    expect(script.callsFor('b/')).toHaveLength(0)
  })

  it('keeps the tree and the folder actions in place while a refresh is in flight', async () => {
    const { script } = await renderExplorer(FOLDER_A)
    await screen.findByLabelText('Select one.txt')
    script.hold('a/')

    fireEvent.click(refreshButton())
    await waitFor(() => expect(script.callsFor('a/')).toHaveLength(2))

    expect(treeItem('one.txt')).toBeDefined()
    expect(screen.getByRole('status', { name: 'Loading…' })).toBeInTheDocument()
    expect(deleteButton()).toBeInTheDocument()

    await script.release('a/')

    expect(await screen.findByLabelText('Select two.txt')).toBeInTheDocument()
  })

  // A refresh bypasses the in-flight guard, so the first page it superseded can
  // still land or fail afterwards. Neither may undo the refresh.
  it('keeps the refreshed rows when the first page it superseded lands afterwards', async () => {
    const script = scriptedStorage()
    script.hold('a/')
    script.hold('a/')
    await renderExplorer(FOLDER_A, script)
    await waitFor(() => expect(script.callsFor('a/')).toHaveLength(1))

    fireEvent.click(refreshButton())
    await waitFor(() => expect(script.callsFor('a/')).toHaveLength(2))
    await script.release('a/', undefined, [file('a/stale.txt')])
    await script.release('a/')

    expect(await screen.findByLabelText('Select one.txt')).toBeInTheDocument()
    expect(rowNames()).not.toContain('stale.txt')
    expect(script.callsFor('a/')).toHaveLength(2)
  })

  it('keeps the refreshed rows when the first page it superseded fails afterwards', async () => {
    const script = scriptedStorage()
    script.hold('a/')
    script.hold('a/')
    await renderExplorer(FOLDER_A, script)
    await waitFor(() => expect(script.callsFor('a/')).toHaveLength(1))

    fireEvent.click(refreshButton())
    await waitFor(() => expect(script.callsFor('a/')).toHaveLength(2))
    await script.release('a/', undefined, new Error('boom'))
    await script.release('a/')

    expect(await screen.findByLabelText('Select one.txt')).toBeInTheDocument()
    expect(screen.queryByText('Connection issue')).toBeNull()
    expect(screen.queryByText(/boom/)).toBeNull()
  })
})

describe('FileExplorer paging', () => {
  const PAGED = {
    ...PAGES,
    'a/': [[file('a/zeta.txt'), file('a/alpha.txt')], [file('a/mid.txt')]],
  }

  it('appends the next page behind the sentinel and sorts once the folder is complete', async () => {
    const script = scriptedStorage(PAGED)
    await renderExplorer(FOLDER_A, script)
    await screen.findByLabelText('Select alpha.txt')
    expect(rowNames()).toEqual(['zeta.txt', 'alpha.txt'])

    script.hold('a/', '1')
    fireEvent.click(loadMoreButton()!)
    await waitFor(() => expect(script.callsFor('a/')).toHaveLength(2))
    expect(within(grid()).getByText('Loading more items…')).toBeInTheDocument()
    await script.release('a/', '1')

    await screen.findByLabelText('Select mid.txt')
    expect(rowNames()).toEqual(['alpha.txt', 'mid.txt', 'zeta.txt'])
    expect(loadMoreButton()).toBeNull()
    expect(script.callsFor('a/')).toEqual([listCall('a/'), listCall('a/', '1')])
  })

  it('drops a page that lands after the folder was refreshed', async () => {
    const script = scriptedStorage(PAGED)
    await renderExplorer(FOLDER_A, script)
    await screen.findByLabelText('Select alpha.txt')

    script.hold('a/', '1')
    fireEvent.click(loadMoreButton()!)
    await waitFor(() => expect(script.callsFor('a/')).toHaveLength(2))
    script.hold('a/')
    fireEvent.click(refreshButton())
    await waitFor(() => expect(script.callsFor('a/')).toHaveLength(3))

    // The stale page may not show up anywhere, not even in the tree while the
    // table is still a skeleton.
    await script.release('a/', '1')
    expect(treeItem('mid.txt')).toBeUndefined()
    await script.release('a/')

    await screen.findByLabelText('Select alpha.txt')
    expect(rowNames()).toEqual(['zeta.txt', 'alpha.txt'])
    expect(loadMoreButton()).toBeInTheDocument()
    expect(script.callsFor('a/')).toHaveLength(3)
  })

  it('keeps the refreshed folder when the page it superseded fails', async () => {
    const script = scriptedStorage(PAGED)
    await renderExplorer(FOLDER_A, script)
    await screen.findByLabelText('Select alpha.txt')

    script.hold('a/', '1')
    fireEvent.click(loadMoreButton()!)
    await waitFor(() => expect(script.callsFor('a/')).toHaveLength(2))
    fireEvent.click(refreshButton())
    await waitFor(() => expect(rowNames()).toEqual(['zeta.txt', 'alpha.txt']))

    script.failWith('a/', new Error('boom'))
    await script.release('a/', '1')

    expect(rowNames()).toEqual(['zeta.txt', 'alpha.txt'])
    expect(screen.queryByText(/boom/)).toBeNull()
    expect(loadMoreButton()).toBeInTheDocument()
  })
})

describe('FileExplorer listing failures', () => {
  it('reports a failed folder once and re-lists it on Try again', async () => {
    const script = scriptedStorage()
    script.failWith('a/', new Error('boom'))
    await renderExplorer(FOLDER_A, script)

    expect(await screen.findByText('Connection issue')).toBeInTheDocument()
    expect(screen.getByText('Failed to load contents for a: boom')).toBeInTheDocument()
    await act(async () => {})
    expect(script.callsFor('a/')).toHaveLength(1)

    script.recover('a/')
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))

    expect(await screen.findByLabelText('Select one.txt')).toBeInTheDocument()
    expect(script.callsFor('a/')).toHaveLength(2)
  })

  it('re-lists the deepest folder it has on Try again, then walks down to the target', async () => {
    const { script } = await renderExplorer(`${ROOT}/nope`)
    await screen.findByText("Couldn't find nope")
    script.fixture.set('', [[dir('a/'), dir('b/'), dir('nope/')]])
    script.fixture.set('nope/', [[file('nope/found.txt')]])

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))

    expect(await screen.findByLabelText('Select found.txt')).toBeInTheDocument()
    expect(script.calls).toEqual([listCall(''), listCall(''), listCall('nope/')])
  })

  // Restarting the walk would re-list page 1 and hit the same page bound again, so a
  // target sitting past 20 pages could never be reached by retrying.
  it('resumes paging on Try again instead of re-listing the folder from page 1', async () => {
    const script = scriptedStorage({
      '': [[dir('a/')], [dir('deep/')]],
      'deep/': [[file('deep/found.txt')]],
    })
    script.hold('', '1')
    await renderExplorer(`${ROOT}/deep`, script)
    await waitFor(() => expect(script.callsFor('')).toHaveLength(2))
    script.failWith('', new Error('boom'))
    await script.release('', '1')
    await screen.findByText("Couldn't find deep")
    script.recover('')

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))

    expect(await screen.findByLabelText('Select found.txt')).toBeInTheDocument()
    expect(script.calls).toEqual([
      listCall(''),
      listCall('', '1'),
      listCall('', '1'),
      listCall('deep/'),
    ])
  })

  it('lists the folder once a silent probe gets through after CORS rules are added', async () => {
    const script = scriptedStorage()
    script.failWith('', new CorsError('blocked'))
    const provision = vi.fn(async () => ({}))
    render(
      <UIProvider data={{ provisionCorsRules: provision }}>{explorer(ROOT, script)}</UIProvider>,
    )
    const addRules = await screen.findByRole('button', {
      name: 'Add CORS Rules',
    })

    script.recover('')
    vi.useFakeTimers()
    try {
      fireEvent.click(addRules)
      await act(async () => {
        await vi.advanceTimersByTimeAsync(3_000)
      })
    } finally {
      vi.useRealTimers()
    }

    expect(provision).toHaveBeenCalledTimes(1)
    expect(await screen.findByLabelText('Select a')).toBeInTheDocument()
    expect(rowNames()).toEqual(['a', 'b'])
  })
})

describe('FileExplorer mutations', () => {
  it('re-lists the parent after a delete so the row is gone, and leaves an expanded subfolder alone', async () => {
    const { script, navigate } = await renderExplorer(`${FOLDER_A}/sub`)
    await screen.findByLabelText('Select deep.txt')
    await navigate(FOLDER_A)
    await screen.findByLabelText('Select one.txt')
    check('one.txt')
    fireEvent.click(deleteButton())
    await screen.findByText('Confirm Delete')
    fireEvent.click(screen.getAllByRole('button', { name: 'Delete' }).at(-1)!)

    await waitFor(() => expect(screen.queryByLabelText('Select one.txt')).not.toBeInTheDocument())
    expect(screen.getByLabelText('Select two.txt')).toBeInTheDocument()
    expect(script.callsFor('a/')).toHaveLength(2)
    expect(treeItem('deep.txt')).toBeDefined()
    expect(script.callsFor('a/sub/')).toHaveLength(1)
  })
})

describe('FileExplorer storages prop', () => {
  it('shows a storage added after mount without a remount', async () => {
    const { navigate } = await renderExplorer(FOLDER_A)
    await screen.findByLabelText('Select one.txt')
    const other: TStorage = {
      ...storage,
      id: 'storage-2',
      name: 'other',
      displayName: 'other',
    }

    await navigate(FOLDER_A, [storage, other])

    expect(await findTreeItem('other')).toBeInTheDocument()
    expect(screen.getByLabelText('Select one.txt')).toBeInTheDocument()
  })
})

describe('FileExplorer selection across navigation', () => {
  // Back/forward changes the path prop with none of the component's own handlers
  // running, so a checked set held over aimed delete at the folder just left.
  it('drops the previous folder from the delete target when the path prop changes', async () => {
    const { navigate } = await renderExplorer(FOLDER_A)
    await screen.findByLabelText('Select one.txt')
    check('one.txt')

    await navigate(FOLDER_B)
    await screen.findByLabelText('Select three.txt')
    expect(deleteButton()).toBeDisabled()
    check('three.txt')
    fireEvent.click(deleteButton())

    const confirm = await screen.findByText(/Confirm Delete/)
    expect(confirm).toBeInTheDocument()
    expect(screen.getByText(`${FOLDER_B}/three.txt`)).toBeInTheDocument()
    expect(screen.queryByText(`${FOLDER_A}/one.txt`)).not.toBeInTheDocument()
  })

  // The normalized path is derived from the tree as well as the prop, so it
  // recomputes whenever storages arrive. That must not wipe a live selection.
  it('keeps the checked set when the tree data changes but the folder does not', async () => {
    const { navigate } = await renderExplorer(FOLDER_A)
    await screen.findByLabelText('Select one.txt')
    check('one.txt')

    await navigate(FOLDER_A, [{ ...storage }])

    expect(screen.getByLabelText('Select one.txt')).toBeChecked()
    expect(deleteButton()).toBeEnabled()
  })
})
