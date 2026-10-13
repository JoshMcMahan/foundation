// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import type { ComboboxItems } from './Combobox'
import { CreateModalSelect } from './CreateModal'

// jsdom has no layout, so the virtual list would measure its scroller as empty and draw no rows.
beforeAll(() => {
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(240)
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(240)
})

const items: ComboboxItems<string> = [
  { label: 'Workspace', items: [{ label: 'User Workspace', value: 'user-workspace' }] },
  {
    label: 'alpha',
    items: [
      { label: 'Login node', value: 'login:alpha' },
      { label: 'alpha-env-0', value: 'env:alpha:0' },
    ],
  },
  {
    label: 'beta',
    items: [
      { label: 'Login node', value: 'login:beta' },
      { label: 'beta-env-0', value: 'env:beta:0' },
    ],
  },
]

const setup = (props: Partial<Parameters<typeof CreateModalSelect>[0]> = {}) => {
  const onValueChange = vi.fn()
  render(
    <CreateModalSelect
      label="Target"
      value="user-workspace"
      items={items}
      onValueChange={onValueChange}
      {...props}
    />,
  )
  return onValueChange
}

const open = () => {
  fireEvent.click(screen.getByRole('combobox', { name: 'Target' }))
  return screen.findByRole('listbox')
}

describe('CreateModalSelect', () => {
  it('shows the selection on the pill', () => {
    setup()
    expect(screen.getByRole('combobox', { name: 'Target' })).toHaveTextContent('User Workspace')
  })

  it('keeps a value the list no longer offers on the pill', () => {
    setup({ value: 'stale-region' })
    expect(screen.getByRole('combobox', { name: 'Target' })).toHaveTextContent('stale-region')
  })

  it('lists every group and picks the clicked item', async () => {
    const onValueChange = setup()
    const list = await open()
    expect(within(list).getAllByRole('option', { name: 'Login node' })).toHaveLength(2)
    fireEvent.click(within(list).getByRole('option', { name: 'beta-env-0' }))
    expect(onValueChange).toHaveBeenCalledWith('env:beta:0')
  })

  it('filters by the group an item sits under', async () => {
    setup()
    const list = await open()
    fireEvent.change(screen.getByPlaceholderText('Filter'), {
      target: { value: 'beta' },
    })
    expect(within(list).getByRole('option', { name: 'beta-env-0' })).toBeInTheDocument()
    expect(within(list).queryByRole('option', { name: 'alpha-env-0' })).not.toBeInTheDocument()
  })

  it('stays closed and explains why while disabled', () => {
    setup({ disabled: true, disabledReason: 'Pick a cluster first' })
    const pill = screen.getByRole('button', { name: 'Target' })
    expect(pill).toHaveAttribute('aria-disabled', 'true')
    fireEvent.click(pill)
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })
})
