// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { UIProvider } from '../../components/Provider'
import type { TreeNode } from '../lib/types'
import { FilePreview } from '.'

function picture(name: string): TreeNode {
  return { name, path: `bucket/${name}`, type: 'file', size: 2048, contentType: 'image/png' }
}

function renderPreview(node: TreeNode, siblings: TreeNode[] = [node]) {
  const props = {
    open: true,
    siblings,
    storage: null,
    getPresignedUrl: async (n: TreeNode): Promise<[string, null]> => [`/signed/${n.name}`, null],
    onNavigate: vi.fn(),
    onClose: vi.fn(),
    onDownload: vi.fn(),
    onCopyUri: vi.fn(),
  }
  const view = render(
    <UIProvider>
      <FilePreview {...props} node={node} />
    </UIProvider>,
  )
  return {
    ...view,
    navigate: (next: TreeNode) =>
      view.rerender(
        <UIProvider>
          <FilePreview {...props} node={next} />
        </UIProvider>,
      ),
  }
}

afterEach(cleanup)

describe('file preview zoom', () => {
  it('fits a picture, zooms it by a quarter a step, and fits the next file again', async () => {
    const first = picture('first.png')
    const second = picture('second.png')
    const { navigate } = renderPreview(first, [first, second])
    const dialog = await screen.findByRole('dialog', { name: 'first.png' })
    const image = await within(dialog).findByRole('img', { name: 'first.png' })
    expect(image).toHaveStyle({ maxWidth: '100%', maxHeight: '100%' })
    expect(within(dialog).getByText('100%')).toBeInTheDocument()

    fireEvent.click(within(dialog).getByRole('button', { name: 'Zoom in' }))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Zoom in' }))
    expect(within(dialog).getByText('150%')).toBeInTheDocument()
    expect(within(dialog).getByRole('img', { name: 'first.png' })).toHaveStyle({ width: '150%' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Zoom out' }))
    expect(within(dialog).getByText('125%')).toBeInTheDocument()

    navigate(second)
    expect(await screen.findByText('100%')).toBeInTheDocument()
  })

  it('stops zooming out at a quarter and in at four times', async () => {
    renderPreview(picture('chart.png'))
    const dialog = await screen.findByRole('dialog')
    const zoomOut = within(dialog).getByRole('button', { name: 'Zoom out' })
    for (let i = 0; i < 6; i++) {
      fireEvent.click(zoomOut)
    }
    expect(within(dialog).getByText('25%')).toBeInTheDocument()
    const zoomIn = within(dialog).getByRole('button', { name: 'Zoom in' })
    for (let i = 0; i < 20; i++) {
      fireEvent.click(zoomIn)
    }
    expect(within(dialog).getByText('400%')).toBeInTheDocument()
  })
})

describe('file preview stage', () => {
  it('keeps a zoomed picture at its zoomed width, centered so its edges stay in scroll reach', async () => {
    renderPreview(picture('wide.png'))
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Zoom in' }))
    const image = within(dialog).getByRole('img', { name: 'wide.png' })
    expect(image).toHaveClass('shrink-0')
    expect(image.parentElement).toHaveClass('items-center-safe', 'justify-center-safe')
  })
})
