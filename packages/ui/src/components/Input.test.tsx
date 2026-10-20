// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { Input, Textarea, TitleInput } from './Input'

describe('Input', () => {
  it('draws the small box at size sm, and lets a host class win over its own', () => {
    render(<Input aria-label="Filter" size="sm" className="w-40" />)

    const input = screen.getByRole('textbox', { name: 'Filter' })
    expect(input).toHaveClass('h-7', 'text-xs', 'w-40')
    expect(input).not.toHaveClass('w-full')
    expect(input).not.toHaveAttribute('size')
  })

  it('associates the label with the input when no id is given', () => {
    render(<Input label="Email" />)

    expect(screen.getByLabelText('Email')).toBeInstanceOf(HTMLInputElement)
  })

  it('keeps a caller-provided id', () => {
    render(<Input label="Email" id="email-field" />)

    expect(screen.getByLabelText('Email')).toHaveAttribute('id', 'email-field')
  })

  it('links the error message to the input', () => {
    render(<Input label="Email" error="Enter a valid email" />)

    const input = screen.getByLabelText('Email')
    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent('Enter a valid email')
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(input).toHaveAttribute('aria-describedby', alert.id)
  })

  it('does not mark a valid input as invalid', () => {
    render(<Input label="Email" />)

    const input = screen.getByLabelText('Email')
    expect(input).not.toHaveAttribute('aria-invalid')
    expect(input).not.toHaveAttribute('aria-describedby')
  })

  it('marks a required input and hides its asterisk from assistive tech', () => {
    render(<Input label="Email" required />)

    const input = screen.getByRole('textbox', { name: 'Email' })
    expect(input).toBeRequired()
    expect(screen.getByText('*')).toHaveAttribute('aria-hidden', 'true')
  })

  it('does not render an asterisk for an optional input', () => {
    render(<Input label="Email" />)

    expect(screen.getByLabelText('Email')).not.toBeRequired()
    expect(screen.queryByText('*')).not.toBeInTheDocument()
  })

  it('describes the input with its description, and keeps a hint beside the label out of its name', () => {
    render(<Input label="Email" description="Where receipts go." hint={<code>email</code>} />)

    const input = screen.getByRole('textbox', { name: 'Email' })
    expect(input).toHaveAccessibleDescription('Where receipts go.')
    expect(screen.getByText('email')).toBeInTheDocument()
  })

  it('describes a text area with its description', () => {
    render(<Textarea label="Notes" description="Shown on the run." />)

    expect(screen.getByRole('textbox', { name: 'Notes' })).toHaveAccessibleDescription(
      'Shown on the run.',
    )
  })

  it('keeps an existing aria-describedby alongside the error', () => {
    render(
      <>
        <p id="hint">We never share it.</p>
        <Input label="Email" aria-describedby="hint" error="Required" />
      </>,
    )

    const input = screen.getByLabelText('Email')
    const alert = screen.getByRole('alert')
    expect(input).toHaveAttribute('aria-describedby', `hint ${alert.id}`)
  })
})

describe('Textarea', () => {
  it('associates the label with the textarea when no id is given', () => {
    render(<Textarea label="Notes" />)

    expect(screen.getByLabelText('Notes')).toBeInstanceOf(HTMLTextAreaElement)
  })

  it('links the error message to the textarea', () => {
    render(<Textarea label="Notes" error="Too long" />)

    const textarea = screen.getByLabelText('Notes')
    const alert = screen.getByRole('alert')
    expect(textarea).toHaveAttribute('aria-invalid', 'true')
    expect(textarea).toHaveAttribute('aria-describedby', alert.id)
  })

  it('marks a required textarea and hides its asterisk from assistive tech', () => {
    render(<Textarea label="Notes" required />)

    expect(screen.getByRole('textbox', { name: 'Notes' })).toBeRequired()
    expect(screen.getByText('*')).toHaveAttribute('aria-hidden', 'true')
  })
})

