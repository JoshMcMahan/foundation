// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { type Suggestion, SuggestionInput, suggestionOptions } from './SuggestionInput'

global.ResizeObserver = class implements ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

afterEach(cleanup)

const SUGGESTIONS: Suggestion[] = [
  { value: 'always', label: 'Always, even after a failure' },
  { value: 'never' },
]

function Field({ onChange }: { onChange: (value: string) => void }) {
  const [value, setValue] = useState('')
  return (
    <SuggestionInput
      ariaLabel="When to run"
      placeholder="Runs when the steps before it succeed"
      value={value}
      suggestions={SUGGESTIONS}
      onChange={(next) => {
        setValue(next)
        onChange(next)
      }}
    />
  )
}

describe('SuggestionInput', () => {
  it('offers each suggestion as an option, with the value under its meaning', () => {
    expect(suggestionOptions(SUGGESTIONS)).toEqual([
      {
        label: 'Always, even after a failure',
        value: 'always',
        description: 'always',
      },
      'never',
    ])
  })

  it('is the codebase dropdown, taking any typed value and its own props', () => {
    const onChange = vi.fn()
    render(<Field onChange={onChange} />)
    const field = screen.getByRole('combobox', { name: 'When to run' })
    expect(field).toHaveAttribute('placeholder', 'Runs when the steps before it succeed')
    expect(screen.getByTestId('combobox')).toBeInTheDocument()
    fireEvent.change(field, { target: { value: 'failure()' } })
    fireEvent.blur(field)
    expect(onChange).toHaveBeenLastCalledWith('failure()')
  })
})
