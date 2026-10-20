// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
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

  it('keeps a press inside the card from reaching what holds its anchor', () => {
    const onClick = vi.fn()
    const onContextMenu = vi.fn()
    const onPointerDown = vi.fn()
    const onMouseDown = vi.fn()
    render(
      // biome-ignore lint/a11y/noStaticElementInteractions: stands in for a clickable list row
      // biome-ignore lint/a11y/useKeyWithClickEvents: stands in for a clickable list row
      <div
        onClick={onClick}
        onContextMenu={onContextMenu}
        onPointerDown={onPointerDown}
        onMouseDown={onMouseDown}
      >
        <HoverCard defaultOpen card={<button type="button">in card</button>}>
          <a href="/users/a">trigger</a>
        </HoverCard>
      </div>,
    )
    const inCard = screen.getByRole('button', { name: 'in card' })
    fireEvent.pointerDown(inCard)
    fireEvent.mouseDown(inCard)
    fireEvent.click(inCard)
    fireEvent.contextMenu(inCard)
    expect(onPointerDown).not.toHaveBeenCalled()
    expect(onMouseDown).not.toHaveBeenCalled()
    expect(onClick).not.toHaveBeenCalled()
    expect(onContextMenu).not.toHaveBeenCalled()

    // The anchor itself is still the row's.
    fireEvent.click(screen.getByRole('link', { name: 'trigger' }))
    expect(onClick).toHaveBeenCalledOnce()
  })

  it('still closes on Escape from inside the card', async () => {
    render(
      <HoverCard defaultOpen card={<button type="button">in card</button>}>
        <a href="/users/a">trigger</a>
      </HoverCard>,
    )
    fireEvent.keyDown(screen.getByRole('button', { name: 'in card' }), { key: 'Escape' })
    await act(() => vi.advanceTimersByTimeAsync(500))
    expect(screen.queryByRole('button', { name: 'in card' })).not.toBeInTheDocument()
  })

  describe('opened at an element the host watches', () => {
    function Prose({ onChange = () => {} }: { onChange?: (open: boolean) => void }) {
      const [term, setTerm] = useState<Element | null>(null)
      return (
        <>
          <p>
            Read about{' '}
            <button type="button" className="term" onClick={(e) => setTerm(e.currentTarget)}>
              quotas
            </button>
          </p>
          <HoverCard
            at={term}
            open={term !== null}
            onOpenChange={(open) => {
              onChange(open)
              if (!open) {
                setTerm(null)
              }
            }}
            card={<p>quota card</p>}
          />
        </>
      )
    }

    it('stays closed with nothing to open at', () => {
      render(<HoverCard at={null} open card={<p>quota card</p>} />)
      expect(screen.queryByText('quota card')).not.toBeInTheDocument()
    })

    it('opens at the element, and asks the host to close on Escape', async () => {
      const onChange = vi.fn()
      render(<Prose onChange={onChange} />)
      fireEvent.click(screen.getByRole('button', { name: 'quotas' }))
      await act(() => vi.advanceTimersByTimeAsync(50))
      expect(screen.getByText('quota card')).toBeInTheDocument()
      fireEvent.keyDown(document.body, { key: 'Escape' })
      await act(() => vi.advanceTimersByTimeAsync(500))
      expect(onChange).toHaveBeenCalledWith(false)
      expect(screen.queryByText('quota card')).not.toBeInTheDocument()
    })

    it('tells the host when the pointer is over the card', async () => {
      const onPointerEnter = vi.fn()
      const anchor = document.createElement('span')
      document.body.append(anchor)
      render(
        <HoverCard at={anchor} open onPointerEnter={onPointerEnter} card={<p>quota card</p>} />,
      )
      await act(() => vi.advanceTimersByTimeAsync(50))
      fireEvent.pointerEnter(screen.getByText('quota card'))
      expect(onPointerEnter).toHaveBeenCalled()
      anchor.remove()
    })
  })
})
