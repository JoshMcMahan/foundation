// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { act, render, screen } from '@testing-library/react'
import { Callout } from './Callout'

describe('Callout', () => {
  it('sets the dismiss button on the title line, so the body below reaches the far edge', () => {
    render(
      <Callout tone="success" title="Token created" onDismiss={vi.fn()}>
        <code>tdm_pat_9c4e</code>
      </Callout>,
    )
    const dismiss = screen.getByRole('button', { name: 'Dismiss' })
    const title = screen.getByText('Token created')
    expect(dismiss.parentElement).toBe(title.parentElement)
    // The body is outside the title's line, beside nothing.
    expect(title.parentElement).not.toContainElement(screen.getByText('tdm_pat_9c4e'))
  })

  it('keeps the dismiss button beside a body without a title', () => {
    render(
      <Callout onDismiss={vi.fn()}>
        <span>Saved</span>
      </Callout>,
    )
    const body = screen.getByText('Saved').parentElement as HTMLElement
    expect(body.nextElementSibling).toBe(screen.getByRole('button', { name: 'Dismiss' }))
  })

  // A status region added with its words already in it is often not read.
  it('fills an empty status region a moment after a live warning appears, then clears it', () => {
    vi.useFakeTimers()
    try {
      const { container } = render(
        <Callout tone="warning" live title="Finish 2 steps before you submit">
          Contact
        </Callout>,
      )
      const region = screen.getByRole('status')
      expect(region).toBeEmptyDOMElement()
      expect(container.firstElementChild).not.toHaveAttribute('role')
      act(() => vi.advanceTimersByTime(150))
      expect(region).toHaveTextContent('Finish 2 steps before you submit')
      expect(region).toHaveTextContent('Contact')
      act(() => vi.advanceTimersByTime(7000))
      expect(region).toBeEmptyDOMElement()
    } finally {
      vi.useRealTimers()
    }
  })

  it('makes a live error an alert, which is read as it is added', () => {
    render(
      <Callout tone="error" live title="Couldn't save">
        Try again.
      </Callout>,
    )
    expect(screen.getByRole('alert')).toHaveTextContent("Couldn't save")
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('leaves a callout that is there from the start to be read in its place', () => {
    render(<Callout tone="warning" title="Read only" />)
    expect(screen.queryByRole('status')).toBeNull()
    expect(screen.queryByRole('alert')).toBeNull()
  })
})
