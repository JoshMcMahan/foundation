// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { AttachmentRef } from '../types'
import MessageAttachments from './MessageAttachments'

const PREVIEW = 'data:image/png;base64,iVBORw0KGgo='

function image(id: string, extra?: Partial<AttachmentRef>): AttachmentRef {
  return {
    id,
    filename: `${id}.png`,
    contentType: 'image/png',
    size: 100,
    uploadedAt: '2026-01-01T00:00:00Z',
    ...extra,
  }
}

const download = (id: string) => `/dl/${id}`

// jsdom loads no images, so each one a test makes waits for it to say how it went.
const loads: { src: string; onload: (() => void) | null; onerror: (() => void) | null }[] = []
let cached = false
class FakeImage {
  src = ''
  onload: (() => void) | null = null
  onerror: (() => void) | null = null
  complete = cached
  naturalWidth = cached ? 1 : 0
  constructor() {
    loads.push(this)
  }
}

beforeEach(() => {
  loads.length = 0
  cached = false
  vi.stubGlobal('Image', FakeImage)
})
afterEach(() => {
  vi.unstubAllGlobals()
})

function viewerImage(name: string) {
  return within(screen.getByRole('dialog', { name })).getByRole('img', { name })
}

describe('message image viewer', () => {
  it('opens on a plain click and closes on its close button, returning focus to the thumbnail', async () => {
    render(<MessageAttachments attachments={[image('a')]} downloadUrl={download} />)
    const thumbnail = screen.getByRole('link', { name: 'a.png' })
    fireEvent.click(thumbnail)
    const dialog = await screen.findByRole('dialog', { name: 'a.png' })
    expect(viewerImage('a.png')).toHaveAttribute('src', '/dl/a')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Close' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(thumbnail).toHaveFocus()
  })

  it('closes on Escape', async () => {
    render(<MessageAttachments attachments={[image('a')]} downloadUrl={download} />)
    fireEvent.click(screen.getByRole('link', { name: 'a.png' }))
    fireEvent.keyDown(await screen.findByRole('dialog'), { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(screen.getByRole('link', { name: 'a.png' })).toHaveFocus()
  })

  it('closes on a click on the backdrop', async () => {
    render(<MessageAttachments attachments={[image('a')]} downloadUrl={download} />)
    fireEvent.click(screen.getByRole('link', { name: 'a.png' }))
    const dialog = await screen.findByRole('dialog')
    const outside = dialog.parentElement as HTMLElement
    fireEvent.pointerDown(outside)
    fireEvent.mouseDown(outside)
    fireEvent.pointerUp(outside)
    fireEvent.mouseUp(outside)
    fireEvent.click(outside)
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('shows the preview as the thumbnail and never links to it', () => {
    render(
      <MessageAttachments
        attachments={[image('a', { previewUrl: PREVIEW })]}
        downloadUrl={download}
      />,
    )
    const thumbnail = screen.getByRole('img', { name: 'a.png' })
    expect(thumbnail).toHaveAttribute('src', PREVIEW)
    expect(screen.getByRole('link', { name: 'a.png' })).toHaveAttribute('href', '/dl/a')
    for (const link of document.querySelectorAll('a')) {
      expect(link.getAttribute('href')).not.toBe(PREVIEW)
    }
  })

  it('swaps the preview for the full image once it loads', async () => {
    render(
      <MessageAttachments
        attachments={[image('a', { previewUrl: PREVIEW })]}
        downloadUrl={download}
      />,
    )
    fireEvent.click(screen.getByRole('link', { name: 'a.png' }))
    await screen.findByRole('dialog')
    expect(viewerImage('a.png')).toHaveAttribute('src', PREVIEW)
    const full = loads.find((load) => load.src === '/dl/a')
    expect(full).toBeDefined()
    act(() => full?.onload?.())
    expect(viewerImage('a.png')).toHaveAttribute('src', '/dl/a')
  })

  it('keeps the preview when the full image fails to load', async () => {
    render(
      <MessageAttachments
        attachments={[image('a', { previewUrl: PREVIEW })]}
        downloadUrl={download}
      />,
    )
    fireEvent.click(screen.getByRole('link', { name: 'a.png' }))
    await screen.findByRole('dialog')
    act(() => loads.find((load) => load.src === '/dl/a')?.onerror?.())
    expect(viewerImage('a.png')).toHaveAttribute('src', PREVIEW)
  })

  it('says it is loading over a blurred preview until the full image arrives', async () => {
    render(
      <MessageAttachments
        attachments={[image('a', { previewUrl: PREVIEW })]}
        downloadUrl={download}
      />,
    )
    fireEvent.click(screen.getByRole('link', { name: 'a.png' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByRole('status')).toHaveTextContent('Loading…')
    expect(viewerImage('a.png')).toHaveClass('blur-lg', 'size-full')
    act(() => loads.find((load) => load.src === '/dl/a')?.onload?.())
    expect(within(dialog).getByRole('status')).toBeEmptyDOMElement()
    expect(viewerImage('a.png')).not.toHaveClass('blur-lg')
    expect(viewerImage('a.png')).not.toHaveClass('size-full')
  })

  it('stops loading and says it is showing a preview when the full image fails', async () => {
    render(
      <MessageAttachments
        attachments={[image('a', { previewUrl: PREVIEW })]}
        downloadUrl={download}
      />,
    )
    fireEvent.click(screen.getByRole('link', { name: 'a.png' }))
    const dialog = await screen.findByRole('dialog')
    act(() => loads.find((load) => load.src === '/dl/a')?.onerror?.())
    expect(within(dialog).getByRole('status')).toHaveTextContent(
      "Couldn't load the full image. Showing a preview.",
    )
    expect(viewerImage('a.png')).not.toHaveClass('blur-lg')
    expect(viewerImage('a.png')).not.toHaveClass('size-full')
  })

  it('opens straight on a full image the browser already holds', async () => {
    cached = true
    render(
      <MessageAttachments
        attachments={[image('a', { previewUrl: PREVIEW })]}
        downloadUrl={download}
      />,
    )
    fireEvent.click(screen.getByRole('link', { name: 'a.png' }))
    const dialog = await screen.findByRole('dialog')
    expect(viewerImage('a.png')).toHaveAttribute('src', '/dl/a')
    expect(within(dialog).getByRole('status')).toBeEmptyDOMElement()
    expect(viewerImage('a.png')).not.toHaveClass('blur-lg')
  })

  it('loads nothing for a file that is its own preview, and still offers it to download', async () => {
    render(
      <MessageAttachments
        attachments={[image('a', { previewUrl: PREVIEW, size: 8 })]}
        downloadUrl={download}
      />,
    )
    fireEvent.click(screen.getByRole('link', { name: 'a.png' }))
    const dialog = await screen.findByRole('dialog')
    expect(loads).toHaveLength(0)
    expect(viewerImage('a.png')).toHaveAttribute('src', PREVIEW)
    expect(viewerImage('a.png')).not.toHaveClass('blur-lg')
    expect(within(dialog).getByRole('status')).toBeEmptyDOMElement()
    expect(within(dialog).getByRole('link', { name: 'Download a.png' })).toHaveAttribute(
      'href',
      '/dl/a',
    )
  })

  it('carries on with the same load when the viewer closes and opens again', async () => {
    render(
      <MessageAttachments
        attachments={[image('a', { previewUrl: PREVIEW })]}
        downloadUrl={download}
      />,
    )
    const thumbnail = screen.getByRole('link', { name: 'a.png' })
    fireEvent.click(thumbnail)
    fireEvent.keyDown(await screen.findByRole('dialog'), { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    fireEvent.click(thumbnail)
    const dialog = await screen.findByRole('dialog')
    const started = loads.filter((load) => load.src === '/dl/a')
    expect(started).toHaveLength(1)
    expect(within(dialog).getByRole('status')).toHaveTextContent('Loading…')
    act(() => started[0]?.onload?.())
    expect(viewerImage('a.png')).toHaveAttribute('src', '/dl/a')
  })

  it('keeps a zoomed preview at its zoom while the full image loads', async () => {
    render(
      <MessageAttachments
        attachments={[image('a', { previewUrl: PREVIEW })]}
        downloadUrl={download}
      />,
    )
    fireEvent.click(screen.getByRole('link', { name: 'a.png' }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.keyDown(dialog, { key: '+' })
    expect(viewerImage('a.png')).toHaveStyle({ width: '125%' })
    expect(viewerImage('a.png')).toHaveClass('blur-lg')
    expect(viewerImage('a.png')).not.toHaveClass('size-full')
  })

  it('leaves the click to a host that opens attachments itself', () => {
    const onOpen = vi.fn()
    const att = image('a')
    render(<MessageAttachments attachments={[att]} downloadUrl={download} onOpen={onOpen} />)
    fireEvent.click(screen.getByRole('link', { name: 'a.png' }))
    expect(onOpen).toHaveBeenCalledWith(att)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('leaves a modified click to the browser', () => {
    render(<MessageAttachments attachments={[image('a')]} downloadUrl={download} />)
    const link = screen.getByRole('link', { name: 'a.png' })
    for (const modifier of ['metaKey', 'ctrlKey', 'shiftKey', 'altKey']) {
      // fireEvent returns false when a handler prevented the default.
      expect(fireEvent.click(link, { [modifier]: true })).toBe(true)
    }
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('offers a download only for a URL that cannot run script', async () => {
    const { unmount } = render(
      <MessageAttachments attachments={[image('a')]} downloadUrl={download} />,
    )
    fireEvent.click(screen.getByRole('link', { name: 'a.png' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByRole('link', { name: 'Download a.png' })).toHaveAttribute(
      'href',
      '/dl/a',
    )
    unmount()

    // An image's own data: URL still shows, but is never a link.
    const dataUrl = (id: string) => `data:image/png;base64,${id}`
    render(<MessageAttachments attachments={[image('b')]} downloadUrl={dataUrl} />)
    expect(screen.queryByRole('link')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'b.png' }))
    const unlinked = await screen.findByRole('dialog', { name: 'b.png' })
    expect(within(unlinked).queryByRole('link')).toBeNull()
  })

  it('opens a preview with no download, named for an unnamed image', async () => {
    render(<MessageAttachments attachments={[image('a', { filename: '', previewUrl: PREVIEW })]} />)
    fireEvent.click(screen.getByRole('button', { name: 'Image attachment' }))
    expect(await screen.findByRole('dialog', { name: 'Image attachment' })).toBeInTheDocument()
    expect(viewerImage('Image attachment')).toHaveAttribute('src', PREVIEW)
  })

  it('steps between a message’s images with the arrow keys and buttons', async () => {
    render(
      <MessageAttachments
        attachments={[image('a'), { ...image('doc'), contentType: 'text/plain' }, image('b')]}
        downloadUrl={download}
      />,
    )
    fireEvent.click(screen.getByRole('link', { name: 'a.png' }))
    const dialog = await screen.findByRole('dialog', { name: 'a.png' })
    expect(within(dialog).getByText('1 of 2')).toBeInTheDocument()
    fireEvent.keyDown(dialog, { key: 'ArrowRight' })
    expect(screen.getByRole('dialog', { name: 'b.png' })).toBeInTheDocument()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Next image' }))
    expect(screen.getByRole('dialog', { name: 'a.png' })).toBeInTheDocument()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Previous image' }))
    expect(screen.getByRole('dialog', { name: 'b.png' })).toBeInTheDocument()
    fireEvent.keyDown(dialog, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(screen.getByRole('link', { name: 'b.png' })).toHaveFocus()
  })

  it('keeps an image with no picture to show as a plain chip', () => {
    render(<MessageAttachments attachments={[image('a')]} />)
    expect(screen.queryByRole('img')).toBeNull()
    expect(screen.queryByRole('button')).toBeNull()
    expect(screen.getByText('a.png')).toBeInTheDocument()
  })
})

describe('message image viewer stage', () => {
  it('closes on a click around the picture, not on the picture', async () => {
    render(<MessageAttachments attachments={[image('a')]} downloadUrl={download} />)
    fireEvent.click(screen.getByRole('link', { name: 'a.png' }))
    await screen.findByRole('dialog')
    const picture = viewerImage('a.png') as HTMLImageElement
    fireEvent.click(picture)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    fireEvent.click(picture.parentElement as HTMLElement)
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('closes on a click in the room beside the bar, not on the bar', async () => {
    render(<MessageAttachments attachments={[image('a')]} downloadUrl={download} />)
    fireEvent.click(screen.getByRole('link', { name: 'a.png' }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByText('a.png'))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    fireEvent.click(dialog)
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('opens with focus on the dialog, not its first button', async () => {
    render(<MessageAttachments attachments={[image('a'), image('b')]} downloadUrl={download} />)
    fireEvent.click(screen.getByRole('link', { name: 'a.png' }))
    const dialog = await screen.findByRole('dialog', { name: 'a.png' })
    await waitFor(() => expect(dialog).toHaveFocus())
  })

  it('steps with the arrow keys the other way round right to left', async () => {
    render(
      <MessageAttachments
        attachments={[image('a'), image('b'), image('c')]}
        downloadUrl={download}
      />,
    )
    fireEvent.click(screen.getByRole('link', { name: 'a.png' }))
    const dialog = await screen.findByRole('dialog', { name: 'a.png' })
    // jsdom maps no dir attribute to a computed direction, so the dialog states its own.
    dialog.style.direction = 'rtl'
    fireEvent.keyDown(dialog, { key: 'ArrowLeft' })
    expect(screen.getByRole('dialog', { name: 'b.png' })).toBeInTheDocument()
    fireEvent.keyDown(dialog, { key: 'ArrowRight' })
    expect(screen.getByRole('dialog', { name: 'a.png' })).toBeInTheDocument()
  })

  it('never scales a picture past its own size', async () => {
    render(<MessageAttachments attachments={[image('a')]} downloadUrl={download} />)
    fireEvent.click(screen.getByRole('link', { name: 'a.png' }))
    await screen.findByRole('dialog')
    const picture = viewerImage('a.png') as HTMLImageElement
    expect(picture).toHaveStyle({ maxWidth: '100%', maxHeight: '100%' })
    expect(picture.style.width).toBe('')
  })
})

describe('message image viewer zoom', () => {
  async function openViewer(attachments: AttachmentRef[]) {
    render(<MessageAttachments attachments={attachments} downloadUrl={download} />)
    fireEvent.click(screen.getByRole('link', { name: attachments[0]?.filename ?? '' }))
    return screen.findByRole('dialog')
  }

  it('zooms with its buttons, showing the zoom', async () => {
    const dialog = await openViewer([image('a')])
    expect(within(dialog).getByText('100%')).toBeInTheDocument()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Zoom in' }))
    expect(within(dialog).getByText('125%')).toBeInTheDocument()
    expect(viewerImage('a.png')).toHaveStyle({ width: '125%' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Zoom out' }))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Zoom out' }))
    expect(within(dialog).getByText('75%')).toBeInTheDocument()
  })

  it('zooms with + or =, out with -, and fits again with 0', async () => {
    const dialog = await openViewer([image('a')])
    fireEvent.keyDown(dialog, { key: '+' })
    fireEvent.keyDown(dialog, { key: '=' })
    expect(within(dialog).getByText('150%')).toBeInTheDocument()
    fireEvent.keyDown(dialog, { key: '-' })
    expect(within(dialog).getByText('125%')).toBeInTheDocument()
    fireEvent.keyDown(dialog, { key: '0' })
    expect(within(dialog).getByText('100%')).toBeInTheDocument()
    expect(viewerImage('a.png')).toHaveStyle({ maxWidth: '100%', maxHeight: '100%' })
  })

  it('leaves a modified + to the browser’s own page zoom', async () => {
    const dialog = await openViewer([image('a')])
    fireEvent.keyDown(dialog, { key: '=', metaKey: true })
    fireEvent.keyDown(dialog, { key: '+', ctrlKey: true })
    expect(within(dialog).getByText('100%')).toBeInTheDocument()
  })

  it('fits the next image when it steps, and fits again when it reopens', async () => {
    const dialog = await openViewer([image('a'), image('b')])
    fireEvent.keyDown(dialog, { key: '+' })
    fireEvent.keyDown(dialog, { key: 'ArrowRight' })
    expect(screen.getByRole('dialog', { name: 'b.png' })).toBeInTheDocument()
    expect(within(dialog).getByText('100%')).toBeInTheDocument()
    fireEvent.keyDown(dialog, { key: '+' })
    fireEvent.keyDown(dialog, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    fireEvent.click(screen.getByRole('link', { name: 'b.png' }))
    const reopened = await screen.findByRole('dialog', { name: 'b.png' })
    expect(within(reopened).getByText('100%')).toBeInTheDocument()
  })
})
