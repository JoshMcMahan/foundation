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
})

describe('Avatar', () => {
  it('shows initials without an image', () => {
    render(<Avatar name="Ada Lovelace" />)
    expect(screen.getByText('AL')).toBeInTheDocument()
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })

  it('falls back to initials when the image fails, and retries a new URL', () => {
    const { rerender } = render(<Avatar src="/a.png" name="Ada Lovelace" />)
    fireEvent.error(screen.getByRole('img', { name: 'Ada Lovelace' }))
    expect(screen.getByText('AL')).toBeInTheDocument()

    rerender(<Avatar src="/b.png" name="Ada Lovelace" />)
    expect(screen.getByRole('img', { name: 'Ada Lovelace' })).toHaveAttribute('src', '/b.png')
  })

  it('labels a nameless image with the provider string', () => {
    render(
      <UIProvider strings={{ common: { userAvatar: 'Avatar del usuario' } }}>
        <Avatar src="/a.png" />
      </UIProvider>,
    )
    expect(screen.getByRole('img', { name: 'Avatar del usuario' })).toBeInTheDocument()
  })

  it('shows a status dot', () => {
    render(<Avatar name="Ada" status="online" />)
    expect(screen.getByTestId('online-indicator')).toBeInTheDocument()
  })
})
