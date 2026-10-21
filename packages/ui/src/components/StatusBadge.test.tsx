// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import { UIProvider } from './Provider'
import { CountBadge, StatusBadge, StatusDot } from './StatusBadge'

describe('StatusBadge', () => {
  it('renders as the element it is given, such as a link', () => {
    render(
      <StatusBadge variant="accent" render={<a href="#v2" />}>
        v2.4.0
      </StatusBadge>,
    )
    expect(screen.getByRole('link', { name: 'v2.4.0' })).toHaveAttribute('href', '#v2')
  })

  it('fills a solid badge and leaves an outline one clear', () => {
    render(
      <>
        <StatusBadge variant="accent" emphasis="solid">
          New
        </StatusBadge>
        <StatusBadge emphasis="outline">Yours</StatusBadge>
      </>,
    )
    expect(screen.getByText('New')).toHaveClass('bg-(--theme-accent)')
    expect(screen.getByText('Yours')).toHaveClass('bg-transparent')
  })

  it('keeps a tag in sentence case unless asked for caps', () => {
    render(
      <>
        <StatusBadge shape="tag">Decided</StatusBadge>
        <StatusBadge shape="tag" caps>
          Beta
        </StatusBadge>
      </>,
    )
    expect(screen.getByText('Decided')).not.toHaveClass('uppercase')
    expect(screen.getByText('Beta')).toHaveClass('uppercase', 'rounded-[4px]')
  })

  it('cuts a long label off inside its cell', () => {
    render(<StatusBadge truncate>Waiting for capacity in the region</StatusBadge>)
    expect(screen.getByText('Waiting for capacity in the region')).toHaveClass('truncate')
  })
})

describe('CountBadge', () => {
  it('caps a big count and says what it counts', () => {
    render(<CountBadge count={140} label="unread" />)
    expect(screen.getByText('99+')).toHaveTextContent('99+ unread')
  })

  it('takes the host’s words for a capped count', () => {
    render(
      <UIProvider strings={{ common: { countOverflow: (max) => `más de ${max}` } }}>
        <CountBadge count={12} max={9} />
      </UIProvider>,
    )
    expect(screen.getByText('más de 9')).toBeInTheDocument()
  })

  it('shows nothing for zero unless asked to', () => {
    const { container, rerender } = render(<CountBadge count={0} />)
    expect(container).toBeEmptyDOMElement()
    rerender(<CountBadge count={0} showZero />)
    expect(screen.getByText('0')).toBeInTheDocument()
  })

  it('writes the count in the locale it is given', () => {
    render(<CountBadge count={1200} max={9999} locale="de-DE" />)
    expect(screen.getByText('1.200')).toBeInTheDocument()
  })

  it('takes a host color over its tone', () => {
    render(<CountBadge count={3} className="bg-[#c47f17] text-black" />)
    expect(screen.getByText('3')).toHaveClass('bg-[#c47f17]')
    expect(screen.getByText('3')).not.toHaveClass('bg-(--theme-accent)')
  })
})

describe('StatusDot', () => {
  it('rings the dot with a soft halo of its tone', () => {
    const { container } = render(<StatusDot variant="success" />)
    const dot = container.querySelector('.rounded-full')
    expect(dot).toHaveClass('bg-(--theme-success)', 'ring-2', 'ring-(--theme-success)/22')
    expect(container.firstElementChild).toHaveAttribute('aria-hidden', 'true')
  })

  it('is the badge’s own dot, with no halo on a solid fill', () => {
    const { container } = render(
      <>
        <StatusBadge variant="error" dot>
          Failed
        </StatusBadge>
        <StatusBadge variant="error" dot emphasis="solid">
          Down
        </StatusBadge>
      </>,
    )
    const [soft, solid] = [...container.querySelectorAll('.relative.inline-flex.rounded-full')]
    expect(soft).toHaveClass('ring-(--theme-error)/22')
    expect(solid).toHaveClass('bg-current')
    expect(solid).not.toHaveClass('ring-2')
  })

  it('keeps its ping when it pulses', () => {
    const { container } = render(<StatusDot variant="info" pulse />)
    expect(container.querySelector('.animate-ping')).toBeInTheDocument()
  })
})
