// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { makeStaticAdapter, StoryChat } from '../stories/harness'
import AllocationSelector from './AllocationSelector'

describe('AllocationSelector', () => {
  it('starts on the first allocation it can charge and lists the others as they are', async () => {
    const adapter = makeStaticAdapter({
      providers: [{ id: 'p-1', name: 'pool', user: 'org', cspKind: 'other', status: 'active' }],
      allocations: [
        { name: 'archive', total: 200, used: 200, description: 'Budget spent', disabled: true },
        { name: 'research', total: 500, used: 120, description: '$120 / $500 USD' },
      ],
    })
    render(
      <StoryChat adapter={adapter}>
        <AllocationSelector />
      </StoryChat>,
    )

    const trigger = await screen.findByRole('combobox', { name: 'Allocation' })
    await vi.waitFor(() => expect(trigger).toHaveTextContent('research'))
    fireEvent.click(trigger)
    const list = await screen.findByRole('listbox')
    expect(within(list).getByRole('option', { name: /archive/ })).toHaveAttribute(
      'aria-disabled',
      'true',
    )
    expect(within(list).getByText('$120 / $500 USD')).toBeInTheDocument()
  })
})
