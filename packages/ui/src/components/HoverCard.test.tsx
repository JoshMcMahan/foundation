// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { HoverCard } from './HoverCard'

describe('HoverCard', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  function renderCard(card = <p>card body</p>) {
    render(
      <HoverCard card={card}>
        <a href="/users/a">trigger</a>
      </HoverCard>,
    )
    return screen.getByRole('link', { name: 'trigger' })
  }

  it('opens after a short hover and closes after the pointer leaves', async () => {
    const trigger = renderCard()
    fireEvent.mouseEnter(trigger)
    fireEvent.mouseMove(trigger)
    await act(() => vi.advanceTimersByTimeAsync(100))
    expect(screen.queryByText('card body')).not.toBeInTheDocument()
    await act(() => vi.advanceTimersByTimeAsync(400))
    expect(screen.getByText('card body')).toBeInTheDocument()

    fireEvent.mouseLeave(trigger)
    await act(() => vi.advanceTimersByTimeAsync(500))
    expect(screen.queryByText('card body')).not.toBeInTheDocument()
  })

  it('keeps the anchor as given', () => {
    expect(renderCard()).toHaveAttribute('href', '/users/a')
  })

  it('mounts the card only once open', () => {
    const Card = vi.fn(() => <p>card body</p>)
    renderCard(<Card />)
    expect(Card).not.toHaveBeenCalled()
  })
})
