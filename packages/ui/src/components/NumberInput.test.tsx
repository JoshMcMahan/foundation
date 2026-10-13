// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { NumberInput, type NumberInputProps } from './NumberInput'

function Controlled({
  initial = null,
  onValueChange,
  ...props
}: Omit<NumberInputProps, 'value'> & { initial?: number | null }) {
  const [value, setValue] = useState<number | null>(initial)
  return (
    <NumberInput
      aria-label="Total"
      {...props}
      value={value}
      onValueChange={(next, details) => {
        setValue(next)
        onValueChange?.(next, details)
      }}
    />
  )
}

describe('NumberInput', () => {
  it('reports a typed number, and null once cleared', () => {
    const onValueChange = vi.fn()
    render(<Controlled onValueChange={onValueChange} />)
    const input = screen.getByRole('textbox', { name: 'Total' })
    fireEvent.change(input, { target: { value: '42' } })
    expect(onValueChange).toHaveBeenLastCalledWith(42, expect.anything())
    fireEvent.change(input, { target: { value: '' } })
    expect(onValueChange).toHaveBeenLastCalledWith(null, expect.anything())
  })

  it('formats as Intl does, keeping every digit unless the format limits them', () => {
    render(<Controlled initial={1234567.891} format={{ useGrouping: true }} />)
    expect(screen.getByRole('textbox', { name: 'Total' })).toHaveValue('1,234,567.891')
  })

  it('shows a currency', () => {
    render(<Controlled initial={1500} format={{ style: 'currency', currency: 'USD' }} />)
    expect(screen.getByRole('textbox', { name: 'Total' })).toHaveValue('$1500.00')
  })

  it('steps within its range with the buttons', () => {
    const onValueChange = vi.fn()
    render(<Controlled initial={9} max={10} step={2} onValueChange={onValueChange} />)
    fireEvent.click(screen.getByRole('button', { name: /increase/i }))
    expect(onValueChange).toHaveBeenLastCalledWith(10, expect.anything())
  })

  it('leaves the steppers out on request', () => {
    render(<Controlled steppers={false} />)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('marks the input invalid and required for assistive technology', () => {
    render(<Controlled aria-invalid aria-required />)
    const input = screen.getByRole('textbox', { name: 'Total' })
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(input).toHaveAttribute('aria-required', 'true')
    expect(input).not.toHaveAttribute('required')
  })
})
