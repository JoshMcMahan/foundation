// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { useState } from 'react'
import { ConfirmModal, useConfirm } from './ConfirmModal'
import { Modal } from './Modal'
import { useClosingValue } from './useClosingValue'

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

describe('Modal close button and form', () => {
  it('closes from its header’s close button, with or without a title', async () => {
    const onClose = vi.fn()
    const { rerender } = render(<Modal open onClose={onClose} title="Logs" closeButton />)
    fireEvent.click(await screen.findByRole('button', { name: 'Close' }))
    expect(onClose).toHaveBeenCalledTimes(1)
    rerender(
      <Modal open onClose={onClose} aria-label="Preview" closeButton>
        <p>Picture</p>
      </Modal>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(onClose).toHaveBeenCalledTimes(2)
  })

  it('opens on its first control rather than its close button', async () => {
    const { rerender } = render(
      <Modal open onClose={vi.fn()} title="Rename" closeButton>
        <input aria-label="Name" />
      </Modal>,
    )
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Name' })).toHaveFocus())
    rerender(<Modal open={false} onClose={vi.fn()} title="Logs" closeButton />)
    rerender(<Modal open onClose={vi.fn()} title="Logs" closeButton />)
    const dialog = await screen.findByRole('dialog', { name: 'Logs' })
    await waitFor(() => expect(dialog).toHaveFocus())
  })

  it('submits the body’s fields from a submit button in the footer', async () => {
    const onSubmit = vi.fn()
    render(
      <Modal
        open
        onClose={vi.fn()}
        title="New entry"
        onSubmit={onSubmit}
        footer={<button type="submit">Save</button>}
      >
        <input aria-label="Name" />
      </Modal>,
    )
    fireEvent.click(await screen.findByRole('button', { name: 'Save' }))
    expect(onSubmit).toHaveBeenCalledTimes(1)
    expect(onSubmit.mock.calls[0]?.[0].defaultPrevented).toBe(true)
  })

  it('leaves an Escape a layer inside claimed to that layer', async () => {
    const onClose = vi.fn()
    render(
      <Modal open onClose={onClose} title="New issue">
        <input
          aria-label="Assignee"
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.preventDefault()
            }
          }}
        />
        <input aria-label="Title" />
      </Modal>,
    )
    fireEvent.keyDown(await screen.findByRole('textbox', { name: 'Assignee' }), { key: 'Escape' })
    expect(onClose).not.toHaveBeenCalled()
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Title' }), { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('stays open when a press starts inside and ends on the backdrop', async () => {
    const onClose = vi.fn()
    render(
      <Modal open onClose={onClose} title="Edit">
        <p>Drag a selection out of here</p>
      </Modal>,
    )
    const text = await screen.findByText('Drag a selection out of here')
    fireEvent.pointerDown(text)
    fireEvent.mouseDown(text)
    fireEvent.pointerUp(document.body)
    fireEvent.mouseUp(document.body)
    fireEvent.click(document.body)
    expect(onClose).not.toHaveBeenCalled()
  })
})

