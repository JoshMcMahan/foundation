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

  it('describes the section and its toggle with the description, outside the toggle', () => {
    render(
      <Section id="access" title="Access" description="Who can see this.">
        content
      </Section>,
    )
    const trigger = screen.getByRole('button', { name: 'Access' })
    expect(trigger).toHaveAccessibleDescription('Who can see this.')
    expect(trigger).not.toHaveTextContent('Who can see this.')
    expect(document.getElementById('access')).toHaveAccessibleDescription('Who can see this.')
  })

  it('describes a section that cannot fold, and takes its id', () => {
    render(
      <Section
        id="retention"
        title="Retention"
        description="How long runs are kept."
        collapsible={false}
      >
        content
      </Section>,
    )
    const section = document.getElementById('retention')
    expect(section?.tagName).toBe('SECTION')
    expect(section).toHaveAccessibleDescription('How long runs are kept.')
  })

  it('shows a card that cannot fold with an open title, not a folded one', () => {
    render(
      <Section variant="card" title="Summary" collapsible={false}>
        content
      </Section>,
    )
    expect(screen.getByRole('heading', { name: 'Summary' }).className).not.toMatch(/muted/)
  })

  it('lets a flush card’s content reach its edges', () => {
    render(
      <Section variant="card" title="Nodes" flush collapsible={false}>
        <table data-testid="table" />
      </Section>,
    )
    expect(screen.getByTestId('table').parentElement?.tagName).toBe('SECTION')
  })

  it('marks a danger zone in the error color', () => {
    render(
      <Section variant="card" tone="error" title="Danger zone" collapsible={false}>
        content
      </Section>,
    )
    const heading = screen.getByRole('heading', { name: 'Danger zone' })
    expect(heading).toHaveClass('text-(--theme-error-text)')
    expect(heading.closest('section')).toHaveClass('border-(--theme-error)/30')
  })

  it('sets a bare title over its content with no rule', () => {
    render(
      <Section variant="bare" title="Workflow" collapsible={false}>
        content
      </Section>,
    )
    const header = screen
      .getByRole('heading', { name: 'Workflow' })
      .closest('[data-section-header]')
    expect(header?.className).not.toMatch(/border-b/)
  })
})
