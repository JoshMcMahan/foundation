// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { openTooltip } from '../test/tooltip'
import { SegmentedControl } from './SegmentedControl'

describe('SegmentedControl', () => {
  it('presses the current choice and reports a new one', () => {
    const onChange = vi.fn()
    render(
      <SegmentedControl
        label="Range"
        value="day"
        onValueChange={onChange}
        options={[
          { value: 'day', label: 'Day' },
          { value: 'week', label: 'Week' },
        ]}
      />,
    )
    expect(screen.getByRole('group', { name: 'Range' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Day' })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(screen.getByRole('button', { name: 'Week' }))
    expect(onChange).toHaveBeenCalledWith('week')
  })

  it('lifts a keyboard-focused segment above its neighbors, so its ring shows whole', () => {
    render(
      <SegmentedControl
        label="Range"
        value="week"
        options={[
          { value: 'day', label: 'Day' },
          { value: 'week', label: 'Week' },
        ]}
      />,
    )
    for (const name of ['Day', 'Week']) {
      expect(screen.getByRole('button', { name }).className).toMatch(/\bfocus-visible:z-10\b/)
    }
  })

  it('keeps the current choice when it is pressed again', () => {
    const onChange = vi.fn()
    render(
      <SegmentedControl
        label="Range"
        value="day"
        onValueChange={onChange}
        options={[
          { value: 'day', label: 'Day' },
          { value: 'week', label: 'Week' },
        ]}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Day' }))
    expect(onChange).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Day' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('moves between segments with the arrow keys', async () => {
    render(
      <SegmentedControl
        label="Range"
        value="day"
        options={[
          { value: 'day', label: 'Day' },
          { value: 'week', label: 'Week' },
        ]}
      />,
    )
    const day = screen.getByRole('button', { name: 'Day' })
    act(() => day.focus())
    fireEvent.keyDown(day, { key: 'ArrowRight' })
    await waitFor(() => expect(screen.getByRole('button', { name: 'Week' })).toHaveFocus())
  })

  it('keeps each label as the accessible name and tooltip when only icons show', async () => {
    render(
      <SegmentedControl
        label="Views"
        value="a"
        iconOnly
        options={[{ value: 'a', label: 'First', icon: <svg /> }]}
      />,
    )
    act(() => screen.getByRole('button', { name: 'First' }).focus())
    await waitFor(() => expect(openTooltip()).toHaveTextContent('First'))
  })
})

it('holds its value while disabled, as a whole or one option at a time', () => {
  const onValueChange = vi.fn()
  const options = [
    { value: 'private', label: 'Private' },
    { value: 'team', label: 'Team', disabled: true },
    { value: 'everyone', label: 'Everyone' },
  ] as const
  const { rerender } = render(
    <SegmentedControl
      label="Visibility"
      options={[...options]}
      value="private"
      onValueChange={onValueChange}
    />,
  )
  fireEvent.click(screen.getByRole('button', { name: 'Team' }))
  expect(onValueChange).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Everyone' }))
  expect(onValueChange).toHaveBeenCalledWith('everyone')
  onValueChange.mockClear()
  rerender(
    <SegmentedControl
      label="Visibility"
      options={[...options]}
      value="private"
      onValueChange={onValueChange}
      disabled
    />,
  )
  fireEvent.click(screen.getByRole('button', { name: 'Everyone' }))
  expect(onValueChange).not.toHaveBeenCalled()
})

it('fills the width on a phone only, when asked', () => {
  render(
    <SegmentedControl
      label="Range"
      fill="narrow"
      size="sm"
      options={[
        { value: 'day', label: 'Day' },
        { value: 'week', label: 'Week' },
      ]}
      value="day"
    />,
  )
  expect(screen.getByRole('group', { name: 'Range' })).toHaveClass('grid', 'sm:inline-flex')
  expect(screen.getByRole('button', { name: 'Day' })).toHaveClass('h-6')
})

it('passes root props through, such as a context menu on the whole control', () => {
  const onContextMenu = vi.fn()
  render(
    <SegmentedControl
      label="Scope"
      options={[
        { value: 'mine', label: 'Mine' },
        { value: 'all', label: 'All' },
      ]}
      value="mine"
      onContextMenu={onContextMenu}
      aria-describedby="scope-help"
    />,
  )
  const group = screen.getByRole('group', { name: 'Scope' })
  expect(group).toHaveAttribute('aria-describedby', 'scope-help')
  fireEvent.contextMenu(group)
  expect(onContextMenu).toHaveBeenCalledOnce()
})
