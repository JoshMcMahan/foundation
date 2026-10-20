// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { Checkbox } from './Checkbox'

describe('Checkbox', () => {
  it('read-only, keeps its tick, stays focusable and fills grey rather than the accent', () => {
    const onCheckedChange = vi.fn()
    render(
      <Checkbox
        aria-label="Granted by Admin"
        readOnly
        defaultChecked
        onCheckedChange={onCheckedChange}
      />,
    )
    const box = screen.getByRole('checkbox', { name: 'Granted by Admin' })
    fireEvent.click(box)
    expect(box).toBeChecked()
    expect(onCheckedChange).not.toHaveBeenCalled()
    expect(box).toHaveAttribute('aria-readonly', 'true')
    expect(box).not.toHaveAttribute('aria-disabled')
    expect(box).toHaveClass('data-readonly:data-checked:bg-(--theme-muted-text-color)')
  })
})
