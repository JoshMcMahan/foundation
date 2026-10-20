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
})
