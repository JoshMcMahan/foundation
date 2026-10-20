// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { useState } from 'react'
import { Calendar, DatePicker, type DatePickerProps } from './DatePicker'
import { UIProvider } from './Provider'

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
    render(<Controlled initial="2001-03-14" />)
    expect(screen.getByRole('button', { name: 'Starts' })).toHaveTextContent(
      new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(2001, 2, 14)),
    )
  })

  it('leaves out the year of a day this year', () => {
    const year = new Date().getFullYear()
    render(<Controlled initial={`${year}-03-14`} />)
    expect(screen.getByRole('button', { name: 'Starts' })).toHaveTextContent(
      new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(
        new Date(year, 2, 14),
      ),
    )
    expect(screen.getByRole('button', { name: 'Starts' })).not.toHaveTextContent(String(year))
  })

  it('opens from a button of the host, which says the date its own way', async () => {
    const onValueChange = vi.fn()
    render(
      <Controlled
        initial="2026-03-14"
        onValueChange={onValueChange}
        trigger={<button type="button">Due soon</button>}
      />,
    )
    expect(screen.getByRole('button', { name: 'Starts' })).toHaveTextContent('Due soon')
    const grid = await openCalendar()
    fireEvent.click(within(grid).getByRole('button', { name: longDay(new Date(2026, 2, 20)) }))
    expect(onValueChange).toHaveBeenLastCalledWith('2026-03-20')
  })

  it('takes a typed date, moving the calendar to it, and Enter picks it', async () => {
    const onValueChange = vi.fn()
    render(<Controlled initial="2026-03-14" onValueChange={onValueChange} />)
    await openCalendar()
    const box = screen.getByRole('textbox', { name: 'Type a date' })
    expect(box).toHaveFocus()
    fireEvent.change(box, { target: { value: '2027-01-05' } })
    expect(
      await screen.findByRole('grid', {
        name: new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' }).format(
          new Date(2027, 0, 5),
        ),
      }),
    ).toBeInTheDocument()
    fireEvent.keyDown(box, { key: 'Enter' })
    expect(onValueChange).toHaveBeenLastCalledWith('2027-01-05')
  })

  it('says when the typed text is no day it can take', async () => {
    const onValueChange = vi.fn()
    render(<Controlled initial="2026-03-14" max="2026-12-31" onValueChange={onValueChange} />)
    await openCalendar()
    const box = screen.getByRole('textbox', { name: 'Type a date' })
    fireEvent.change(box, { target: { value: '2027-01-05' } })
    expect(box).toHaveAccessibleDescription('Not a date that can be chosen')
    fireEvent.keyDown(box, { key: 'Enter' })
    expect(onValueChange).not.toHaveBeenCalled()
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

  it("names days and months in the provider's locale", async () => {
    render(
      <UIProvider locale="de-DE">
        <Controlled initial="2025-03-14" />
      </UIProvider>,
    )
    expect(screen.getByRole('button', { name: 'Starts' })).toHaveTextContent('14.03.2025')
    const grid = await openCalendar()
    expect(grid).toHaveAccessibleName('März 2025')
    // The typed box reads the locale's own order.
    expect(screen.getByRole('textbox', { name: 'Type a date' })).toHaveValue('14.03.2025')
    // Weeks start on Monday there, where the browser reports it.
    expect(grid.querySelector('thead th')).toHaveAttribute('aria-label', 'Montag')
  })

  it("names a standalone calendar's months and weekdays in the provider's locale too", () => {
    render(
      <UIProvider locale="de-DE">
        <Calendar mode="single" selected={new Date(2026, 2, 14)} onSelect={() => {}} />
      </UIProvider>,
    )
    const grid = screen.getByRole('grid')
    expect(grid).toHaveAccessibleName('März 2026')
    expect(grid.querySelector('thead th')).toHaveAttribute('aria-label', 'Montag')
  })
})
