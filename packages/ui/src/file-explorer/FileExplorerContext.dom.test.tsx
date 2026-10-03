// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { UIProvider } from '../components/Provider'
import { FileExplorerProvider, useFileExplorer } from './FileExplorerContext'
import type { IFileExplorerClient, IFileExplorerProvider } from './lib/fileExplorer'
import type { TreeNode, UploadNode } from './lib/types'

const target: TreeNode = { name: 'docs', path: 'docs/', type: 'directory' }
const node = (name: string): UploadNode => ({
  name,
  file: new Blob(['x']),
  relativePath: `/${name}`,
})

function setup() {
  const update = vi.fn()
  const { result } = renderHook(() => useFileExplorer(), {
    wrapper: ({ children }) => (
      <UIProvider notify={{ update, loading: vi.fn(), error: vi.fn() }}>
        <FileExplorerProvider>{children}</FileExplorerProvider>
      </UIProvider>
    ),
  })
  // The summary is the last update a session's toast receives.
  const summaryFor = (sessionId: string) =>
    update.mock.calls.filter(([id]) => id === sessionId).at(-1)?.[1]
  return { explorer: result, summaryFor }
}

const client = (uploadFile: IFileExplorerClient['uploadFile']) =>
  ({ uploadFile }) as unknown as IFileExplorerClient
const provider = { uploadFileInput: () => ({}) } as unknown as IFileExplorerProvider
const refresh = async () => {}

describe('upload summary', () => {
  it('reports a file cancelled before its upload starts as cancelled', async () => {
    const { explorer, summaryFor } = setup()
    let finishFirst = () => {}
    const blocked = new Promise<void>((resolve) => {
      finishFirst = resolve
    })
    const uploadFile = vi.fn(async () => {
      await blocked
      return {}
    })

    let first = ''
    let second = ''
    act(() => {
      first = explorer.current.addUploadSession(
        'bucket',
        'docs',
        [node('a.txt')],
        client(uploadFile),
        provider,
        target,
        refresh,
      )
      second = explorer.current.addUploadSession(
        'bucket',
        'docs',
        [node('b.txt')],
        client(uploadFile),
        provider,
        target,
        refresh,
      )
    })

    // The second session waits behind the first, so its file has not started.
    const queued = explorer.current.getUploadSessionById(second)?.progress?.allFiles
    const progress = queued?.get('/b.txt')
    expect(progress?.status).toBe('pending')
    if (queued && progress) {
      queued.set('/b.txt', { ...progress, status: 'cancelled' })
    }

    await act(async () => finishFirst())
    await waitFor(() => expect(summaryFor(first)?.type).toBe('success'))
    await waitFor(() => expect(summaryFor(second)?.type).toBe('info'), { timeout: 3000 })
    expect(summaryFor(second)?.render).toBe('All 1 file(s) were cancelled by user.')
    expect(uploadFile).toHaveBeenCalledTimes(1)
  })

  it('reports a file the storage cannot upload as failed', async () => {
    const { explorer, summaryFor } = setup()
    const noUploads = {} as IFileExplorerProvider

    let id = ''
    act(() => {
      id = explorer.current.addUploadSession(
        'bucket',
        'docs',
        [node('a.txt')],
        client(vi.fn()),
        noUploads,
        target,
        refresh,
      )
    })

    await waitFor(() => expect(summaryFor(id)?.type).toBe('error'))
  })
})
