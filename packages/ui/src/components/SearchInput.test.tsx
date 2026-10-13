// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { SearchInput } from './SearchInput'

function Search({ onEscape }: { onEscape?: () => void }) {
  const [value, setValue] = useState('')
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: stands in for a dialog that closes on Escape.
    <div onKeyDown={(e) => e.key === 'Escape' && onEscape?.()}>
      <SearchInput label="Filter runs" value={value} onValueChange={setValue} />
    </div>
  )
}

describe('SearchInput', () => {
  it('is a search box named by its label, which is also its placeholder', () => {
    render(<Search />)
    expect(screen.getByRole('searchbox', { name: 'Filter runs' })).toHaveAttribute(
      'placeholder',
      'Filter runs',
    )
  })

  it('clears with its button, which shows only while there is text', () => {
    render(<Search />)
    const box = screen.getByRole('searchbox')
    expect(screen.queryByRole('button', { name: 'Clear search' })).toBeNull()
    fireEvent.change(box, { target: { value: 'nightly' } })
    fireEvent.click(screen.getByRole('button', { name: 'Clear search' }))
    expect(box).toHaveValue('')
  })

  it('empties on Escape before Escape reaches what holds it', () => {
    const onEscape = vi.fn()
    render(<Search onEscape={onEscape} />)
    const box = screen.getByRole('searchbox')
    fireEvent.change(box, { target: { value: 'nightly' } })
    fireEvent.keyDown(box, { key: 'Escape' })
    expect(box).toHaveValue('')
    expect(onEscape).not.toHaveBeenCalled()
    fireEvent.keyDown(box, { key: 'Escape' })
    expect(onEscape).toHaveBeenCalledOnce()
  })
})
