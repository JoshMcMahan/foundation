// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import { Input, Textarea } from './Input'

describe('Input', () => {
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
    render(<Input label="Email" description="Where receipts go." labelHint={<code>email</code>} />)

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
