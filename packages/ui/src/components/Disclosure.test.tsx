// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { Disclosure, DisclosurePanel } from './Disclosure'

describe('Disclosure', () => {
  it('reveals its detail when its summary is pressed', async () => {
    render(<Disclosure summary="Arguments">the args</Disclosure>)
    const toggle = screen.getByRole('button', { name: 'Arguments' })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByText('the args')).not.toBeInTheDocument()
    fireEvent.click(toggle)
    await waitFor(() => expect(screen.getByText('the args')).toBeVisible())
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
  })

  it('follows a held open state', () => {
    const onOpenChange = vi.fn()
    render(
      <Disclosure summary="Arguments" open onOpenChange={onOpenChange}>
        the args
      </Disclosure>,
    )
    expect(screen.getByText('the args')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Arguments' }))
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('keeps folded detail mounted with keepMounted', () => {
    render(
      <Disclosure summary="Members" keepMounted>
        <input aria-label="Draft" />
      </Disclosure>,
    )
    expect(document.querySelector('input[aria-label="Draft"]')).toBeInTheDocument()
  })

  it('shows only the summary when disabled', () => {
    render(
      <Disclosure summary="Done" disabled>
        nothing
      </Disclosure>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Done' }))
    expect(screen.queryByText('nothing')).not.toBeInTheDocument()
  })
})

describe('DisclosurePanel', () => {
  it('opens for a toggle that lives elsewhere', () => {
    const { rerender } = render(
      <DisclosurePanel open={false} id="steps">
        steps
      </DisclosurePanel>,
    )
    expect(screen.queryByText('steps')).not.toBeInTheDocument()
    rerender(
      <DisclosurePanel open id="steps">
        steps
      </DisclosurePanel>,
    )
    expect(screen.getByText('steps')).toHaveAttribute('id', 'steps')
  })
})
