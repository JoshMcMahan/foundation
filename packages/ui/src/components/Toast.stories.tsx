import type { Meta, StoryObj } from '@storybook/react-vite'
import { useLayoutEffect, useState } from 'react'
import { expect, screen, userEvent, waitFor, within } from 'storybook/test'
import { Button } from './Button'
import { ProgressBar } from './Meter'
import { Modal, ModalTitle } from './Modal'
import { type ToastTone, toast } from './Toast'

const meta: Meta = {
  title: 'UI/Toast',
}
export default meta

const region = () => screen.getByRole('region', { name: 'Notifications' })

/** Waits for a toast with this text, and returns it. */
const shownToast = async (text: string, timeout = 1000) => {
  const found = await within(region()).findByText(text, {}, { timeout })
  const shown = found.closest('[role="dialog"], [role="alertdialog"]')
  if (!(shown instanceof HTMLElement)) {
    throw new Error(`no toast holds "${text}"`)
  }
  await waitFor(() => expect(shown.getAttribute('data-starting-style')).toBeNull())
  return shown
}

const overlaps = (a: DOMRect, b: DOMRect) =>
  a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom

interface ToastArgs {
  tone: ToastTone
  message: string
  title: string
  timeout: number
  keep: boolean
  action: boolean
}

/** A notice along the top of the window. It closes itself, pausing while the
 *  pointer or focus is on it, and a swipe up or to the right dismisses it. */
export const Toasts: StoryObj<ToastArgs> = {
  args: {
    tone: 'success',
    message: 'Your changes are saved.',
    title: '',
    timeout: 5000,
    keep: false,
    action: false,
  },
  argTypes: {
    tone: { control: 'inline-radio', options: ['info', 'success', 'warning', 'error'] },
    title: { control: 'text', description: 'A bold first line; empty for none.' },
    timeout: { control: 'number', description: 'Milliseconds before it closes itself.' },
    keep: { control: 'boolean', description: 'Stays until dismissed (timeout: false).' },
    action: { control: 'boolean', description: 'Adds an Undo action.' },
  },
  render: ({ tone, message, title, timeout, keep, action }) => (
    <div className="flex flex-wrap gap-2 p-8">
      <Button
        variant="primary"
        onClick={() =>
          toast[tone](message, {
            ...(title ? { title } : {}),
            timeout: keep ? false : timeout,
            ...(action ? { action: { label: 'Undo', onClick: () => toast.info('Undone') } } : {}),
          })
        }
      >
        Show toast
      </Button>
      <Button onClick={() => toast.error('Could not reach the server.')}>Show an error</Button>
    </div>
  ),
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole('button', { name: 'Show toast' }))
    const shown = await shownToast('Your changes are saved.')
    await expect(region()).toHaveAttribute('aria-live', 'polite')
    await userEvent.click(within(shown).getByLabelText('Close'))
    await waitFor(() =>
      expect(within(region()).queryByText('Your changes are saved.')).not.toBeInTheDocument(),
    )
    // An error interrupts: Base UI announces it at once through an alert.
    await userEvent.click(within(canvasElement).getByRole('button', { name: 'Show an error' }))
    await waitFor(() =>
      expect(
        screen.getAllByRole('alert').some((a) => a.textContent?.includes('Could not reach')),
      ).toBe(true),
    )
    toast.dismiss()
  },
}

function Upload() {
  const start = () => {
    const id = toast.loading('Preparing upload…')
    let done = 0
    const tick = setInterval(() => {
      done += 20
      if (done > 100) {
        clearInterval(tick)
        toast.update(id, { tone: 'success', message: 'Uploaded 3 files' })
        return
      }
      toast.update(id, {
        icon: false,
        message: (
          <div className="flex flex-col gap-1.5">
            <span>Uploading 3 files</span>
            <ProgressBar value={done} aria-label="Upload progress" />
          </div>
        ),
      })
    }, 400)
  }
  return (
    <div className="flex flex-wrap gap-2 p-8">
      <Button variant="primary" onClick={start}>
        Upload
      </Button>
      <Button
        onClick={() =>
          toast.promise(new Promise((resolve) => setTimeout(resolve, 1200)), {
            loading: 'Saving…',
            success: 'Saved',
            error: 'Could not save',
          })
        }
      >
        Save with a promise
      </Button>
    </div>
  )
}

/** Work in the background: a loading toast that shows progress, then settles
 *  into a tone in place. */
export const Progress: StoryObj = {
  render: () => <Upload />,
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole('button', { name: 'Upload' }))
    await shownToast('Preparing upload…')
    await within(region()).findByRole('progressbar', { name: 'Upload progress' })
    await shownToast('Uploaded 3 files', 5000)
    await expect(within(region()).getAllByRole('dialog')).toHaveLength(1)
    toast.dismiss()
  },
}

