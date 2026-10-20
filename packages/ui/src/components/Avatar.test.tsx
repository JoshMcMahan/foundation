// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { Avatar, avatarInitials } from './Avatar'
import { UIProvider } from './Provider'

describe('avatarInitials', () => {
  it('takes the first and last word of a name', () => {
    expect(avatarInitials('Ada King Lovelace')).toBe('AL')
    expect(avatarInitials('grace.hopper')).toBe('GH')
    expect(avatarInitials('alan')).toBe('A')
    expect(avatarInitials('')).toBe('?')
    expect(avatarInitials(undefined)).toBe('?')
  })

  it('takes whole characters, not halves of one', () => {
    expect(avatarInitials('😀 Smile')).toBe('😀S')
    expect(avatarInitials('Ada 🇬🇧')).toBe('A🇬🇧')
    expect(avatarInitials('👩‍💻 dev')).toBe('👩‍💻D')
    // An accent typed as its own code point stays with its letter.
    expect(avatarInitials('e\u0301mile zola')).toBe('E\u0301Z')
    expect(avatarInitials('𝒜da')).toBe('𝒜')
  })
})

describe('Avatar', () => {
  it('shows one whole character at the smallest size', () => {
    render(<Avatar name="😀 Smile" size="xs" />)
    expect(screen.getByRole('img', { name: '😀 Smile' })).toHaveTextContent(/^😀$/)
  })

  it('shows initials without an image, named for the person', () => {
    render(<Avatar name="Ada Lovelace" />)
    expect(screen.getByRole('img', { name: 'Ada Lovelace' })).toHaveTextContent('AL')
  })

  it('shows initials until the image loads, and keeps them when it fails', () => {
    const { container, rerender } = render(<Avatar src="/a.png" name="Ada Lovelace" />)
    const image = () => container.querySelector('img') as HTMLImageElement
    expect(screen.getByText('AL')).toBeInTheDocument()
    fireEvent.error(image())
    expect(screen.getByText('AL')).toBeInTheDocument()

    // A new URL loads afresh.
    rerender(<Avatar src="/b.png" name="Ada Lovelace" />)
    expect(image()).toHaveAttribute('src', '/b.png')
    fireEvent.load(image())
    expect(screen.queryByText('AL')).not.toBeInTheDocument()
  })

  it('names a nameless avatar with the provider string', () => {
    render(
      <UIProvider strings={{ common: { userAvatar: 'Avatar del usuario' } }}>
        <Avatar src="/a.png" />
      </UIProvider>,
    )
    expect(screen.getByRole('img', { name: 'Avatar del usuario' })).toBeInTheDocument()
  })

  it('says the presence its status dot shows', () => {
    render(<Avatar name="Ada Lovelace" status="busy" />)
    expect(screen.getByRole('img', { name: 'Ada Lovelace, busy' })).toBeInTheDocument()
  })

  it('shows one initial at the extra-small size', () => {
    render(<Avatar name="Ada Lovelace" size="xs" />)
    expect(screen.getByText('A')).toBeInTheDocument()
  })

  it('colors the fallback by name, the same for the same name', () => {
    render(
      <>
        <Avatar name="Ada Lovelace" />
        <Avatar name="ada lovelace" />
        <Avatar name="Grace Hopper" />
      </>,
    )
    const fill = (name: string) =>
      screen.getByRole('img', { name }).querySelector('[class*="--theme-category-"]')?.className
    expect(fill('Ada Lovelace')).toContain('bg-(--theme-category-7) text-(--theme-category-7-text)')
    expect(fill('ada lovelace')).toBe(fill('Ada Lovelace'))
    expect(fill('Grace Hopper')).toContain('bg-(--theme-category-4)')
  })

  it('colors by a color key over the name, and keeps the accent without either', () => {
    render(
      <>
        <Avatar name="Ada Lovelace" colorKey="Grace Hopper" />
        <Avatar name="Alan Turing" colorKey={null} />
        <Avatar />
      </>,
    )
    const html = (name: string) => screen.getByRole('img', { name }).innerHTML
    expect(html('Ada Lovelace')).toContain('bg-(--theme-category-4)')
    expect(html('Alan Turing')).not.toContain('--theme-category-')
    expect(html('Alan Turing')).toContain('--theme-accent')
    expect(html('User avatar')).not.toContain('--theme-category-')
  })

  it('shows a status dot', () => {
    render(<Avatar name="Ada" status="online" />)
    expect(screen.getByTestId('online-indicator')).toBeInTheDocument()
  })

  it('puts its class on the round shape, so a ring follows the circle', () => {
    render(<Avatar name="Ada Lovelace" className="ring-2" />)
    const avatar = screen.getByRole('img', { name: 'Ada Lovelace' })
    expect(avatar).toHaveClass('ring-2', 'rounded-full')
  })

  it('stays out of the accessibility tree when decorative', () => {
    render(
      <p>
        <Avatar name="Ada Lovelace" status="online" decorative /> Ada Lovelace
      </p>,
    )
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
    expect(screen.getByText('AL').closest('[aria-hidden="true"]')).not.toBeNull()
  })
})
