// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import type { UILinkComponent } from '../components/Provider'
import { UIProvider } from '../components/Provider'
import { HoverCardRow, UserHoverCard } from './UserHoverCard'

const RouterLink: UILinkComponent = ({ href, children, className }) => (
  <a href={`#router${href}`} className={className}>
    {children}
  </a>
)

describe('UserHoverCard', () => {
  it('shows the name, username, role and detail rows', () => {
    render(
      <UserHoverCard username="alovelace" name="Ada Lovelace" badge="Admin" href="/users/alovelace">
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
    render(<UserHoverCard username="alovelace" />)
    expect(screen.getAllByText('alovelace')).toHaveLength(2)
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })

  it('links through the provider slot, or a linkComponent override', () => {
    const { rerender } = render(
      <UIProvider slots={{ link: RouterLink }}>
        <UserHoverCard username="a" href="/users/a" />
      </UIProvider>,
    )
    expect(screen.getByRole('link')).toHaveAttribute('href', '#router/users/a')

    const Override: UILinkComponent = ({ href, children }) => (
      <a href={`#override${href}`}>{children}</a>
    )
    rerender(
      <UIProvider slots={{ link: RouterLink }}>
        <UserHoverCard username="a" href="/users/a" linkComponent={Override} />
      </UIProvider>,
    )
    expect(screen.getByRole('link')).toHaveAttribute('href', '#override/users/a')
  })

  it('shows a labelled loading region instead of rows while loading', () => {
    render(
      <UIProvider strings={{ loading: 'Cargando' }}>
        <UserHoverCard username="a" loading>
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

describe('UserHoverCard copy', () => {
  it('copies an email address, naming it, from beside the linked header', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.assign(navigator, { clipboard: { writeText } })
    const success = vi.fn()
    render(
      <UIProvider notify={{ success }}>
        <UserHoverCard username="ada@example.com" href="/users/a" />
      </UIProvider>,
    )
    const button = screen.getByRole('button', { name: 'Copy email' })
    // Beside the linked header, never inside it.
    expect(screen.getByRole('link')).not.toContainElement(button)
    await act(async () => fireEvent.click(button))
    expect(writeText).toHaveBeenCalledWith('ada@example.com')
    expect(success).toHaveBeenCalledWith('Copied email')
  })

  it('names a handle a username, and stays reachable from the keyboard', () => {
    render(<UserHoverCard username="alovelace" />)
    const button = screen.getByRole('button', { name: 'Copy username' })
    // Hidden until hover by opacity alone, so it keeps its place and its focus.
    expect(button).toHaveClass('opacity-0', 'focus-visible:opacity-100')
    button.focus()
    expect(button).toHaveFocus()
  })

  it('has no copy button without a username', () => {
    render(<UserHoverCard username="" name="Ada" />)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
})
