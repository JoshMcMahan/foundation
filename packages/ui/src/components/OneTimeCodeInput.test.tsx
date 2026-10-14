// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { Field } from './Field'
import { OneTimeCodeInput } from './OneTimeCodeInput'

describe('OneTimeCodeInput', () => {
  it('names its first box by the field’s label and each other box by its place', () => {
    render(
      <Field label="Verification code" description="From your authenticator app.">
        {(control) => <OneTimeCodeInput {...control} />}
      </Field>,
    )
    const boxes = screen.getAllByRole('textbox')
    expect(boxes).toHaveLength(6)
    expect(boxes[0]).toHaveAccessibleName('Verification code')
    expect(boxes[0]).toHaveAttribute('autocomplete', 'one-time-code')
    expect(boxes[0]).toHaveAttribute('inputmode', 'numeric')
    expect(boxes[1]).toHaveAccessibleName('Character 2 of 6')
    expect(boxes[5]).toHaveAccessibleName('Character 6 of 6')
    expect(screen.getByRole('group')).toHaveAccessibleDescription('From your authenticator app.')
  })

  it('takes a pasted code across its boxes and reports it complete', () => {
    const onValueChange = vi.fn()
    const onValueComplete = vi.fn()
    render(
      <OneTimeCodeInput
        aria-label="Code"
        length={4}
        onValueChange={onValueChange}
        onValueComplete={onValueComplete}
      />,
    )
    const [first] = screen.getAllByRole('textbox')
    expect(first).toHaveAccessibleName('Code')
    fireEvent.paste(first as HTMLElement, {
      clipboardData: { getData: () => '12 34' },
    })
    expect(onValueChange).toHaveBeenLastCalledWith('1234', expect.anything())
    expect(onValueComplete).toHaveBeenCalledWith('1234', expect.anything())
  })

  it('marks every box invalid in an invalid Field', () => {
    render(
      <Field label="Code" error="That code has expired.">
        {(control) => <OneTimeCodeInput {...control} defaultValue="123456" />}
      </Field>,
    )
    for (const box of screen.getAllByRole('textbox')) {
      expect(box).toHaveAttribute('aria-invalid', 'true')
    }
  })
})
