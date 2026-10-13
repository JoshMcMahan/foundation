// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { useSplitter } from './splitter'

function Panel({
  side = 'right',
  onCommit,
}: {
  side?: 'left' | 'right'
  onCommit: (px: number) => void
}) {
  const [width, setWidth] = useState(300)
  const splitter = useSplitter({
    width,
    onWidthChange: (px) => {
      onCommit(px)
      setWidth(px)
    },
    min: 200,
    max: 500,
    side,
    defaultWidth: 250,
  })
  return (
    <div data-testid="panel" style={{ width: splitter.width }}>
      <div {...splitter.separatorProps} />
    </div>
  )
}

const handle = () => screen.getByRole('separator', { name: 'Resize panel' })
const pointer = (type: string, clientX: number) =>
  fireEvent(handle(), new MouseEvent(type, { bubbles: true, clientX }))

describe('useSplitter', () => {
  it('follows a drag within bounds, and commits once when it ends', () => {
    const onCommit = vi.fn()
    render(<Panel onCommit={onCommit} />)
    pointer('pointerdown', 100)
    pointer('pointermove', 180)
    expect(screen.getByTestId('panel').style.width).toBe('380px')
    pointer('pointermove', 900)
    expect(screen.getByTestId('panel').style.width).toBe('500px')
    expect(onCommit).not.toHaveBeenCalled()
    pointer('pointerup', 900)
    expect(onCommit).toHaveBeenCalledOnce()
    expect(onCommit).toHaveBeenCalledWith(500)
  })

  it('widens away from the panel from a left-edge handle', () => {
    const onCommit = vi.fn()
    render(<Panel side="left" onCommit={onCommit} />)
    fireEvent.keyDown(handle(), { key: 'ArrowLeft' })
    expect(onCommit).toHaveBeenLastCalledWith(316)
  })

  it('moves by keys, jumps to its bounds, and resets on a double-click', () => {
    const onCommit = vi.fn()
    render(<Panel onCommit={onCommit} />)
    fireEvent.keyDown(handle(), { key: 'ArrowRight' })
    expect(handle()).toHaveAttribute('aria-valuenow', '316')
    expect(handle()).toHaveAttribute('aria-valuetext', '316 pixels wide')
    fireEvent.keyDown(handle(), { key: 'End' })
    expect(handle()).toHaveAttribute('aria-valuenow', '500')
    fireEvent.keyDown(handle(), { key: 'Home' })
    expect(handle()).toHaveAttribute('aria-valuenow', '200')
    fireEvent.doubleClick(handle())
    expect(handle()).toHaveAttribute('aria-valuenow', '250')
    expect(handle()).toHaveAttribute('aria-valuemin', '200')
    expect(handle()).toHaveAttribute('aria-valuemax', '500')
  })
})
