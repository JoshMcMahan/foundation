// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { ConfirmModal } from './ConfirmModal'
import { Modal } from './Modal'

describe('Modal', () => {
  it('is a dialog named by its title and described by its description', async () => {
    render(
      <Modal
        open
        onClose={vi.fn()}
        title="Release notes"
        description="What changed."
        footer={<button type="button">Done</button>}
      >
        <p>Faster scheduling.</p>
      </Modal>,
    )
    const dialog = await screen.findByRole('dialog', { name: 'Release notes' })
    expect(dialog).toHaveAccessibleDescription('What changed.')
    expect(screen.getByRole('heading', { level: 2, name: 'Release notes' })).toBeInTheDocument()
    // The footer follows the body, so the actions come last in reading and focus order.
    const body = screen.getByText('Faster scheduling.')
    const done = screen.getByRole('button', { name: 'Done' })
    expect(body.compareDocumentPosition(done) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('leaves the whole panel to children without a title or a footer', async () => {
    render(
      <Modal open onClose={vi.fn()} aria-label="Preview" className="custom-panel">
        <p>Picture</p>
      </Modal>,
    )
    const dialog = await screen.findByRole('dialog', { name: 'Preview' })
    expect(dialog).toHaveClass('custom-panel')
    expect(screen.getByText('Picture').parentElement).toBe(dialog)
  })

  it('closes on Escape unless it is not dismissible', async () => {
    const onClose = vi.fn()
    const { rerender } = render(<Modal open onClose={onClose} title="Edit" dismissible={false} />)
    fireEvent.keyDown(await screen.findByRole('dialog'), { key: 'Escape' })
    expect(onClose).not.toHaveBeenCalled()
    rerender(<Modal open onClose={onClose} title="Edit" />)
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})

describe('Modal inside fullscreen', () => {
  let fullscreen: Element | null = null
  beforeAll(() => {
    Object.defineProperty(document, 'fullscreenElement', {
      configurable: true,
      get: () => fullscreen,
    })
  })
  afterEach(() => {
    fullscreen = null
  })

  it('portals into the fullscreen element, where the browser still shows it', async () => {
    const stage = document.createElement('div')
    document.body.appendChild(stage)
    fullscreen = stage
    render(<Modal open onClose={vi.fn()} title="Restart session?" />)
    expect(stage).toContainElement(await screen.findByRole('dialog', { name: 'Restart session?' }))
    act(() => {
      fullscreen = null
      document.dispatchEvent(new Event('fullscreenchange'))
    })
    await waitFor(() => expect(stage).not.toContainElement(screen.queryByRole('dialog')))
    expect(screen.getByRole('dialog', { name: 'Restart session?' })).toBeInTheDocument()
    stage.remove()
  })
})

describe('ConfirmModal', () => {
  it('is an alertdialog when destructive, with the confirm button named for the action', async () => {
    render(
      <ConfirmModal
        open
        onClose={vi.fn()}
        destructive
        title="Delete cluster?"
        description="Its disks are erased."
        confirmLabel="Delete"
        onConfirm={vi.fn()}
      />,
    )
    const dialog = await screen.findByRole('alertdialog', { name: 'Delete cluster?' })
    expect(dialog).toHaveAccessibleDescription('Its disks are erased.')
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
  })

  it('confirms once while an async handler runs, then closes', async () => {
    let finish = () => {}
    const onConfirm = vi.fn(() => new Promise<void>((resolve) => (finish = resolve)))
    const onClose = vi.fn()
    render(
      <ConfirmModal
        open
        onClose={onClose}
        title="Restart?"
        confirmLabel="Restart"
        onConfirm={onConfirm}
      />,
    )
    const confirm = await screen.findByRole('button', { name: /Restart/ })
    fireEvent.click(confirm)
    fireEvent.click(confirm)
    expect(onConfirm).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()
    await act(async () => finish())
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
  })

  it('stays open and can confirm again after the handler rejects', async () => {
    const onConfirm = vi.fn().mockRejectedValueOnce(new Error('busy')).mockResolvedValue(undefined)
    const onClose = vi.fn()
    const rejections: unknown[] = []
    const onRejection = (event: PromiseRejectionEvent) => {
      event.preventDefault()
      rejections.push(event.reason)
    }
    window.addEventListener('unhandledrejection', onRejection)
    const swallow = (reason: unknown) => rejections.push(reason)
    process.on('unhandledRejection', swallow)
    try {
      render(
        <ConfirmModal
          open
          onClose={onClose}
          title="Restart?"
          confirmLabel="Restart"
          onConfirm={onConfirm}
        />,
      )
      const confirm = await screen.findByRole('button', { name: /Restart/ })
      fireEvent.click(confirm)
      await waitFor(() => expect(screen.getByRole('button', { name: 'Cancel' })).toBeEnabled())
      expect(onClose).not.toHaveBeenCalled()
      fireEvent.click(confirm)
      await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
      expect(onConfirm).toHaveBeenCalledTimes(2)
    } finally {
      window.removeEventListener('unhandledrejection', onRejection)
      process.off('unhandledRejection', swallow)
    }
  })
})
