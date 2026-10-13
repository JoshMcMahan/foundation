// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { openTooltip } from '../test/tooltip'
import { Select, type SelectItem } from './Select'
import { TooltipProvider } from './Tooltip'

const modes: SelectItem<string>[] = [
  { value: 'ask', label: 'Ask', description: 'Asks before every change' },
  { value: 'auto', label: 'Auto', description: 'Changes files without asking' },
  { value: 'locked', label: 'Locked', disabled: true },
]

function Chip({ initial = 'ask' }: { initial?: string }) {
  const [value, setValue] = useState<string | null>(initial)
  return (
    <Select
      aria-label="Mode"
      items={modes}
      value={value}
      onValueChange={setValue}
      triggerTooltip="How the agent edits files"
      trigger={
        <button type="button" className="chip">
          {modes.find((m) => m.value === value)?.label ?? value}
        </button>
      }
    />
  )
}

describe('Select', () => {
  it('shows the selected label in its own trigger', () => {
    render(<Select aria-label="Mode" items={modes} defaultValue="auto" />)
    expect(screen.getByRole('combobox', { name: 'Mode' })).toHaveTextContent('Auto')
  })

  it('reports the item a person moves to, then nothing once the list closes', async () => {
    const onItemHighlighted = vi.fn()
    render(
      <Select
        aria-label="Theme"
        items={modes}
        defaultValue="ask"
        onItemHighlighted={onItemHighlighted}
      />,
    )
    fireEvent.click(screen.getByRole('combobox', { name: 'Theme' }))
    const auto = await screen.findByRole('option', { name: /Auto/ })
    // The list opens on the chosen item; the arrow moves on to the next.
    await waitFor(() => expect(onItemHighlighted).toHaveBeenLastCalledWith('ask'))
    fireEvent.keyDown(document.activeElement ?? auto, { key: 'ArrowDown' })
    await waitFor(() => expect(onItemHighlighted).toHaveBeenLastCalledWith('auto'))
    fireEvent.keyDown(auto, { key: 'Escape' })
    await waitFor(() => expect(onItemHighlighted).toHaveBeenLastCalledWith(undefined))
  })
})

describe('Select with a button trigger', () => {
  it('renders the caller’s button, keeping its content and classes', () => {
    render(<Chip />)
    const trigger = screen.getByRole('combobox', { name: 'Mode' })
    expect(trigger.tagName).toBe('BUTTON')
    expect(trigger).toHaveClass('chip')
    expect(trigger).toHaveTextContent('Ask')
  })

  it('lists descriptions under labels and picks an option', async () => {
    render(<Chip />)
    const trigger = screen.getByRole('combobox', { name: 'Mode' })
    fireEvent.click(trigger)
    const auto = await screen.findByRole('option', { name: /Auto/ })
    expect(auto).toHaveTextContent('Changes files without asking')
    expect(screen.getByRole('option', { name: 'Locked' })).toHaveAttribute('aria-disabled', 'true')
    // Base UI commits a mouse click only when the press started on the option.
    fireEvent.pointerDown(auto)
    fireEvent.click(auto)
    await waitFor(() => expect(trigger).toHaveTextContent('Auto'))
  })

  it('lets the caller label a value no option has', () => {
    render(<Chip initial="custom-mode" />)
    expect(screen.getByRole('combobox', { name: 'Mode' })).toHaveTextContent('custom-mode')
  })

  it('shows its hint on focus', async () => {
    render(
      <TooltipProvider>
        <Chip />
      </TooltipProvider>,
    )
    act(() => screen.getByRole('combobox', { name: 'Mode' }).focus())
    await waitFor(() => expect(openTooltip()).toHaveTextContent('How the agent edits files'))
  })
})
