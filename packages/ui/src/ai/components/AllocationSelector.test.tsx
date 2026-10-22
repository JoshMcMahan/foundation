// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { SWRConfig } from 'swr'
import { mockListLayout } from '../../test/layout'
import { makeStaticAdapter, StoryChat } from '../stories/harness'
import type { Allocation } from '../types'
import AllocationSelector from './AllocationSelector'

async function openPicker(allocations: Allocation[], selected: string) {
  const adapter = makeStaticAdapter({
    providers: [{ id: 'p-1', name: 'pool', user: 'org', cspKind: 'other', status: 'active' }],
    allocations,
  })
  // A fresh cache, or each test sees the allocations the one before it loaded.
  render(
    <SWRConfig value={{ provider: () => new Map() }}>
      <StoryChat adapter={adapter}>
        <AllocationSelector />
      </StoryChat>
    </SWRConfig>,
  )
  const trigger = await screen.findByRole('combobox', { name: /^Allocation/ })
  await vi.waitFor(() => expect(trigger).toHaveTextContent(selected))
  fireEvent.click(trigger)
  return screen.findByRole('listbox')
}

describe('AllocationSelector', () => {
  // The list is virtual and draws no rows without a size.
  let restoreLayout: () => void
  beforeAll(() => {
    restoreLayout = mockListLayout()
  })
  afterAll(() => restoreLayout())

  it('starts on the first allocation it can charge and lists the others as they are', async () => {
    const list = await openPicker(
      [
        { name: 'archive', total: 200, used: 200, description: 'Budget spent', disabled: true },
        { name: 'research', total: 500, used: 120, description: '$120 / $500 USD' },
      ],
      'research',
    )
    expect(within(list).getByRole('option', { name: /archive/ })).toHaveAttribute(
      'aria-disabled',
      'true',
    )
    expect(within(list).getByText('$120 / $500 USD')).toBeInTheDocument()
  })

  it('narrows the list to the allocations whose name matches the search', async () => {
    const list = await openPicker(
      [
        { name: 'research', total: 500 },
        { name: 'teaching', total: 100 },
        { name: 'research-gpu', total: 900 },
      ],
      'research',
    )
    fireEvent.change(screen.getByPlaceholderText('Search allocations…'), {
      target: { value: 'gpu' },
    })
    await vi.waitFor(() =>
      expect(
        within(list)
          .getAllByRole('option')
          .map((o) => o.textContent),
      ).toEqual(['research-gpu']),
    )
  })
})
