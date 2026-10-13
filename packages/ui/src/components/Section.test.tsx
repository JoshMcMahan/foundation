// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { Section } from './Section'

describe('Section', () => {
  it('folds its content, keeping it mounted', async () => {
    render(
      <Section title="Network">
        <input aria-label="Port" defaultValue="8080" />
      </Section>,
    )
    const trigger = screen.getByRole('button', { name: 'Network' })
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    fireEvent.click(trigger)
    await waitFor(() => expect(trigger).toHaveAttribute('aria-expanded', 'false'))
    expect(screen.getByLabelText('Port', { selector: 'input' })).toHaveValue('8080')
  })

  it('names the fold with a heading at the level asked for', () => {
    render(
      <Section title="Network" headingLevel={2}>
        content
      </Section>,
    )
    expect(screen.getByRole('heading', { level: 2, name: 'Network' })).toBeInTheDocument()
  })

  it('follows the open state the host holds', async () => {
    const onOpenChange = vi.fn()
    const { rerender } = render(
      <Section title="Usage" open={false} onOpenChange={onOpenChange}>
        content
      </Section>,
    )
    const trigger = screen.getByRole('button', { name: 'Usage' })
    fireEvent.click(trigger)
    expect(onOpenChange).toHaveBeenCalledWith(true)
    // The host hasn't opened it, so it stays closed.
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    rerender(
      <Section title="Usage" open onOpenChange={onOpenChange}>
        content
      </Section>,
    )
    await waitFor(() => expect(trigger).toHaveAttribute('aria-expanded', 'true'))
  })

  it('starts closed with defaultOpen false', () => {
    render(
      <Section title="Advanced" defaultOpen={false}>
        content
      </Section>,
    )
    expect(screen.getByRole('button', { name: 'Advanced' })).toHaveAttribute(
      'aria-expanded',
      'false',
    )
  })

  it('keeps what sits beside the title and at its end out of the toggle', () => {
    render(
      <Section
        title="Rules"
        beside={<span>3 rules</span>}
        actions={
          <button type="button" aria-label="Add rule">
            +
          </button>
        }
      >
        content
      </Section>,
    )
    expect(screen.getByRole('button', { name: 'Rules' })).not.toHaveTextContent('3 rules')
    expect(screen.getByRole('button', { name: 'Add rule' })).toBeInTheDocument()
  })

  it('shows its content under a plain heading when it cannot fold', () => {
    render(
      <Section title="Summary" collapsible={false}>
        content
      </Section>,
    )
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Summary' })).toHaveAttribute('data-section-title')
    expect(screen.getByText('content')).toBeVisible()
  })
})
