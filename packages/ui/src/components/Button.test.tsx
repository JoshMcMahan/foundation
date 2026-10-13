// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { Button } from './Button'
import { IconButton } from './IconButton'
import { TooltipProvider } from './Tooltip'

describe('Button', () => {
  it('is busy, and can’t be pressed again, while loading', () => {
    const onClick = vi.fn()
    render(
      <Button variant="primary" loading onClick={onClick}>
        Save
      </Button>,
    )
    const button = screen.getByRole('button', { name: 'Save' })
    expect(button).toHaveAttribute('aria-busy', 'true')
    expect(button).toBeDisabled()
    fireEvent.click(button)
    expect(onClick).not.toHaveBeenCalled()
  })

  it('stays focusable while disabled when asked, for its tooltip', () => {
    render(
      <Button disabled focusableWhenDisabled>
        Delete
      </Button>,
    )
    const button = screen.getByRole('button', { name: 'Delete' })
    expect(button).toHaveAttribute('aria-disabled', 'true')
    act(() => button.focus())
    expect(button).toHaveFocus()
  })
})

describe('IconButton', () => {
  it('is named by its label and reports a toggle’s state', () => {
    render(<IconButton label="Pin" icon="📌" pressed />)
    expect(screen.getByRole('button', { name: 'Pin' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('shows a dot as an indicator, not as pressed', () => {
    render(<IconButton label="Filter" icon="⏷" dot />)
    const button = screen.getByRole('button', { name: 'Filter' })
    expect(button).not.toHaveAttribute('aria-pressed')
    expect(button.querySelector('span')).toBeInTheDocument()
  })

  it('keeps its tooltip as an expanded disclosure, but not as an open popup’s trigger', async () => {
    render(
      <TooltipProvider>
        <IconButton label="Collapse sidebar" icon="◧" aria-expanded />
        <IconButton label="More actions" icon="…" aria-expanded aria-haspopup="menu" />
      </TooltipProvider>,
    )
    act(() => screen.getByRole('button', { name: 'Collapse sidebar' }).focus())
    expect(await screen.findByText('Collapse sidebar')).toBeInTheDocument()
    act(() => screen.getByRole('button', { name: 'More actions' }).focus())
    await new Promise((resolve) => setTimeout(resolve, 50))
    await waitFor(() => expect(screen.queryByText('More actions')).not.toBeInTheDocument())
  })
})
