// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { CreateModal, CreateModalTextarea } from './CreateModal'

function renderModal(onSubmit: (name: string) => Promise<boolean>) {
  return render(
    <CreateModal
      open
      onClose={vi.fn()}
      typeLabel="Workflow"
      namePlaceholder="Enter a new name"
      initialName="my-workflow copy"
      showDescription={false}
      submitLabel="Duplicate"
      submittingLabel="Duplicating"
      onSubmit={onSubmit}
    />,
  )
}

describe('CreateModal submit state', () => {
  it('recovers the submit button when onSubmit rejects', async () => {
    const onSubmit = vi.fn().mockRejectedValue(new Error('boom'))
    renderModal(onSubmit)

    fireEvent.click(screen.getByRole('button', { name: 'Duplicate' }))

    await waitFor(() => expect(onSubmit).toHaveBeenCalled())
    await waitFor(() => expect(screen.getByRole('button', { name: 'Duplicate' })).toBeEnabled())
    expect(screen.queryByText('Duplicating')).not.toBeInTheDocument()
  })

  it('keeps the modal open and re-enables submit when onSubmit resolves false', async () => {
    const onSubmit = vi.fn().mockResolvedValue(false)
    const onClose = vi.fn()
    render(
      <CreateModal
        open
        onClose={onClose}
        typeLabel="Workflow"
        namePlaceholder="Enter a new name"
        initialName="my-workflow copy"
        showDescription={false}
        submitLabel="Duplicate"
        submittingLabel="Duplicating"
        onSubmit={onSubmit}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Duplicate' }))

    await waitFor(() => expect(screen.getByRole('button', { name: 'Duplicate' })).toBeEnabled())
    expect(onClose).not.toHaveBeenCalled()
  })
})

describe('CreateModal initial focus', () => {
  function renderWithTextarea() {
    const frames: FrameRequestCallback[] = []
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      frames.push(cb)
      return frames.length
    })
    render(
      <CreateModal
        open
        onClose={vi.fn()}
        typeLabel="SSH key"
        namePlaceholder="Key name"
        showDescription={false}
        submitLabel="Create"
        submittingLabel="Creating"
        onSubmit={vi.fn().mockResolvedValue(true)}
      >
        <CreateModalTextarea label="Public key" value="" onChange={vi.fn()} placeholder="" />
      </CreateModal>,
    )
    return () => {
      for (const frame of frames.splice(0)) {
        frame(0)
      }
    }
  }

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('focuses the name input once the content has mounted', () => {
    const runFrames = renderWithTextarea()
    runFrames()
    expect(screen.getByRole('textbox', { name: 'Key name' })).toHaveFocus()
  })

  it('leaves focus on a field the user already moved into', () => {
    const runFrames = renderWithTextarea()
    const textarea = screen.getByRole('textbox', { name: 'Public key' })
    textarea.focus()
    runFrames()
    expect(textarea).toHaveFocus()
  })
})

describe('CreateModal panel mousedown', () => {
  function renderWithRedirectUri() {
    render(
      <CreateModal
        open
        onClose={vi.fn()}
        typeLabel="GitLab server"
        namePlaceholder="Enter a name"
        showDescription={false}
        onSubmit={vi.fn().mockResolvedValue(true)}
      >
        <p data-testid="hint">
          Set the redirect URI to{' '}
          <code data-testid="redirect-uri" className="select-all break-all">
            https://example.com/auth/gitlab/callback
          </code>
        </p>
      </CreateModal>,
    )
  }

  it('lets a selection start on selectable text', () => {
    renderWithRedirectUri()
    expect(fireEvent.mouseDown(screen.getByTestId('redirect-uri'))).toBe(true)
  })

  it('keeps the caret in the name field for non-interactive areas', () => {
    renderWithRedirectUri()
    expect(fireEvent.mouseDown(screen.getByTestId('hint'))).toBe(false)
  })
})
