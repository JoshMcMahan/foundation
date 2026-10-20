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
})
