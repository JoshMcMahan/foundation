// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { optionsOf } from '../test/combobox'
import { type Suggestion, SuggestionInput, suggestionItems } from './SuggestionInput'

afterEach(cleanup)

const SUGGESTIONS: Suggestion[] = [
  { value: 'always', label: 'Always, even after a failure' },
  { value: 'never' },
]

function Field({ onChange }: { onChange: (value: string) => void }) {
  const [value, setValue] = useState('')
  return (
    <SuggestionInput
      aria-label="When to run"
      placeholder="Runs when the steps before it succeed"
      value={value}
      suggestions={SUGGESTIONS}
      onValueChange={(next) => {
        setValue(next)
        onChange(next)
      }}
    />
  )
}

describe('SuggestionInput', () => {
  it('shows a labelled suggestion by its meaning, with the value it writes beneath', () => {
    expect(suggestionItems(SUGGESTIONS)).toEqual([
      { value: 'always', label: 'Always, even after a failure', description: 'always' },
      { value: 'never', label: 'never' },
    ])
  })

  it('takes any typed value', () => {
    const onChange = vi.fn()
    render(<Field onChange={onChange} />)
    const field = screen.getByRole('combobox', { name: 'When to run' })
    expect(field).toHaveAttribute('placeholder', 'Runs when the steps before it succeed')
    fireEvent.change(field, { target: { value: 'failure()' } })
    expect(onChange).toHaveBeenLastCalledWith('failure()')
  })

  it('offers its suggestions as it is typed', async () => {
    render(<Field onChange={vi.fn()} />)
    expect(await optionsOf(screen.getByRole('combobox', { name: 'When to run' }))).toEqual([
      { label: 'Always, even after a failure', description: 'always' },
      { label: 'never' },
    ])
  })
})
