// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { openTooltip } from '../test/tooltip'
import { Field } from './Field'
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

const teams: SelectItem<string>[] = [
  { value: '', label: 'All teams' },
  { value: 'PLAT', label: 'Platform engineering' },
  { value: 'MOB', label: 'Mobile apps' },
]

// The trigger's shown text, not the hidden labels that size it, and whether it reads as a
// placeholder.
function shownText(name: string) {
  const trigger = screen.getByRole('combobox', { name })
  const shown = [...trigger.querySelectorAll('span')].find(
    (span) =>
      !span.closest('[aria-hidden="true"]') && span.children.length === 0 && span.textContent,
  )
  if (!shown) {
    throw new Error('nothing shown')
  }
  return {
    text: shown.textContent,
    placeholder:
      shown.closest(
        '[class~="text-(--theme-placeholder)"], [data-placeholder][class~="data-placeholder:text-(--theme-placeholder)"]',
      ) !== null,
  }
}

describe('Select', () => {
  it.each(['content', 'fill'] as const)(
    'shows a chosen option whose value is empty as a choice, not a placeholder (%s)',
    (width) => {
      render(
        <Select aria-label="Team" items={teams} value="" width={width} placeholder="Pick a team" />,
      )
      expect(shownText('Team')).toEqual({ text: 'All teams', placeholder: false })
    },
  )

  it.each(['content', 'fill'] as const)(
    'shows the placeholder, in its color, for a value no option has (%s)',
    (width) => {
      render(
        <Select
          aria-label="Team"
          items={teams.slice(1)}
          value=""
          width={width}
          placeholder="Pick a team"
        />,
      )
      expect(shownText('Team')).toEqual({ text: 'Pick a team', placeholder: true })
    },
  )

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

describe('Select options', () => {
  it('lay out as a Combobox’s do: label over description, the check at the end', async () => {
    render(<Select aria-label="Mode" items={modes} defaultValue="ask" />)
    fireEvent.click(screen.getByRole('combobox', { name: 'Mode' }))
    const option = await screen.findByRole('option', { name: 'Ask' })
    expect(option).toHaveAccessibleDescription('Asks before every change')
    const [text, indicator] = [...option.children]
    expect(text).toHaveTextContent('AskAsks before every change')
    expect(indicator?.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
  })
})

describe('Select sizing, reasons and keys', () => {
  it('sizes to its longest label alone, and fills its row in a Field', () => {
    const { unmount } = render(<Select aria-label="Mode" items={modes} defaultValue="ask" />)
    const alone = screen.getByRole('combobox', { name: 'Mode' })
    expect(alone).toHaveClass('w-fit')
    // Every label sits unseen in the field, so its width holds as the choice changes.
    expect(alone).toHaveTextContent('AskAskAutoLocked')
    unmount()
    render(
      <Field label="Mode">
        <Select items={modes} defaultValue="ask" />
      </Field>,
    )
    expect(screen.getByRole('combobox', { name: 'Mode' })).not.toHaveClass('w-fit')
  })

  it('keeps its content width in a row, rather than shrinking and cutting off its choice', () => {
    render(
      <div className="flex">
        <Select aria-label="Mode" items={modes} defaultValue="ask" width="content" />
        <Select aria-label="Fill" items={modes} defaultValue="ask" width="fill" />
      </div>,
    )
    expect(screen.getByRole('combobox', { name: 'Mode' })).toHaveClass('shrink-0', 'max-w-full')
    expect(screen.getByRole('combobox', { name: 'Fill' })).not.toHaveClass('shrink-0')
  })

  it('says why it is disabled, staying focusable and shut', async () => {
    render(
      <TooltipProvider>
        <Select
          aria-label="Key type"
          items={modes}
          defaultValue="ask"
          disabled
          disabledReason="Set by the platform"
        />
      </TooltipProvider>,
    )
    const trigger = screen.getByRole('combobox', { name: 'Key type' })
    expect(trigger).toHaveAttribute('aria-disabled', 'true')
    expect(trigger).toHaveAccessibleDescription('Set by the platform')
    act(() => trigger.focus())
    expect(trigger).toHaveFocus()
    await waitFor(() => expect(openTooltip()).toHaveTextContent('Set by the platform'))
    fireEvent.click(trigger)
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  it('passes keys on its trigger to the host', () => {
    const onKeyDown = vi.fn()
    render(<Select aria-label="Mode" items={modes} onKeyDown={onKeyDown} />)
    fireEvent.keyDown(screen.getByRole('combobox', { name: 'Mode' }), { key: 'k' })
    expect(onKeyDown).toHaveBeenCalledTimes(1)
  })

  it('reads a row by its label and then its hint', async () => {
    render(
      <Select
        aria-label="Team"
        items={[
          { value: 'plat', label: 'Platform', hint: 'PLT' },
          { value: 'des', label: 'Design', hint: 'DES' },
        ]}
      />,
    )
    fireEvent.click(screen.getByRole('combobox', { name: 'Team' }))
    expect(await screen.findByRole('option', { name: 'Design DES' })).toBeInTheDocument()
  })
})
