// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { useState } from 'react'
import { DatePicker, type DatePickerProps } from './DatePicker'

function Controlled({
  initial = '',
  onValueChange,
  ...props
}: Omit<DatePickerProps, 'value' | 'onValueChange'> & {
  initial?: string
  onValueChange?: (value: string) => void
}) {
  const [value, setValue] = useState(initial)
  return (
    <DatePicker
      aria-label="Starts"
      {...props}
      value={value}
      onValueChange={(next) => {
        setValue(next)
        onValueChange?.(next)
      }}
    />
  )
}

const openCalendar = async () => {
  fireEvent.click(screen.getByRole('button', { name: 'Starts' }))
  return screen.findByRole('grid')
}

const longDay = (date: Date) =>
  new Intl.DateTimeFormat(undefined, { dateStyle: 'full' }).format(date)

describe('DatePicker', () => {
  it('shows the chosen day, or its prompt without one', () => {
    const { unmount } = render(<Controlled />)
    expect(screen.getByRole('button', { name: 'Starts' })).toHaveTextContent('Pick a date')
    unmount()
    render(<Controlled initial="2026-03-14" />)
    expect(screen.getByRole('button', { name: 'Starts' })).toHaveTextContent(
      new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(2026, 2, 14)),
    )
  })

  it('picks a day from the calendar as yyyy-MM-dd, and closes', async () => {
    const onValueChange = vi.fn()
    render(<Controlled initial="2026-03-14" onValueChange={onValueChange} />)
    const grid = await openCalendar()
    fireEvent.click(within(grid).getByRole('button', { name: longDay(new Date(2026, 2, 20)) }))
    expect(onValueChange).toHaveBeenLastCalledWith('2026-03-20')
    await waitFor(() => expect(screen.queryByRole('grid')).not.toBeInTheDocument())
  })

  it('keeps the time when the day changes, as datetime-local does', async () => {
    const onValueChange = vi.fn()
    render(<Controlled withTime initial="2026-03-14T09:30" onValueChange={onValueChange} />)
    expect(screen.getByLabelText('Time')).toHaveValue('09:30')
    const grid = await openCalendar()
    fireEvent.click(within(grid).getByRole('button', { name: longDay(new Date(2026, 2, 2)) }))
    expect(onValueChange).toHaveBeenLastCalledWith('2026-03-02T09:30')
    fireEvent.change(screen.getByLabelText('Time'), { target: { value: '17:45' } })
    expect(onValueChange).toHaveBeenLastCalledWith('2026-03-02T17:45')
  })

  it('offers no day outside min and max, and bounds the time on their days', async () => {
    render(
      <Controlled
        withTime
        initial="2026-03-14T12:00"
        min="2026-03-14T08:00"
        max="2026-03-20T18:00"
      />,
    )
    expect(screen.getByLabelText('Time')).toHaveAttribute('min', '08:00')
    expect(screen.getByLabelText('Time')).not.toHaveAttribute('max')
    const grid = await openCalendar()
    expect(
      within(grid).getByRole('button', { name: longDay(new Date(2026, 2, 13)) }),
    ).toBeDisabled()
    expect(
      within(grid).getByRole('button', { name: longDay(new Date(2026, 2, 21)) }),
    ).toBeDisabled()
    expect(
      within(grid).getByRole('button', { name: longDay(new Date(2026, 2, 16)) }),
    ).not.toBeDisabled()
  })

  it('clears unless required', async () => {
    const onValueChange = vi.fn()
    const { unmount } = render(<Controlled initial="2026-03-14" onValueChange={onValueChange} />)
    await openCalendar()
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }))
    expect(onValueChange).toHaveBeenLastCalledWith('')
    unmount()
    render(<Controlled initial="2026-03-14" required />)
    await openCalendar()
    expect(screen.queryByRole('button', { name: 'Clear' })).not.toBeInTheDocument()
  })
})