describe('ConfirmModal focus, pending and errors', () => {
  it('focuses Cancel when destructive and the action otherwise', async () => {
    const { rerender } = render(
      <ConfirmModal
        open
        onClose={vi.fn()}
        destructive
        title="Delete?"
        confirmLabel="Delete"
        onConfirm={vi.fn()}
      />,
    )
    await waitFor(() => expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus())
    rerender(
      <ConfirmModal
        open={false}
        onClose={vi.fn()}
        title="Restart?"
        confirmLabel="Restart"
        onConfirm={vi.fn()}
      />,
    )
    rerender(
      <ConfirmModal
        open
        onClose={vi.fn()}
        title="Restart?"
        confirmLabel="Restart"
        onConfirm={vi.fn()}
      />,
    )
    await waitFor(() => expect(screen.getByRole('button', { name: 'Restart' })).toHaveFocus())
  })

  it('focuses the first field in the body, even in a destructive dialog', async () => {
    render(
      <ConfirmModal
        open
        onClose={vi.fn()}
        destructive
        title="Delete domain?"
        confirmLabel="Delete"
        onConfirm={vi.fn()}
      >
        <label>
          Type the domain to confirm
          <input />
        </label>
        <label>
          Reason
          <textarea />
        </label>
      </ConfirmModal>,
    )
    await waitFor(() =>
      expect(screen.getByRole('textbox', { name: 'Type the domain to confirm' })).toHaveFocus(),
    )
  })

  it('keeps to the buttons when the body holds no field, or only a checkbox', async () => {
    render(
      <ConfirmModal
        open
        onClose={vi.fn()}
        destructive
        title="Delete cluster?"
        confirmLabel="Delete"
        onConfirm={vi.fn()}
      >
        <p>Its disks are erased.</p>
        <label>
          <input type="checkbox" />
          Also delete its snapshots
        </label>
      </ConfirmModal>,
    )
    await waitFor(() => expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus())
  })

  it('focuses a button when told to, despite a field', async () => {
    render(
      <ConfirmModal
        open
        onClose={vi.fn()}
        title="Rename?"
        confirmLabel="Rename"
        onConfirm={vi.fn()}
        initialFocus="confirm"
      >
        <input aria-label="Name" />
      </ConfirmModal>,
    )
    await waitFor(() => expect(screen.getByRole('button', { name: 'Rename' })).toHaveFocus())
  })

  it('falls back to the rule for the buttons when first-control finds no field', async () => {
    render(
      <ConfirmModal
        open
        onClose={vi.fn()}
        destructive
        title="Delete?"
        confirmLabel="Delete"
        onConfirm={vi.fn()}
        initialFocus="first-control"
      />,
    )
    await waitFor(() => expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus())
  })

  it('waits on work the host runs, and shows why the last try failed', async () => {
    const onConfirm = vi.fn()
    render(
      <ConfirmModal
        open
        onClose={vi.fn()}
        title="Restart?"
        confirmLabel="Restart"
        onConfirm={onConfirm}
        pending
        error="The cluster is busy."
      />,
    )
    expect(await screen.findByRole('alert')).toHaveTextContent('The cluster is busy.')
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: /Restart/ }))
    expect(onConfirm).not.toHaveBeenCalled()
  })
})

describe('useConfirm', () => {
  function Asker({
    onConfirm,
    onAnswer,
  }: {
    onConfirm: () => Promise<unknown> | undefined
    onAnswer: (answer: boolean) => void
  }) {
    const { confirm, dialog } = useConfirm()
    return (
      <>
        <button
          type="button"
          onClick={() =>
            confirm({
              title: 'Remove Ada?',
              confirmLabel: 'Remove',
              destructive: true,
              onConfirm,
              errorMessage: (error) => (error instanceof Error ? error.message : 'Failed'),
            }).then(onAnswer)
          }
        >
          Remove
        </button>
        {dialog}
      </>
    )
  }

  it('resolves true once confirmed and false when canceled', async () => {
    const onAnswer = vi.fn()
    render(<Asker onConfirm={() => Promise.resolve()} onAnswer={onAnswer} />)
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }))
    const dialog = await screen.findByRole('alertdialog', { name: 'Remove Ada?' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Remove' }))
    await waitFor(() => expect(onAnswer).toHaveBeenCalledWith(true))
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(onAnswer).toHaveBeenLastCalledWith(false))
  })

  it('keeps the dialog open with the error when the action fails', async () => {
    const onAnswer = vi.fn()
    const onConfirm = vi.fn().mockRejectedValueOnce(new Error('Ada owns a team.'))
    render(<Asker onConfirm={onConfirm} onAnswer={onAnswer} />)
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }))
    const dialog = await screen.findByRole('alertdialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Remove' }))
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Ada owns a team.')
    expect(onAnswer).not.toHaveBeenCalled()
  })
})