function ModalWithToasts() {
  const [open, setOpen] = useState(true)
  return (
    <div className="p-8">
      <Button variant="primary" onClick={() => setOpen(true)}>
        Edit
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        className="flex max-h-full w-full max-w-xl flex-col"
      >
        <div className="flex items-start justify-between gap-3 border-b border-(--theme-border) p-4">
          <ModalTitle className="text-base font-semibold">Edit the cluster</ModalTitle>
          <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
            Close
          </Button>
        </div>
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4 text-sm">
          {['Name', 'Region', 'Nodes', 'Machine type', 'Disk', 'Network', 'Tags'].map((label) => (
            <p key={label} className="h-12 rounded-md bg-(--theme-muted-panel-bg) p-3">
              {label}
            </p>
          ))}
        </div>
        <div className="flex justify-end gap-2 border-t border-(--theme-border) p-4">
          <Button onClick={() => toast.info('Draft saved')}>Save draft</Button>
          <Button variant="primary" onClick={() => toast.error('The cluster is offline')}>
            Connect
          </Button>
        </div>
      </Modal>
    </div>
  )
}

/** A toast raised from a modal stays above it and usable: pressing it doesn't
 *  close the modal. It sits along the top, clear of the modal's panel and so of
 *  every button on it, at any width. */
export const OverAModal: StoryObj = {
  name: 'Over a modal',
  render: () => <ModalWithToasts />,
  play: async () => {
    const dialog = await screen.findByRole('dialog', { name: 'Edit the cluster' })
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save draft' }))
    await userEvent.click(within(dialog).getByRole('button', { name: 'Connect' }))
    const draft = await shownToast('Draft saved')
    const offline = await shownToast('The cluster is offline')
    // The modal leaves the toasts in the accessibility tree.
    await expect(region().closest('[aria-hidden="true"]')).toBeNull()
    for (const button of within(dialog).getAllByRole('button')) {
      for (const shown of [draft, offline]) {
        await expect(
          overlaps(shown.getBoundingClientRect(), button.getBoundingClientRect()),
          `a toast covers ${button.textContent}`,
        ).toBe(false)
      }
    }
    await userEvent.click(within(offline).getByLabelText('Close'))
    await waitFor(() =>
      expect(within(region()).queryByText('The cluster is offline')).not.toBeInTheDocument(),
    )
    await expect(screen.getByRole('dialog', { name: 'Edit the cluster' })).toBeVisible()
    toast.dismiss()
  },
}

const SIDEBAR = 240
const TOP_BAR = 48

function HostChrome() {
  // A host sets these on the document root; the story sets and clears them.
  useLayoutEffect(() => {
    const root = document.documentElement.style
    root.setProperty('--app-inset-start', `${SIDEBAR}px`)
    root.setProperty('--app-inset-top', `${TOP_BAR}px`)
    return () => {
      root.removeProperty('--app-inset-start')
      root.removeProperty('--app-inset-top')
    }
  }, [])
  return (
    <div className="fixed inset-0">
      <div
        data-testid="top-bar"
        className="fixed inset-x-0 top-0 border-b border-(--theme-border) bg-(--theme-panel-bg)"
        style={{ height: TOP_BAR }}
      />
      <div
        className="fixed bottom-0 left-0 border-r border-(--theme-border) bg-(--theme-sidebar-bg)"
        style={{ top: TOP_BAR, width: SIDEBAR }}
      />
      <div
        data-testid="content"
        className="fixed right-0 bottom-0 p-8"
        style={{ top: TOP_BAR, left: SIDEBAR }}
      >
        <Button variant="primary" onClick={() => toast.success('Your changes are saved.')}>
          Save
        </Button>
      </div>
    </div>
  )
}

/** Beside a host's fixed sidebar and below its top bar, a toast centres over the
 *  page content, not the whole window, once the host sets `--app-inset-start` and
 *  `--app-inset-top`. */
export const BesideHostChrome: StoryObj = {
  render: () => <HostChrome />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Save' }))
    const shown = await shownToast('Your changes are saved.')
    const content = canvas.getByTestId('content').getBoundingClientRect()
    const bar = canvas.getByTestId('top-bar').getBoundingClientRect()
    const centre = (r: DOMRect) => r.left + r.width / 2
    // It slides in from above, so its place is checked once it has landed.
    await waitFor(() =>
      expect(shown.getBoundingClientRect().top).toBeGreaterThanOrEqual(bar.bottom),
    )
    await expect(Math.abs(centre(shown.getBoundingClientRect()) - centre(content))).toBeLessThan(2)
    toast.dismiss()
  },
}
