// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import { Card } from './Card'

describe('Card', () => {
  it('sits flat and full width among the page’s content with size fill', () => {
    render(<Card size="fill">content</Card>)
    const card = screen.getByText('content')
    expect(card).toHaveClass('w-full', 'p-4')
    expect(card.className).not.toMatch(/shadow|max-w/)
  })

  it('takes its padding over its size’s own', () => {
    render(
      <Card size="fill" padding="none">
        content
      </Card>,
    )
    expect(screen.getByText('content')).toHaveClass('p-0')
  })

  it('presses as a link or a control it renders as', () => {
    render(<Card render={<button type="button" />}>Choose</Card>)
    expect(screen.getByRole('button', { name: 'Choose' })).toHaveClass('cursor-pointer')
  })

  it('stays still as a list of rows', () => {
    render(
      <Card size="fill" padding="none" divided interactive={false} render={<ul />}>
        <li>One</li>
        <li>Two</li>
      </Card>,
    )
    const list = screen.getByRole('list')
    expect(list).toHaveClass('divide-y')
    expect(list).not.toHaveClass('cursor-pointer')
  })

  it('tints its border in a status’s tone, or a color the host picks', () => {
    const { rerender } = render(
      <Card size="fill" tone="warning">
        tinted
      </Card>,
    )
    const card = screen.getByText('tinted')
    expect(card.style.getPropertyValue('--card-tone')).toBe('var(--theme-warning)')
    expect(card).toHaveClass('border-(--card-tone)/45')
    rerender(
      <Card size="fill" tone="var(--agent-color)" tinted highlight href="#run">
        tinted
      </Card>,
    )
    const link = screen.getByRole('link', { name: 'tinted' })
    expect(link.style.getPropertyValue('--card-tone')).toBe('var(--agent-color)')
    expect(link).toHaveClass('border-(--card-tone)/80')
    expect(link.className).toMatch(/var\(--card-tone\)_7%/)
    expect(link.className).toMatch(/hover:bg-\[color-mix/)
  })

  it('keeps its own border without a tone', () => {
    render(<Card size="fill">plain</Card>)
    const card = screen.getByText('plain')
    expect(card.style.getPropertyValue('--card-tone')).toBe('')
    expect(card).toHaveClass('border-(--theme-border)')
  })
})
