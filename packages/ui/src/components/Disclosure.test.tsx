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

describe('Disclosure rows', () => {
  it('holds actions beside the toggle, not inside it, and can drop the chevron', () => {
    const onContextMenu = vi.fn()
    const { container } = render(
      <Disclosure
        summary="gpu-east"
        chevron={false}
        actions={<button type="button">Stop</button>}
        onContextMenu={onContextMenu}
      >
        detail
      </Disclosure>,
    )
    const toggle = screen.getByRole('button', { name: 'gpu-east' })
    const stop = screen.getByRole('button', { name: 'Stop' })
    expect(toggle).not.toContainElement(stop)
    expect(toggle.querySelector('svg')).toBeNull()
    fireEvent.contextMenu(container.firstElementChild as Element)
    expect(onContextMenu).toHaveBeenCalledOnce()
  })

  it('holds controls on the summary’s line outside the toggle, the rest of the line toggling', async () => {
    const onLogs = vi.fn()
    const { container } = render(
      <Disclosure
        summary="gpu-east"
        summaryControls={
          <button type="button" onClick={onLogs}>
            Couldn’t connect
          </button>
        }
        actions={<button type="button">Stop</button>}
      >
        detail
      </Disclosure>,
    )
    const toggle = screen.getByRole('button', { name: 'gpu-east' })
    const control = screen.getByRole('button', { name: 'Couldn’t connect' })
    expect(toggle).not.toContainElement(control)
    expect(control.closest('button button')).toBeNull()
    // Toggle, then the control, then the actions, in Tab order.
    const buttons = screen.getAllByRole('button').map((b) => b.textContent)
    expect(buttons).toEqual(['gpu-east', 'Couldn’t connect', 'Stop'])
    fireEvent.click(control)
    expect(onLogs).toHaveBeenCalledOnce()
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    const rest = container.querySelector('[aria-hidden="true"].flex-1') as HTMLElement
    fireEvent.click(rest)
    await waitFor(() => expect(toggle).toHaveAttribute('aria-expanded', 'true'))
    expect(screen.getByText('detail')).toBeInTheDocument()
  })
})