describe('Textarea options', () => {
  it('grows with its text from rows up to maxRows with autosize', () => {
    render(<Textarea aria-label="Comment" rows={1} autosize={{ maxRows: 6 }} />)
    const box = screen.getByRole('textbox', { name: 'Comment' })
    expect(box).toHaveClass('resize-none', '[field-sizing:content]')
    expect(box.style.minHeight).toMatch(/^calc\(1lh \+ /)
    expect(box.style.maxHeight).toMatch(/^calc\(6lh \+ /)
  })

  it('draws no box of its own when bare', () => {
    render(<Textarea aria-label="Comment" bare />)
    const box = screen.getByRole('textbox', { name: 'Comment' })
    expect(box).toHaveClass('border-0', 'bg-transparent', 'p-0')
    expect(box).not.toHaveClass('rounded-md')
  })

  it('hides a secret until shown, in monospace, unchecked and left alone by autofill', () => {
    render(<Textarea aria-label="Private key" secret />)
    const box = screen.getByRole('textbox', { name: 'Private key' })
    expect(box).toHaveClass('font-mono', '[-webkit-text-security:disc]')
    expect(box).toHaveAttribute('spellcheck', 'false')
    expect(box).toHaveAttribute('autocomplete', 'off')
    fireEvent.click(screen.getByRole('button', { name: 'Show value' }))
    expect(box).not.toHaveClass('[-webkit-text-security:disc]')
    expect(screen.getByRole('button', { name: 'Hide value' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })
})

describe('TitleInput', () => {
  function Title({ onCommit = vi.fn() }: { onCommit?: (value: string) => void }) {
    const [value, setValue] = useState('Fix login')
    return (
      <TitleInput
        aria-label="Title"
        value={value}
        onCommit={(next) => {
          setValue(next)
          onCommit(next)
        }}
      />
    )
  }

  it('saves the trimmed title on Enter, joining pasted lines', () => {
    const onCommit = vi.fn()
    render(<Title onCommit={onCommit} />)
    const box = screen.getByRole('textbox', { name: 'Title' })
    box.focus()
    fireEvent.change(box, { target: { value: ' Fix\nlogin on Safari ' } })
    expect(box).toHaveValue(' Fix login on Safari ')
    fireEvent.keyDown(box, { key: 'Enter' })
    expect(onCommit).toHaveBeenCalledWith('Fix login on Safari')
    expect(box).not.toHaveFocus()
  })

  it('puts the saved title back on Escape, saving nothing', () => {
    const onCommit = vi.fn()
    render(<Title onCommit={onCommit} />)
    const box = screen.getByRole('textbox', { name: 'Title' })
    box.focus()
    fireEvent.change(box, { target: { value: 'Something else' } })
    fireEvent.keyDown(box, { key: 'Escape' })
    expect(box).toHaveValue('Fix login')
    expect(onCommit).not.toHaveBeenCalled()
  })

  it('saves nothing for an empty title, and saves on leaving the field', () => {
    const onCommit = vi.fn()
    render(<Title onCommit={onCommit} />)
    const box = screen.getByRole('textbox', { name: 'Title' })
    box.focus()
    fireEvent.change(box, { target: { value: '   ' } })
    fireEvent.blur(box)
    expect(box).toHaveValue('Fix login')
    expect(onCommit).not.toHaveBeenCalled()
    box.focus()
    fireEvent.change(box, { target: { value: 'Renamed' } })
    fireEvent.blur(box)
    expect(onCommit).toHaveBeenCalledWith('Renamed')
  })

  it('takes a title changed elsewhere unless it is being edited', () => {
    const { rerender } = render(<TitleInput aria-label="Title" value="One" onCommit={vi.fn()} />)
    const box = screen.getByRole('textbox', { name: 'Title' })
    rerender(<TitleInput aria-label="Title" value="Two" onCommit={vi.fn()} />)
    expect(box).toHaveValue('Two')
    box.focus()
    fireEvent.focus(box)
    fireEvent.change(box, { target: { value: 'Mine' } })
    rerender(<TitleInput aria-label="Title" value="Three" onCommit={vi.fn()} />)
    expect(box).toHaveValue('Mine')
  })
})
