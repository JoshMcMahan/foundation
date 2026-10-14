// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { toast } from '../components/Toast'
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
  const update = vi.spyOn(toast, 'update')
  update.mockClear()
  const { result } = renderHook(() => useFileExplorer(), { wrapper: FileExplorerProvider })
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
  it('reports a file canceled before its upload starts as canceled', async () => {
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
      queued.set('/b.txt', { ...progress, status: 'canceled' })
    }

    await act(async () => finishFirst())
    await waitFor(() => expect(summaryFor(first)?.tone).toBe('success'))
    await waitFor(() => expect(summaryFor(second)?.tone).toBe('info'), { timeout: 3000 })
    expect(summaryFor(second)?.message).toBe('All 1 file(s) were canceled by user.')
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

    await waitFor(() => expect(summaryFor(id)?.tone).toBe('error'))
  })

  it('keeps at most three uploads in flight', async () => {
    const { explorer, summaryFor } = setup()
    let inFlight = 0
    let peak = 0
    const uploadFile = vi.fn(async () => {
      inFlight++
      peak = Math.max(peak, inFlight)
      await new Promise((resolve) => setTimeout(resolve, 5))
      inFlight--
      return {}
    })
    const nodes = Array.from({ length: 10 }, (_, i) => node(`f${i}.txt`))

    let id = ''
    act(() => {
      id = explorer.current.addUploadSession(
        'bucket',
        'docs',
        nodes,
        client(uploadFile),
        provider,
        target,
        refresh,
      )
    })

    await waitFor(() => expect(summaryFor(id)?.tone).toBe('success'), { timeout: 3000 })
    expect(uploadFile).toHaveBeenCalledTimes(10)
    expect(peak).toBe(3)
  })
})
