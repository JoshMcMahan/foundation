// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { UIProvider } from '../../components/Provider'
import type { TreeNode, TStorage } from '../lib/types'
import type { PreviewKind } from './previewType'
import { FilePreviewViewer } from './Viewer'

vi.mock('./CodePreviewEditor', () => ({
  default: ({ value }: { value: string }) => <pre>{value}</pre>,
}))

const MiB = 1024 * 1024

const STORAGE: TStorage = {
  id: 'limited',
  name: 'limited',
  user: 'reader',
  previewLimits: { codeBytes: 64, codeLines: 3, notebookBytes: 5 * MiB },
}

function file(name: string, size: number): TreeNode {
  return { name, path: `limited/${name}`, type: 'file', size }
}

function renderPreview(node: TreeNode, kind: PreviewKind) {
  return render(
    <UIProvider>
      <FilePreviewViewer
        node={node}
        kind={kind}
        url="/content"
        urlLoading={false}
        urlError={null}
        storage={STORAGE}
        onDownload={() => {}}
      />
    </UIProvider>,
  )
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('per-storage preview limits', () => {
  it('shows the size and a download instead of fetching a file over the limit', () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    renderPreview(file('analysis.ipynb', 6 * MiB), 'notebook')

    expect(
      screen.getByText('This file is 6 MB, too large to preview in the browser.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Download instead' })).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('reads only the head of a text file larger than the byte limit', async () => {
    const fetchMock = vi.fn(
      async (_url: string, _init?: RequestInit) =>
        new Response('one\ntwo\nthree\nfour\n', { status: 206 }),
    )
    vi.stubGlobal('fetch', fetchMock)

    renderPreview(file('run.log', 3 * MiB), 'code')

    expect(await screen.findByText('First 3 lines')).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledOnce()
    const init = fetchMock.mock.calls[0]?.[1]
    expect(new Headers(init?.headers).get('Range')).toBe('bytes=0-64')
  })
})
