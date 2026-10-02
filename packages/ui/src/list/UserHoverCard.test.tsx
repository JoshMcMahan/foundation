// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import type { UILinkComponent } from '../components/Provider'
import { UIProvider } from '../components/Provider'
import {
  type HoverCardPlacement,
  HoverCardRow,
  HoverCardTrigger,
  UserHoverCard,
} from './UserHoverCard'

const placement: HoverCardPlacement = {
  x: 0,
  y: 0,
  onKeepOpen: () => {},
  onLeave: () => {},
}

const RouterLink: UILinkComponent = ({ to, children, className }) => (
  <a href={`#router${to}`} className={className}>
    {children}
  </a>
)

describe('UserHoverCard', () => {
  it('shows the name, username, role and detail rows', () => {
    render(
      <UserHoverCard
        {...placement}
        username="alovelace"
        name="Ada Lovelace"
        badge="Admin"
        href="/users/alovelace"
      >
        <HoverCardRow icon={<span />}>Online</HoverCardRow>
      </UserHoverCard>,
    )
    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument()
    expect(screen.getByText('alovelace')).toBeInTheDocument()
    expect(screen.getByText('Admin')).toBeInTheDocument()
    expect(screen.getByText('Online')).toBeInTheDocument()
    expect(screen.getByRole('link')).toHaveAttribute('href', '/users/alovelace')
  })

  it('falls back to the username without a name, and is unlinked without href', () => {
    render(<UserHoverCard {...placement} username="alovelace" />)
    expect(screen.getAllByText('alovelace')).toHaveLength(2)
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })

  it('links through the provider slot, or a linkComponent override', () => {
    const { rerender } = render(
      <UIProvider slots={{ link: RouterLink }}>
        <UserHoverCard {...placement} username="a" href="/users/a" />
      </UIProvider>,
    )
    expect(screen.getByRole('link')).toHaveAttribute('href', '#router/users/a')

    const Override: UILinkComponent = ({ to, children }) => (
      <a href={`#override${to}`}>{children}</a>
    )
    rerender(
      <UIProvider slots={{ link: RouterLink }}>
        <UserHoverCard {...placement} username="a" href="/users/a" linkComponent={Override} />
      </UIProvider>,
    )
    expect(screen.getByRole('link')).toHaveAttribute('href', '#override/users/a')
  })

  it('shows a labelled loading region instead of rows while loading', () => {
    render(
      <UIProvider strings={{ loading: 'Cargando' }}>
        <UserHoverCard {...placement} username="a" loading>
          <HoverCardRow icon={<span />}>Online</HoverCardRow>
        </UserHoverCard>
      </UIProvider>,
    )
    expect(screen.getByRole('status', { name: 'Cargando' })).toBeInTheDocument()
    expect(screen.queryByText('Online')).not.toBeInTheDocument()
  })
})

describe('HoverCardRow', () => {
  it('is a button when clickable', () => {
    const onClick = vi.fn()
    render(
      <HoverCardRow icon={<span />} title="Copy email" onClick={onClick}>
        a@example.com
      </HoverCardRow>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'a@example.com' }))
    expect(onClick).toHaveBeenCalledOnce()
  })
})

describe('HoverCardTrigger', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('opens the card after hovering and closes it after leaving', () => {
    render(
      <HoverCardTrigger card={() => <div>card body</div>}>
        <span>trigger</span>
      </HoverCardTrigger>,
    )
    fireEvent.mouseEnter(screen.getByText('trigger'))
    expect(screen.queryByText('card body')).not.toBeInTheDocument()
    act(() => vi.advanceTimersByTime(400))
    expect(screen.getByText('card body')).toBeInTheDocument()

    fireEvent.mouseLeave(screen.getByText('trigger'))
    act(() => vi.advanceTimersByTime(200))
    expect(screen.queryByText('card body')).not.toBeInTheDocument()
  })
})
