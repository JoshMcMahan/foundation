// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { ListboxGroup, ListboxOption, ListboxPanel, useListboxNavigation } from './Listbox'

const commands = ['Heading', 'List', 'Quote', 'Code']

function Editor({
  onChoose = vi.fn(),
  onDismiss,
  homeEnd,
}: {
  onChoose?: (item: string) => void
  onDismiss?: () => void
  homeEnd?: boolean
}) {
  const list = useListboxNavigation({
    items: commands,
    onChoose,
    onDismiss,
    homeEnd,
    isDisabled: (item) => item === 'Quote',
  })
  return (
    <>
      <textarea
        aria-label="Body"
        {...list.hostProps}
        onKeyDown={(event) => {
          list.handleKey(event)
        }}
      />
      <ListboxPanel listProps={list.listProps} aria-label="Blocks" footer="Enter to insert">
        <ListboxGroup label="Basic">
          {commands.map((item, index) => (
            <ListboxOption key={item} option={list.optionProps(index)} label={item} hint="/" />
          ))}
        </ListboxGroup>
      </ListboxPanel>
    </>
  )
}

describe('useListboxNavigation', () => {
  it('points the focused box at the highlighted option', () => {
    render(<Editor />)
    const box = screen.getByRole('textbox', { name: 'Body' })
    const listbox = screen.getByRole('listbox', { name: 'Blocks' })
    expect(box).toHaveAttribute('aria-controls', listbox.id)
    const first = screen.getByRole('option', { name: /Heading/ })
    expect(box).toHaveAttribute('aria-activedescendant', first.id)
    expect(first).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('group', { name: 'Basic' })).toBeInTheDocument()
  })

  it('moves with the arrows and Ctrl-N/P, passing over a disabled option and looping', () => {
    render(<Editor />)
    const box = screen.getByRole('textbox', { name: 'Body' })
    const active = () => document.getElementById(box.getAttribute('aria-activedescendant') ?? '')
    fireEvent.keyDown(box, { key: 'ArrowDown' })
    expect(active()).toHaveTextContent('List')
    fireEvent.keyDown(box, { key: 'n', ctrlKey: true })
    expect(active()).toHaveTextContent('Code')
    fireEvent.keyDown(box, { key: 'ArrowDown' })
    expect(active()).toHaveTextContent('Heading')
    fireEvent.keyDown(box, { key: 'p', ctrlKey: true })
    expect(active()).toHaveTextContent('Code')
  })

  it('leaves Home and End to the caret unless asked', () => {
    const { unmount } = render(<Editor />)
    let box = screen.getByRole('textbox', { name: 'Body' })
    expect(fireEvent.keyDown(box, { key: 'End' })).toBe(true)
    unmount()
    render(<Editor homeEnd />)
    box = screen.getByRole('textbox', { name: 'Body' })
    expect(fireEvent.keyDown(box, { key: 'End' })).toBe(false)
    expect(
      document.getElementById(box.getAttribute('aria-activedescendant') ?? ''),
    ).toHaveTextContent('Code')
  })

  it('chooses with Enter, Tab or a click, and dismisses on Escape', () => {
    const onChoose = vi.fn()
    const onDismiss = vi.fn()
    render(<Editor onChoose={onChoose} onDismiss={onDismiss} />)
    const box = screen.getByRole('textbox', { name: 'Body' })
    fireEvent.keyDown(box, { key: 'Enter' })
    expect(onChoose).toHaveBeenLastCalledWith('Heading', 0)
    fireEvent.keyDown(box, { key: 'ArrowDown' })
    fireEvent.keyDown(box, { key: 'Tab' })
    expect(onChoose).toHaveBeenLastCalledWith('List', 1)
    fireEvent.click(screen.getByRole('option', { name: /Code/ }))
    expect(onChoose).toHaveBeenLastCalledWith('Code', 3)
    fireEvent.click(screen.getByRole('option', { name: /Quote/ }))
    expect(onChoose).toHaveBeenCalledTimes(3)
    fireEvent.keyDown(box, { key: 'Escape' })
    expect(onDismiss).toHaveBeenCalled()
    // Shift+Enter is a new line, not a choice.
    expect(fireEvent.keyDown(box, { key: 'Enter', shiftKey: true })).toBe(true)
  })

  it('dismisses on Escape while nothing matches, leaving the other keys to the box', () => {
    const onDismiss = vi.fn()
    function Search({ open = true }: { open?: boolean }) {
      const list = useListboxNavigation<string>({ items: [], onChoose: vi.fn(), onDismiss, open })
      return (
        <>
          <input aria-label="Find" {...list.hostProps} onKeyDown={(e) => list.handleKey(e)} />
          <ListboxPanel listProps={list.listProps} aria-label="Results" empty="No matches">
            {null}
          </ListboxPanel>
        </>
      )
    }
    const { rerender } = render(<Search />)
    const box = screen.getByRole('textbox', { name: 'Find' })
    expect(screen.getByText('No matches')).toBeInTheDocument()
    expect(fireEvent.keyDown(box, { key: 'ArrowDown' })).toBe(true)
    expect(fireEvent.keyDown(box, { key: 'Enter' })).toBe(true)
    expect(fireEvent.keyDown(box, { key: 'Escape' })).toBe(false)
    expect(onDismiss).toHaveBeenCalledTimes(1)
    // Closed, Escape is the host's again, such as to close a dialog.
    rerender(<Search open={false} />)
    expect(fireEvent.keyDown(box, { key: 'Escape' })).toBe(true)
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })
})

describe('ListboxOption', () => {
  function Labels({ hint }: { hint?: string }) {
    const items = ['Bug', 'Feature', 'More labels']
    const list = useListboxNavigation({ items, onChoose: vi.fn() })
    return (
      <ListboxPanel listProps={list.listProps} aria-label="Labels">
        <ListboxOption option={list.optionProps(0)} label="Bug" hint={hint} checked />
        <ListboxOption option={list.optionProps(1)} label="Feature" hint={hint} checked={false} />
        <ListboxOption option={list.optionProps(2)} label="More labels" submenu />
      </ListboxPanel>
    )
  }

  it('marks a checked option with the trailing check, and one that opens more with a chevron', () => {
    render(<Labels />)
    const bug = screen.getByRole('option', { name: 'Bug' })
    const feature = screen.getByRole('option', { name: 'Feature' })
    const more = screen.getByRole('option', { name: 'More labels' })
    expect(bug).toHaveAttribute('aria-checked', 'true')
    expect(bug).toHaveAttribute('data-checked')
    expect(bug.querySelectorAll('svg')).toHaveLength(1)
    expect(feature).toHaveAttribute('aria-checked', 'false')
    expect(feature).not.toHaveAttribute('data-checked')
    expect(feature.querySelector('svg')).toBeNull()
    expect(more).not.toHaveAttribute('aria-checked')
    expect(more.querySelectorAll('svg[aria-hidden="true"]')).toHaveLength(1)
  })

  it('keeps the check its place beside a hint, so hints line up', () => {
    render(<Labels hint="3" />)
    const slot = (name: string) =>
      screen.getByRole('option', { name: new RegExp(`^${name}`) }).querySelector('[class~="w-3.5"]')
    expect(slot('Bug')?.querySelector('svg')).not.toBeNull()
    expect(slot('Feature')).not.toBeNull()
    expect(slot('Feature')?.querySelector('svg')).toBeNull()
  })
})
