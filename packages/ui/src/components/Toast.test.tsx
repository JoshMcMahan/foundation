// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { useState } from 'react'
import { Button } from './Button'
import { Modal, ModalTitle } from './Modal'
import { UIProvider } from './Provider'
import { toast } from './Toast'

afterEach(() => {
  act(() => toast.dismiss())
})

const region = () => screen.getByRole('region', { name: 'Notifications' })
// Base UI hides a toast's close button from assistive technology until the
// toasts are focused or expanded, so queries find it by its label alone.

describe('toast', () => {
  it('shows a toast in a live region, with a close button', async () => {
    render(<UIProvider>{null}</UIProvider>)
    act(() => {
      toast.success('Saved')
    })
    expect(region()).toHaveAttribute('aria-live', 'polite')
    const shown = await within(region()).findByRole('dialog')
    expect(shown).toHaveTextContent('Saved')
    fireEvent.click(within(shown).getByLabelText('Close'))
    await waitFor(() => expect(within(region()).queryByText('Saved')).not.toBeInTheDocument())
  })

  it('interrupts with an error', async () => {
    render(<UIProvider>{null}</UIProvider>)
    act(() => {
      toast.error('Could not save')
    })
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not save')
  })

  it('settles a loading toast into a tone in place', async () => {
    render(<UIProvider>{null}</UIProvider>)
    let id = ''
    act(() => {
      id = toast.loading('Uploading…')
    })
    const shown = await within(region()).findByRole('dialog')
    // A loading toast stays until it settles, so it offers no close button.
    expect(within(shown).queryByLabelText('Close')).not.toBeInTheDocument()
    act(() => toast.update(id, { tone: 'success', message: 'Uploaded' }))
    await waitFor(() => expect(within(region()).getByRole('dialog')).toHaveTextContent('Uploaded'))
    expect(within(region()).getAllByRole('dialog')).toHaveLength(1)
    expect(
      within(region()).getByLabelText('Close'),
      'a settled toast takes its tone’s close button',
    ).toBeInTheDocument()
  })

  it('changes only what an update without a tone names', async () => {
    render(<UIProvider>{null}</UIProvider>)
    let id = ''
    act(() => {
      id = toast.loading('Uploading 1 of 2', { icon: false })
    })
    act(() => toast.update(id, { message: 'Uploading 2 of 2' }))
    const shown = await within(region()).findByRole('dialog')
    await waitFor(() => expect(shown).toHaveTextContent('Uploading 2 of 2'))
    expect(within(shown).queryByLabelText('Close')).not.toBeInTheDocument()
  })

  it('replaces a toast shown with the same id', async () => {
    render(<UIProvider>{null}</UIProvider>)
    act(() => {
      toast.info('Queued', { id: 'job' })
      toast.info('Running', { id: 'job' })
    })
    await waitFor(() => expect(within(region()).getByRole('dialog')).toHaveTextContent('Running'))
    expect(within(region()).getAllByRole('dialog')).toHaveLength(1)
  })

  it('runs its action, then closes', async () => {
    render(<UIProvider>{null}</UIProvider>)
    const onClick = vi.fn()
    act(() => {
      toast.info('Deleted', { action: { label: 'Undo', onClick } })
    })
    fireEvent.click(await within(region()).findByRole('button', { name: 'Undo' }))
    expect(onClick).toHaveBeenCalledOnce()
    await waitFor(() => expect(within(region()).queryByText('Deleted')).not.toBeInTheDocument())
  })

  it('follows a promise to its outcome', async () => {
    render(<UIProvider>{null}</UIProvider>)
    let resolve: (value: number) => void = () => {}
    let settled: Promise<number> = Promise.resolve(0)
    act(() => {
      settled = toast.promise(new Promise<number>((r) => (resolve = r)), {
        loading: 'Saving…',
        success: (n) => `Saved ${n}`,
        error: 'Could not save',
      })
    })
    expect(await within(region()).findByRole('dialog')).toHaveTextContent('Saving…')
    await act(async () => {
      resolve(3)
      expect(await settled).toBe(3)
    })
    await waitFor(() => expect(within(region()).getByRole('dialog')).toHaveTextContent('Saved 3'))
  })

  it('shows each toast once under nested providers', async () => {
    render(
      <UIProvider>
        <UIProvider>{null}</UIProvider>
      </UIProvider>,
    )
    act(() => {
      toast.info('Once')
    })
    expect(await screen.findAllByText('Once')).toHaveLength(1)
    expect(screen.getAllByRole('region', { name: 'Notifications' })).toHaveLength(1)
  })

  it('can be dismissed without closing the modal open under it', async () => {
    function Page() {
      const [open, setOpen] = useState(true)
      return (
        <Modal open={open} onClose={() => setOpen(false)} aria-label="Edit">
          <ModalTitle>Edit</ModalTitle>
          <Button onClick={() => toast.info('Saved a draft')}>Save draft</Button>
        </Modal>
      )
    }
    render(
      <UIProvider>
        <Page />
      </UIProvider>,
    )
    fireEvent.click(await screen.findByRole('button', { name: 'Save draft' }))
    const close = await within(region()).findByLabelText('Close')
    fireEvent.pointerDown(close)
    fireEvent.mouseDown(close)
    fireEvent.click(close)
    await waitFor(() =>
      expect(within(region()).queryByText('Saved a draft')).not.toBeInTheDocument(),
    )
    expect(screen.getByRole('dialog', { name: 'Edit' })).toBeInTheDocument()
  })
})
