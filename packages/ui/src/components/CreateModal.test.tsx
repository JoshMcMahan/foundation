// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { Autocomplete } from './Combobox'
import { CreateModal } from './CreateModal'
import { Field } from './Field'
import { InfoTip } from './InfoTip'
import { Input, Textarea } from './Input'

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

describe('CreateModal fields', () => {
  it('names a field with help by its label, not by the help button beside it', () => {
    render(
      <CreateModal
        open
        onClose={vi.fn()}
        typeLabel="Workflow"
        namePlaceholder="Enter a new name"
        onSubmit={vi.fn()}
      >
        <Input label="Region" hint={<InfoTip text="Where the workflow runs." />} />
        <Field
          label="Account"
          hint={<InfoTip text="Who pays for it." />}
          description="Billed monthly."
        >
          {(control) => <Autocomplete {...control} items={['research', 'teaching']} />}
        </Field>
      </CreateModal>,
    )
    expect(screen.getByRole('textbox', { name: 'Region' })).toBeInTheDocument()
    const account = screen.getByRole('combobox', { name: 'Account' })
    expect(account).toHaveAccessibleDescription('Billed monthly.')
    // Help sits beside each label, a button of its own.
    expect(screen.getAllByRole('button', { name: 'More information' })).toHaveLength(2)
  })
})

describe('CreateModal name', () => {
  it('says a wrong name is invalid, and why', async () => {
    render(
      <CreateModal
        open
        onClose={vi.fn()}
        typeLabel="Widget"
        namePlaceholder="widget-name"
        validateName={(name) => (name.includes(' ') ? 'No spaces allowed' : null)}
        onSubmit={vi.fn()}
      />,
    )
    const name = await screen.findByRole('textbox', { name: 'widget-name' })
    expect(name).toBeRequired()
    expect(name).not.toBeInvalid()
    fireEvent.change(name, { target: { value: 'my widget' } })
    expect(name).toBeInvalid()
    expect(name).toHaveAccessibleDescription('No spaces allowed')
  })

  function Blank({ outside = false }: { outside?: boolean }) {
    return (
      <>
        {outside && <button type="button">Outside</button>}
        <CreateModal
          open
          onClose={vi.fn()}
          typeLabel="Issue"
          typeMenu={[{ label: 'Bug', onClick: vi.fn() }]}
          namePlaceholder="Issue title"
          onSubmit={vi.fn()}
        >
          <Input label="Estimate" />
        </CreateModal>
      </>
    )
  }
  const settle = () => new Promise((resolve) => setTimeout(resolve, 10))

  it("leaves an empty name unmarked while focus moves to the dialog's own controls", async () => {
    render(<Blank />)
    const name = await screen.findByRole('textbox', { name: 'Issue title' })
    await waitFor(() => expect(name).toHaveFocus())
    // Into the type menu, which opens apart from the dialog's own element.
    const trigger = screen.getByRole('button', { name: /Issue/ })
    trigger.focus()
    fireEvent.click(trigger)
    const item = await screen.findByRole('menuitem', { name: 'Bug' })
    fireEvent.focus(item)
    await settle()
    expect(name).not.toBeInvalid()
    // And to a field below.
    name.focus()
    screen.getByRole('textbox', { name: 'Estimate' }).focus()
    await settle()
    expect(name).not.toBeInvalid()
  })

  it('closes a searched type menu on the first Escape and the dialog on the second', async () => {
    const onClose = vi.fn()
    render(
      <CreateModal
        open
        onClose={onClose}
        typeLabel="Web"
        typeMenu={[
          { label: 'Web', onClick: vi.fn() },
          { label: 'Platform', onClick: vi.fn() },
        ]}
        typeMenuSearch={{ placeholder: 'Search teams', empty: 'No team matches' }}
        namePlaceholder="Issue title"
        onSubmit={vi.fn()}
      />,
    )
    const name = await screen.findByRole('textbox', { name: 'Issue title' })
    const trigger = screen.getByRole('button', { name: /^Web/ })
    fireEvent.click(trigger)
    const search = await screen.findByRole('searchbox', { name: 'Search teams' })
    await waitFor(() => expect(search).toHaveFocus())
    fireEvent.keyDown(search, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull())
    await waitFor(() => expect(trigger).toHaveFocus())
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    await settle()
    expect(name).not.toBeInvalid()
    fireEvent.keyDown(trigger, { key: 'Escape' })
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
  })

  it('marks an empty name once a submit is tried', async () => {
    render(<Blank />)
    const name = await screen.findByRole('textbox', { name: 'Issue title' })
    expect(name).not.toBeInvalid()
    fireEvent.click(screen.getByRole('button', { name: 'Create' }))
    expect(name).toBeInvalid()
  })

  it('marks an empty name once focus leaves the dialog', async () => {
    render(<Blank outside />)
    const name = await screen.findByRole('textbox', { name: 'Issue title' })
    // Once the dialog has put focus there itself, so its opening doesn't refocus it later.
    await waitFor(() => expect(name).toHaveFocus())
    // Focus that lands on nothing in the dialog, as on the page behind it.
    name.blur()
    await waitFor(() => expect(name).toBeInvalid())
  })

  it('starts each opening with a fresh name', async () => {
    const props = {
      onClose: vi.fn(),
      typeLabel: 'Widget',
      namePlaceholder: 'widget-name',
      onSubmit: vi.fn(),
    }
    const { rerender } = render(<CreateModal open {...props} />)
    fireEvent.change(await screen.findByRole('textbox', { name: 'widget-name' }), {
      target: { value: 'first' },
    })
    rerender(<CreateModal open={false} {...props} />)
    rerender(<CreateModal open {...props} />)
    expect(await screen.findByRole('textbox', { name: 'widget-name' })).toHaveValue('')
  })
})

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
  function renderModal(props: { hideName?: boolean } = {}) {
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
        {...props}
      >
        <Textarea label="Public key" value="" onChange={vi.fn()} placeholder="" />
      </CreateModal>,
    )
  }

  it('focuses the name input when it opens', async () => {
    renderModal()
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Key name' })).toHaveFocus())
  })

  it('starts at its first field when it asks for no name', async () => {
    renderModal({ hideName: true })
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Public key' })).toHaveFocus())
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

  it('lets a press focus editable content, such as a rich text description', () => {
    render(
      <CreateModal
        open
        onClose={vi.fn()}
        typeLabel="Issue"
        namePlaceholder="Issue title"
        descriptionField={
          <div contentEditable suppressContentEditableWarning data-testid="editor">
            <p data-testid="paragraph">Steps</p>
          </div>
        }
        onSubmit={vi.fn().mockResolvedValue(true)}
      />,
    )
    expect(fireEvent.mouseDown(screen.getByTestId('editor'))).toBe(true)
    expect(fireEvent.mouseDown(screen.getByTestId('paragraph'))).toBe(true)
  })

  it('keeps the caret in the name field for non-interactive areas', () => {
    renderWithRedirectUri()
    expect(fireEvent.mouseDown(screen.getByTestId('hint'))).toBe(false)
  })
})

