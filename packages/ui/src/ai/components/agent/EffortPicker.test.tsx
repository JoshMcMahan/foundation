// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import EffortPicker from './EffortPicker'

const open = async () => {
  fireEvent.click(screen.getByRole('button'))
  return screen.findByRole('slider', { name: 'Effort' })
}

describe('EffortPicker', () => {
  it('names the level set, and the model default when there is none', () => {
    const { rerender } = render(<EffortPicker effort="" onPick={vi.fn()} />)
    expect(screen.getByRole('button')).toHaveTextContent('Default effort')
    rerender(<EffortPicker effort="xhigh" onPick={vi.fn()} />)
    expect(screen.getByRole('button')).toHaveTextContent('Extra high effort')
  })

  it('shows a level it does not know as it was given', () => {
    render(<EffortPicker effort="turbo" onPick={vi.fn()} />)
    expect(screen.getByRole('button')).toHaveTextContent('turbo')
  })

  it('opens at the level set, and names each stop as it is reached', async () => {
    render(<EffortPicker effort="high" onPick={vi.fn()} />)
    const slider = await open()
    expect(slider).toHaveAttribute('aria-valuetext', 'High effort')
    // The model's default and seven levels.
    expect(slider).toHaveAttribute('min', '0')
    expect(slider).toHaveAttribute('max', '7')
    expect(screen.getByText('Faster')).toBeInTheDocument()
    expect(screen.getByText('Smarter')).toBeInTheDocument()
  })

  it('picks the next level once per key press', async () => {
    const onPick = vi.fn()
    const { rerender } = render(<EffortPicker effort="high" onPick={onPick} />)
    const slider = await open()
    fireEvent.keyDown(slider, { key: 'ArrowRight' })
    expect(onPick).toHaveBeenCalledExactlyOnceWith('xhigh')
    rerender(<EffortPicker effort="xhigh" onPick={onPick} />)
    expect(slider).toHaveAttribute('aria-valuetext', 'Extra high effort')
    fireEvent.keyDown(slider, { key: 'ArrowLeft' })
    expect(onPick).toHaveBeenLastCalledWith('high')
    expect(onPick).toHaveBeenCalledTimes(2)
  })

  it.each([
    ['Home', ''],
    ['End', 'max'],
  ])('%s goes to the end of the scale', async (key, picked) => {
    const onPick = vi.fn()
    render(<EffortPicker effort="medium" onPick={onPick} />)
    fireEvent.keyDown(await open(), { key })
    expect(onPick).toHaveBeenCalledExactlyOnceWith(picked)
  })

  it('does not open while disabled', () => {
    render(<EffortPicker effort="high" disabled onPick={vi.fn()} />)
    const chip = screen.getByRole('button')
    expect(chip).toBeDisabled()
    fireEvent.click(chip)
    expect(screen.queryByRole('slider')).not.toBeInTheDocument()
  })
})
