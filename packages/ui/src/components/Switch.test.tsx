// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { Switch } from './Switch'

describe('Switch', () => {
  it('names its current state beside it, following the switch uncontrolled too', () => {
    render(<Switch aria-label="Sharing" onLabel="Shared" offLabel="Private" />)
    const control = screen.getByRole('switch', { name: 'Sharing' })
    // Both names are drawn, and CSS on the switch's data-checked shows one.
    expect(screen.getByText('Private')).toHaveClass('peer-data-checked:hidden')
    expect(screen.getByText('Shared')).toHaveClass('hidden', 'peer-data-checked:inline')
    expect(control).not.toHaveAttribute('data-checked')
    fireEvent.click(control)
    expect(control).toHaveAttribute('data-checked')
  })

  it('keeps the names out of its accessible name, which already says on or off', () => {
    render(<Switch aria-label="Sharing" onLabel="Shared" offLabel="Private" />)
    expect(screen.getByText('Shared')).toHaveAttribute('aria-hidden', 'true')
    expect(screen.getByRole('switch')).toHaveAccessibleName('Sharing')
  })

  it('is only the control without names', () => {
    const { container } = render(<Switch aria-label="Sharing" />)
    expect(container.firstElementChild).toHaveAttribute('role', 'switch')
  })
})

describe('Switch look', () => {
  it('slides its thumb toward the end of the line, left in a right-to-left page', () => {
    const { container } = render(<Switch aria-label="Sharing" />)
    const thumb = container.querySelector('[role="switch"] > span')
    expect(thumb).toHaveClass('data-checked:translate-x-5', 'rtl:data-checked:-translate-x-5')
  })

  it('draws focus as an outline in the focus color, so an invalid ring never hides it', () => {
    render(<Switch aria-label="Sharing" aria-invalid />)
    expect(screen.getByRole('switch')).toHaveClass(
      'focus-visible:outline-(--theme-focus)',
      'aria-invalid:ring-(--theme-error)',
    )
  })
})