describe('CreateModal fields with help', () => {
  it.each([
    ['an input', Input],
    ['a textarea', Textarea],
  ])('name %s by its label, not the help button beside it', (_, Control) => {
    render(<Control label="Account ID" hint={<InfoTip text="The twelve digit ID" />} />)
    expect(screen.getByRole('textbox', { name: 'Account ID' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'More information' })).toBeInTheDocument()
  })
})

describe('CreateModal name', () => {
  it('wraps a long name as one value: a pasted line break joins the lines, Enter submits', async () => {
    const onSubmit = vi.fn(() => Promise.resolve(true))
    render(
      <CreateModal
        open
        onClose={vi.fn()}
        typeLabel="Issue"
        namePlaceholder="Issue title"
        onSubmit={onSubmit}
      />,
    )
    const name = await screen.findByRole('textbox', { name: 'Issue title' })
    // A textarea, so a long name wraps onto more lines instead of scrolling out of view.
    expect(name.tagName).toBe('TEXTAREA')
    expect(name).toHaveAttribute('rows', '1')
    fireEvent.change(name, {
      target: { value: 'Export fails\nfor invoices  \n over 10,000 lines' },
    })
    expect(name).toHaveValue('Export fails for invoices over 10,000 lines')
    const enter = fireEvent.keyDown(name, { key: 'Enter', shiftKey: true })
    // No line is added: Enter, with Shift too, submits.
    expect(enter).toBe(false)
    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith(
        'Export fails for invoices over 10,000 lines',
        '',
        false,
        {
          modifier: false,
        },
      ),
    )
  })
})

describe('CreateModal submit details', () => {
  it('tells the host when ⌘/Ctrl+Enter submitted it', async () => {
    const onSubmit = vi.fn(() => Promise.resolve(true))
    render(
      <CreateModal
        open
        onClose={vi.fn()}
        typeLabel="Issue"
        namePlaceholder="Issue title"
        onSubmit={onSubmit}
      />,
    )
    const name = await screen.findByPlaceholderText('Issue title')
    fireEvent.change(name, { target: { value: 'Fix login' } })
    fireEvent.keyDown(name, { key: 'Enter', metaKey: true })
    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith('Fix login', '', false, { modifier: true }),
    )
  })

  it('shows a hint at the footer’s start, and an error in its place', async () => {
    const { rerender } = render(
      <CreateModal
        open
        onClose={vi.fn()}
        typeLabel="Issue"
        namePlaceholder="Issue title"
        footerHint="⌘Enter to create and open"
        onSubmit={vi.fn()}
      />,
    )
    expect(await screen.findByText('⌘Enter to create and open')).toBeInTheDocument()
    rerender(
      <CreateModal
        open
        onClose={vi.fn()}
        typeLabel="Issue"
        namePlaceholder="Issue title"
        footerHint="⌘Enter to create and open"
        error="The team is archived."
        onSubmit={vi.fn()}
      />,
    )
    expect(screen.getByRole('alert')).toHaveTextContent('The team is archived.')
    expect(screen.queryByText('⌘Enter to create and open')).toBeNull()
  })

  it('takes a description field of the host’s own', async () => {
    render(
      <CreateModal
        open
        onClose={vi.fn()}
        typeLabel="Issue"
        namePlaceholder="Issue title"
        descriptionField={<textarea aria-label="Description editor" />}
        onSubmit={vi.fn()}
      />,
    )
    expect(await screen.findByRole('textbox', { name: 'Description editor' })).toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: 'Add description…' })).toBeNull()
  })

  it('counts typing in a rich editor as unsaved, so Escape keeps the form', async () => {
    const onClose = vi.fn()
    render(
      <CreateModal
        open
        onClose={onClose}
        typeLabel="Issue"
        namePlaceholder="Issue title"
        descriptionField={
          // biome-ignore lint/a11y/useSemanticElements: stands in for a rich text editor
          <div role="textbox" aria-label="Description editor" contentEditable tabIndex={0} />
        }
        onSubmit={vi.fn()}
      />,
    )
    const editor = await screen.findByRole('textbox', { name: 'Description editor' })
    // jsdom doesn't compute isContentEditable.
    Object.defineProperty(editor, 'isContentEditable', { value: true })
    fireEvent.input(editor)
    fireEvent.keyDown(editor, { key: 'Escape' })
    expect(onClose).not.toHaveBeenCalled()
  })
})