describe('useConfirm removes', () => {
  let setNames: (names: string[]) => void = () => {}

  // Each row holds a link and then the button that asks, so a match is by control, not the first.
  function Members({
    initial,
    onRemove = (drop) => drop(),
    finalFocus,
  }: {
    initial: string[]
    onRemove?: (drop: () => void) => unknown
    finalFocus?: () => HTMLElement | null
  }) {
    const [names, set] = useState(initial)
    setNames = set
    const { confirm, dialog } = useConfirm()
    return (
      <>
        <ul aria-label="Members">
          {names.map((name) => (
            <li key={name}>
              <a href={`#${name}`}>{name}</a>
              <button
                type="button"
                onClick={(event) =>
                  void confirm({
                    title: `Remove ${name}?`,
                    confirmLabel: 'Remove',
                    destructive: true,
                    removes: event.currentTarget.closest('li'),
                    onConfirm: async () => {
                      await onRemove(() => set((all) => all.filter((other) => other !== name)))
                    },
                    ...(finalFocus && { finalFocus }),
                  })
                }
              >
                {`Remove ${name}`}
              </button>
            </li>
          ))}
        </ul>
        <button type="button">Invite</button>
        {dialog}
      </>
    )
  }

  async function answer(name: string, button: 'Remove' | 'Cancel') {
    const opener = screen.getByRole('button', { name: `Remove ${name}` })
    opener.focus()
    fireEvent.click(opener)
    const dialog = await screen.findByRole('alertdialog', { name: `Remove ${name}?` })
    fireEvent.click(within(dialog).getByRole('button', { name: button }))
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
  }

  it('moves focus to the same control in the row that took the removed row’s place', async () => {
    render(<Members initial={['Ada', 'Grace', 'Lin']} />)
    await answer('Grace', 'Remove')
    await waitFor(() => expect(screen.getByRole('button', { name: 'Remove Lin' })).toHaveFocus())
  })

  it('moves focus to the row before when the removed row was last', async () => {
    render(<Members initial={['Ada', 'Grace', 'Lin']} />)
    await answer('Lin', 'Remove')
    await waitFor(() => expect(screen.getByRole('button', { name: 'Remove Grace' })).toHaveFocus())
  })

  it('moves focus to the list when the removed row was the only one', async () => {
    render(<Members initial={['Ada']} />)
    await answer('Ada', 'Remove')
    const list = screen.getByRole('list', { name: 'Members' })
    await waitFor(() => expect(list).toHaveFocus())
    screen.getByRole('button', { name: 'Invite' }).focus()
    expect(list).not.toHaveAttribute('tabindex')
  })

  it('returns focus to what opened it on Cancel, though the list changed while it was open', async () => {
    render(<Members initial={['Ada', 'Grace']} />)
    const opener = screen.getByRole('button', { name: 'Remove Grace' })
    opener.focus()
    fireEvent.click(opener)
    const dialog = await screen.findByRole('alertdialog', { name: 'Remove Grace?' })
    act(() => setNames(['Grace']))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
    await waitFor(() => expect(opener).toHaveFocus())
  })

  it('moves focus on after an async onConfirm that awaits the removal', async () => {
    render(
      <Members
        initial={['Ada', 'Grace']}
        onRemove={async (drop) => {
          await new Promise((resolve) => setTimeout(resolve, 20))
          drop()
          await new Promise((resolve) => setTimeout(resolve, 20))
        }}
      />,
    )
    await answer('Ada', 'Remove')
    await waitFor(() => expect(screen.getByRole('button', { name: 'Remove Grace' })).toHaveFocus())
  })

  it('moves focus on when the row goes only after the dialog has closed', async () => {
    render(<Members initial={['Ada', 'Grace']} onRemove={() => undefined} />)
    await answer('Ada', 'Remove')
    const opener = screen.getByRole('button', { name: 'Remove Ada' })
    await waitFor(() => expect(opener).toHaveFocus())
    act(() => setNames(['Grace']))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Remove Grace' })).toHaveFocus())
  })

  it('leaves focus where the reader moved it when the row goes later', async () => {
    render(<Members initial={['Ada', 'Grace']} onRemove={() => undefined} />)
    await answer('Ada', 'Remove')
    await waitFor(() => expect(screen.getByRole('button', { name: 'Remove Ada' })).toHaveFocus())
    const invite = screen.getByRole('button', { name: 'Invite' })
    invite.focus()
    act(() => setNames(['Grace']))
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(invite).toHaveFocus()
  })

  it('leaves focus on the page when the reader clicked away before the row goes', async () => {
    render(<Members initial={['Ada', 'Grace']} onRemove={() => undefined} />)
    await answer('Ada', 'Remove')
    const opener = screen.getByRole('button', { name: 'Remove Ada' })
    await waitFor(() => expect(opener).toHaveFocus())
    act(() => opener.blur())
    await new Promise((resolve) => setTimeout(resolve, 0))
    act(() => setNames(['Grace']))
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(document.body).toHaveFocus()
  })

  it('lets an explicit finalFocus decide over removes', async () => {
    render(
      <Members
        initial={['Ada', 'Grace']}
        finalFocus={() => screen.getByRole('button', { name: 'Invite' })}
      />,
    )
    await answer('Ada', 'Remove')
    await waitFor(() => expect(screen.getByRole('button', { name: 'Invite' })).toHaveFocus())
  })
})

describe('useClosingValue', () => {
  it('keeps the last value through the close', () => {
    function Shown({ value }: { value: string | null }) {
      return <p>{useClosingValue(value) ?? 'nothing'}</p>
    }
    const { rerender } = render(<Shown value={null} />)
    expect(screen.getByText('nothing')).toBeInTheDocument()
    rerender(<Shown value="core" />)
    expect(screen.getByText('core')).toBeInTheDocument()
    rerender(<Shown value={null} />)
    expect(screen.getByText('core')).toBeInTheDocument()
    rerender(<Shown value="web" />)
    expect(screen.getByText('web')).toBeInTheDocument()
  })
})
