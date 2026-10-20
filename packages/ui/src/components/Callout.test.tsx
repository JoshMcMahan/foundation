// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
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
})
