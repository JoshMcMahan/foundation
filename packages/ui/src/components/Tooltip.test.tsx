// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { formatTooltipContent, GlobalTooltip, TOOLTIP_ID, TooltipInfo } from './Tooltip'

beforeAll(() => {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
})

function renderAnchor(attrs: Record<string, string>) {
  render(
    <>
      <GlobalTooltip />
      <button data-tooltip-id={TOOLTIP_ID} {...attrs}>
        anchor
      </button>
    </>,
  )
  fireEvent.mouseOver(screen.getByRole('button'))
}

describe('GlobalTooltip', () => {
  it('shows tooltip text from data-tooltip-content', async () => {
    renderAnchor({ 'data-tooltip-content': 'Hello tooltip' })
    await waitFor(() => expect(screen.getByText('Hello tooltip')).toBeInTheDocument())
  })

  it('does not show a blank tooltip for empty data-tooltip-content', async () => {
    renderAnchor({ 'data-tooltip-content': '' })
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
  })

  it('renders newlines and <br> as line breaks', async () => {
    renderAnchor({
      'data-tooltip-content': 'first line\nsecond line<br />third line',
    })
    await waitFor(() => expect(screen.getByRole('tooltip')).toBeInTheDocument())
    const tooltip = screen.getByRole('tooltip')
    expect(tooltip.querySelectorAll('br')).toHaveLength(2)
    expect(tooltip).toHaveTextContent('first line')
    expect(tooltip).toHaveTextContent('third line')
  })

  it('renders markdown links as anchor elements', async () => {
    renderAnchor({
      'data-tooltip-content': 'See [the docs](https://example.com/docs) here',
    })
    await waitFor(() => expect(screen.getByRole('link', { name: 'the docs' })).toBeInTheDocument())
    expect(screen.getByRole('link')).toHaveAttribute('href', 'https://example.com/docs')
  })

  it('renders HTML in tooltip text as literal text, not markup', async () => {
    renderAnchor({
      'data-tooltip-content': 'hi <img src=x onerror=alert(1)> there',
    })
    await waitFor(() => expect(screen.getByRole('tooltip')).toBeInTheDocument())
    expect(screen.getByRole('tooltip')).toHaveTextContent('hi <img src=x onerror=alert(1)> there')
    expect(screen.getByRole('tooltip').querySelector('img')).toBeNull()
  })

  it('opens when the anchor receives keyboard focus', async () => {
    render(
      <>
        <GlobalTooltip />
        <button type="button" data-tooltip-id={TOOLTIP_ID} data-tooltip-content="Focus me">
          anchor
        </button>
      </>,
    )
    fireEvent.focusIn(screen.getByRole('button'))
    await waitFor(() => expect(screen.getByText('Focus me')).toBeInTheDocument())
  })

  it('closes when Escape is pressed', async () => {
    renderAnchor({ 'data-tooltip-content': 'Dismiss me' })
    await waitFor(() => expect(screen.getByRole('tooltip')).toBeInTheDocument())

    fireEvent.keyDown(document, { key: 'Escape' })

    await waitFor(() => expect(screen.queryByRole('tooltip')).not.toBeInTheDocument())
  })
})

describe('TooltipInfo', () => {
  it('targets the global tooltip with its text', async () => {
    const { container } = render(
      <>
        <GlobalTooltip />
        <TooltipInfo text="Helpful explanation" />
      </>,
    )
    const anchor = container.querySelector(`[data-tooltip-id='${TOOLTIP_ID}']`)!
    fireEvent.mouseOver(anchor)
    await waitFor(() => expect(screen.getByText('Helpful explanation')).toBeInTheDocument())
  })

  it('is focusable and named by its text', () => {
    render(<TooltipInfo text="Helpful explanation" />)

    const icon = screen.getByRole('img', { name: 'Helpful explanation' })
    expect(icon).toHaveAttribute('tabindex', '0')
  })

  it('opens the tooltip when focused with the keyboard', async () => {
    render(
      <>
        <GlobalTooltip />
        <TooltipInfo text="Helpful explanation" />
      </>,
    )
    const icon = screen.getByRole('img', { name: 'Helpful explanation' })
    icon.focus()
    fireEvent.focusIn(icon)

    await waitFor(() =>
      expect(screen.getByRole('tooltip')).toHaveTextContent('Helpful explanation'),
    )
  })

  it('honors an explicit tabIndex', () => {
    render(<TooltipInfo text="Helpful explanation" tabIndex={-1} />)

    expect(screen.getByRole('img', { name: 'Helpful explanation' })).toHaveAttribute(
      'tabindex',
      '-1',
    )
  })

  it('leaves children to carry their own semantics', () => {
    render(
      <TooltipInfo text="Remove">
        <button type="button">Remove</button>
      </TooltipInfo>,
    )

    expect(screen.queryByRole('img')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Remove' })).toBeInTheDocument()
    expect(screen.getByRole('button').parentElement).not.toHaveAttribute('tabindex')
  })
})

describe('formatTooltipContent', () => {
  it('returns null for empty content', () => {
    expect(formatTooltipContent('')).toBeNull()
    expect(formatTooltipContent(null)).toBeNull()
  })

  it('passes through non-string content', () => {
    const node = <b>already a node</b>
    expect(formatTooltipContent(node)).toBe(node)
  })
})
