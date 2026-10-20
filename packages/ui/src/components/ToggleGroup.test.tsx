// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { UIProvider } from './Provider'
import { ToggleGroup, type ToggleGroupProps } from './ToggleGroup'

type State = 'running' | 'failed' | 'done'

const options = [
  { value: 'running', label: 'Running', count: 3 },
  { value: 'failed', label: 'Failed', count: 1200 },
  { value: 'done', label: 'Done' },
] as const

function Filter(props: Partial<ToggleGroupProps<State>> & { initial?: State[] }) {
  const [value, setValue] = useState<State[]>(props.initial ?? [])
  return (
    <>
      <ToggleGroup
        label="State"
        options={options}
        value={value}
        {...props}
        onValueChange={(next) => {
          setValue(next)
          props.onValueChange?.(next)
        }}
      />
      <output>{value.join(',')}</output>
    </>
  )
}

const button = (name: RegExp) => screen.getByRole('button', { name })

describe('ToggleGroup', () => {
  it('names the group and adds and removes options in the order they are listed', () => {
    render(<Filter />)
    expect(screen.getByRole('group', { name: 'State' })).toBeInTheDocument()
    fireEvent.click(button(/Done/))
    fireEvent.click(button(/Running/))
    expect(screen.getByRole('status')).toHaveTextContent('running,done')
    expect(button(/Running/)).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(button(/Running/))
    expect(screen.getByRole('status')).toHaveTextContent(/^done$/)
    expect(button(/Running/)).toHaveAttribute('aria-pressed', 'false')
  })

  it('replaces the pressed option, or clears it, when only one is allowed', () => {
    render(<Filter multiple={false} initial={['running']} />)
    fireEvent.click(button(/Failed/))
    expect(screen.getByRole('status')).toHaveTextContent(/^failed$/)
    fireEvent.click(button(/Failed/))
    expect(screen.getByRole('status')).toHaveTextContent(/^$/)
  })

  it('keeps a toggle still on hover and rings it inside, so nothing clips it', () => {
    render(<Filter initial={['running']} />)
    const running = button(/Running/)
    expect(running).toHaveAttribute('aria-pressed')
    // Every lift class skips an element with aria-pressed, which each toggle has.
    const lifts = running.className.split(' ').filter((c) => c.includes('translate-y-px'))
    expect(lifts.length).toBeGreaterThan(0)
    for (const lift of lifts) {
      expect(lift).toContain('not-[[aria-pressed]]')
    }
    expect(running).toHaveClass('focus-visible:-outline-offset-2', 'border')
  })

  it('names its All option as the host says, such as what it covers', () => {
    render(<Filter all allLabel="All states" initial={[]} />)
    expect(button(/^All states$/)).toHaveAttribute('aria-pressed', 'true')
  })

  it('presses All while nothing else is, and clears the others when it is pressed', () => {
    render(<Filter all={{ count: 42 }} initial={['running', 'failed']} />)
    const all = button(/^All/)
    expect(all).toHaveTextContent('All42')
    expect(all).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(all)
    expect(screen.getByRole('status')).toHaveTextContent(/^$/)
    expect(all).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(all)
    expect(all).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(button(/Done/))
    expect(screen.getByRole('status')).toHaveTextContent(/^done$/)
    expect(all).toHaveAttribute('aria-pressed', 'false')
  })

  it('takes the All label from the strings', () => {
    render(
      <UIProvider strings={{ common: { all: 'Todos' } }}>
        <Filter all />
      </UIProvider>,
    )
    expect(button(/Todos/)).toHaveAttribute('aria-pressed', 'true')
  })

  it('shows counts in the reader’s locale, compactly', () => {
    render(<Filter />)
    expect(button(/Running/)).toHaveTextContent('Running3')
    expect(button(/Failed/)).toHaveTextContent('Failed1.2K')
  })

  it('moves between options with the arrow keys, wrapping at the ends', async () => {
    render(<Filter />)
    const running = button(/Running/)
    act(() => running.focus())
    fireEvent.keyDown(running, { key: 'ArrowRight' })
    await waitFor(() => expect(button(/Failed/)).toHaveFocus())
    fireEvent.keyDown(button(/Failed/), { key: 'ArrowRight' })
    fireEvent.keyDown(button(/Done/), { key: 'ArrowRight' })
    await waitFor(() => expect(running).toHaveFocus())
  })

  it('does not press a disabled option', () => {
    const onValueChange = vi.fn()
    render(
      <ToggleGroup
        label="State"
        options={[{ value: 'a', label: 'A', disabled: true }]}
        value={[]}
        onValueChange={onValueChange}
      />,
    )
    expect(button(/A/)).toBeDisabled()
    fireEvent.click(button(/A/))
    expect(onValueChange).not.toHaveBeenCalled()
  })
})

describe('ToggleGroup chrome', () => {
  it('passes its description through and sets All apart from the options', () => {
    render(
      <>
        <p id="summary">2 of 3 states</p>
        <Filter all aria-describedby="summary" />
      </>,
    )
    expect(screen.getByRole('group', { name: 'State' })).toHaveAccessibleDescription(
      '2 of 3 states',
    )
    const all = screen.getByRole('button', { name: /All/ })
    expect(all.nextElementSibling).toHaveAttribute('aria-hidden', 'true')
  })
})
