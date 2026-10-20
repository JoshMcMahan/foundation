// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { hoverTooltip } from '../test/tooltip'
import { Avatar, AvatarGroup, avatarInitials } from './Avatar'
import { UIProvider } from './Provider'

describe('avatarInitials', () => {
  it('takes the first and last word of a name', () => {
    expect(avatarInitials('Ada King Lovelace')).toBe('AL')
    expect(avatarInitials('grace.hopper')).toBe('GH')
    expect(avatarInitials('alan')).toBe('A')
    expect(avatarInitials('')).toBe('?')
    expect(avatarInitials(undefined)).toBe('?')
  })

  it('takes two letters of a one-word name when asked, and leaves out an email domain', () => {
    const two = { twoLetters: true }
    expect(avatarInitials('maya', two)).toBe('MA')
    expect(avatarInitials('Maya Chen', two)).toBe('MC')
    expect(avatarInitials('research-team', two)).toBe('RT')
    expect(avatarInitials('maya@example.com', two)).toBe('MA')
    expect(avatarInitials('maya.chen@example.com', two)).toBe('MC')
    expect(avatarInitials('😀x', two)).toBe('😀X')
    expect(avatarInitials('', two)).toBe('?')
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

  it('shows a name on hover, or the text it is given', async () => {
    render(
      <UIProvider>
        <Avatar name="Ada Lovelace" status="online" tooltip />
        <Avatar name="Grace Hopper" tooltip="Grace is editing the title" />
      </UIProvider>,
    )
    const ada = await hoverTooltip(screen.getByRole('img', { name: 'Ada Lovelace, online' }))
    expect(ada).toHaveTextContent('Ada Lovelace, online')
    const grace = await hoverTooltip(screen.getByRole('img', { name: 'Grace Hopper' }))
    expect(grace).toHaveTextContent('Grace is editing the title')
  })

  it("draws an agent as a square, whose ring follows the square's corners", () => {
    render(
      <>
        <Avatar name="Triage bot" kind="agent" size="sm" className="ring-2" />
        <Avatar name="Acme" shape="square" size="lg" />
      </>,
    )
    const agent = screen.getByRole('img', { name: 'Triage bot' })
    expect(agent).toHaveClass('ring-2', 'rounded-[5px]')
    expect(agent).not.toHaveClass('rounded-full')
    expect(agent).toHaveAttribute('data-shape', 'square')
    expect(screen.getByRole('img', { name: 'Acme' })).toHaveClass('rounded-lg')
  })

  it('colors by kind when the host asks, with two initials', () => {
    render(
      <UIProvider avatarColoring="kind">
        <Avatar name="maya" />
        <Avatar name="Grace Hopper" />
        <Avatar name="Triage bot" kind="agent" size="xs" />
        <Avatar name="Webhook" colorClassName="bg-gray-200 text-gray-700" />
      </UIProvider>,
    )
    const html = (name: string) => screen.getByRole('img', { name }).innerHTML
    expect(screen.getByRole('img', { name: 'maya' })).toHaveTextContent('MA')
    expect(html('maya')).toContain('--avatar-person')
    // Every person shares one tint, whatever the name.
    expect(html('Grace Hopper')).toContain('--avatar-person')
    expect(html('Grace Hopper')).not.toContain('--theme-category-')
    // Two letters even at the smallest size.
    expect(screen.getByRole('img', { name: 'Triage bot' })).toHaveTextContent(/^TB$/)
    expect(html('Triage bot')).toContain('--avatar-agent')
    expect(html('Webhook')).toContain('bg-gray-200')
    expect(html('Webhook')).not.toContain('--avatar-person')
  })
})

describe('AvatarGroup', () => {
  const PEOPLE = ['Ada Lovelace', 'Grace Hopper', 'Alan Turing', 'Radia Perlman', 'Ken Thompson']

  it('shows at most max avatars and counts the rest', () => {
    render(
      <AvatarGroup max={3} label="5 people here">
        {PEOPLE.map((name) => (
          <Avatar key={name} name={name} />
        ))}
      </AvatarGroup>,
    )
    const group = screen.getByRole('group', { name: '5 people here' })
    expect(within(group).getAllByRole('img')).toHaveLength(3)
    expect(group).toHaveTextContent('+2')
    expect(screen.getByText('2 more')).toHaveClass('sr-only')
  })

  it('counts from the total when the children are already a slice', () => {
    render(
      <AvatarGroup total={12}>
        {PEOPLE.slice(0, 2).map((name) => (
          <Avatar key={name} name={name} />
        ))}
      </AvatarGroup>,
    )
    expect(screen.getByText('10 more')).toBeInTheDocument()
  })

  it('leaves out the chip when told to, or when nothing is left out', () => {
    const { container, rerender } = render(
      <AvatarGroup max={2} showOverflow={false}>
        {PEOPLE.map((name) => (
          <Avatar key={name} name={name} />
        ))}
      </AvatarGroup>,
    )
    expect(container).not.toHaveTextContent('+')
    rerender(
      <AvatarGroup max={10}>
        {PEOPLE.map((name) => (
          <Avatar key={name} name={name} />
        ))}
      </AvatarGroup>,
    )
    expect(container).not.toHaveTextContent('+')
    expect(screen.getAllByRole('img')).toHaveLength(5)
  })

  it('gives each avatar its size and a ring that follows its shape', () => {
    render(
      <AvatarGroup size="md" ringColor="red">
        <span>
          <Avatar name="Ada Lovelace" />
        </span>
        <Avatar name="Triage bot" kind="agent" />
      </AvatarGroup>,
    )
    const ada = screen.getByRole('img', { name: 'Ada Lovelace' })
    expect(ada).toHaveClass('ring-2', 'ring-(--avatar-ring)', 'rounded-full')
    expect(ada.innerHTML).toContain('size-7')
    expect(screen.getByRole('img', { name: 'Triage bot' })).toHaveClass('ring-2', 'rounded-[5px]')
    expect(ada.closest('[style]')).toHaveStyle({ '--avatar-ring': 'red' })
  })

  it('draws no ring when told not to', () => {
    render(
      <AvatarGroup ring={false}>
        <Avatar name="Ada Lovelace" />
      </AvatarGroup>,
    )
    expect(screen.getByRole('img', { name: 'Ada Lovelace' })).not.toHaveClass('ring-2')
  })

  it('formats the count in the provider locale and reads the host string', () => {
    render(
      <UIProvider locale="de-DE" strings={{ common: { moreCount: (n) => `${n} weitere` } }}>
        <AvatarGroup max={0} total={1500}>
          <Avatar name="Ada Lovelace" />
        </AvatarGroup>
      </UIProvider>,
    )
    expect(screen.getByText('+1.500')).toBeInTheDocument()
    expect(screen.getByText('1500 weitere')).toBeInTheDocument()
  })
})
