// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { ColorInput } from './ColorInput'
import { Field } from './Field'

function Controlled({ label, onValue }: { label?: string; onValue?: (color: string) => void }) {
  const [color, setColor] = useState('#1f6feb')
  return (
    <ColorInput
      label={label}
      aria-label={label ? undefined : 'Brand'}
      value={color}
      onValueChange={(next) => {
        setColor(next)
        onValue?.(next)
      }}
    />
  )
}

describe('ColorInput', () => {
  it('names the hex field by its label and the swatch after it', () => {
    render(<Controlled label="Accent" />)
    expect(screen.getByRole('textbox', { name: 'Accent' })).toHaveValue('#1f6feb')
    expect(screen.getByLabelText('Pick accent')).toHaveValue('#1f6feb')
  })

  it('takes a typed color once it parses, and a picked one as a hex', () => {
    const onValue = vi.fn()
    render(<Controlled label="Accent" onValue={onValue} />)
    const box = screen.getByRole('textbox', { name: 'Accent' })
    fireEvent.change(box, { target: { value: '#ABC' } })
    expect(onValue).toHaveBeenLastCalledWith('#abc')
    fireEvent.change(screen.getByLabelText('Pick accent'), { target: { value: '#00ff00' } })
    expect(onValue).toHaveBeenLastCalledWith('#00ff00')
    expect(box).toHaveValue('#00ff00')
  })

  it('keeps a half-typed color, marked, until it parses or the field is left', () => {
    const onValue = vi.fn()
    render(<Controlled label="Accent" onValue={onValue} />)
    const box = screen.getByRole('textbox', { name: 'Accent' })
    fireEvent.change(box, { target: { value: '#12' } })
    expect(onValue).not.toHaveBeenCalled()
    expect(box).toHaveValue('#12')
    expect(box).toHaveAttribute('aria-invalid', 'true')
    expect(box).toHaveAccessibleDescription('Enter a hex color, such as #1f6feb.')
    fireEvent.blur(box)
    expect(box).toHaveValue('#1f6feb')
    expect(box).not.toHaveAttribute('aria-invalid')
  })

  it('alone, says why under the row and ties it to the hex field', () => {
    render(<Controlled />)
    const box = screen.getByRole('textbox', { name: 'Brand' })
    expect(screen.getByLabelText('Pick brand')).toBeInTheDocument()
    fireEvent.change(box, { target: { value: 'nope' } })
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a hex color')
    expect(box).toHaveAccessibleDescription('Enter a hex color, such as #1f6feb.')
  })

  it('takes a surrounding Field’s label, help and error', () => {
    render(
      <Field label="Highlight" description="Used for badges." error="Too pale">
        {(control) => <ColorInput {...control} value="#ffffff" onValueChange={() => {}} />}
      </Field>,
    )
    const box = screen.getByRole('textbox', { name: 'Highlight' })
    expect(box).toHaveAttribute('aria-invalid', 'true')
    expect(box).toHaveAccessibleDescription('Used for badges. Too pale')
    expect(screen.getByLabelText('Pick a color')).toBeInTheDocument()
  })
})
