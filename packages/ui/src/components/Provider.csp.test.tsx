// @vitest-environment jsdom
// Its own file: React keeps a hoisted <style> in the head for the life of the
// document, so a select opened by another test would leave one behind.
import '@testing-library/jest-dom/vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { UIProvider } from './Provider'
import { Select } from './Select'

describe('UIProvider under a same-origin style policy', () => {
  it('opens a select without injecting an inline style the policy would block', async () => {
    render(
      <UIProvider>
        <Select
          aria-label="Mode"
          items={[
            { value: 'ask', label: 'Ask' },
            { value: 'auto', label: 'Auto' },
          ]}
          defaultValue="auto"
        />
      </UIProvider>,
    )
    fireEvent.click(screen.getByRole('combobox', { name: 'Mode' }))
    await screen.findByRole('option', { name: 'Auto' })
    expect(document.querySelector('style')).toBeNull()
  })
})
