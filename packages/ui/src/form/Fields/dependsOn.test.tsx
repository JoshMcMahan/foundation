// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { act } from '@testing-library/react'
import { renderInForm } from '../../test/form'
import DropdownField from './DropdownField'
import MultiDropdownField from './MultiDropdownField'

// A stand-in picker records the items each field hands it.
const received = vi.hoisted(() => ({ items: [] as unknown[] }))
vi.mock('../../components/Combobox', () => ({
  Combobox: (props: { items: unknown[] }) => {
    received.items = props.items
    return null
  },
  Autocomplete: () => null,
}))

const byRegion = {
  us: [{ label: 'Virginia', value: 'us-east' }],
  eu: [{ label: 'Frankfurt', value: 'eu-central' }],
}

const base = {
  label: 'Zone',
  labelPosition: 'top' as const,
  disabled: false,
}

describe('fields with depends_on', () => {
  it('DropdownField lists the options keyed by the current value it depends on', () => {
    renderInForm(
      <DropdownField
        {...base}
        field={{ type: 'dropdown', name: 'zone', depends_on: 'region', options: byRegion }}
      />,
      { region: 'eu' },
    )
    expect(received.items).toEqual(byRegion.eu)
  })

  it('MultiDropdownField lists the keyed options and resets on the value, not the path', async () => {
    const { form } = renderInForm(
      <MultiDropdownField
        {...base}
        field={{
          type: 'multi-dropdown',
          name: 'zones',
          depends_on: 'cluster.region',
          options: byRegion,
        }}
      />,
      { cluster: { region: 'us' }, zones: ['us-east'] },
    )
    expect(received.items).toEqual(byRegion.us)

    // A new object at the same path and value keeps the selection.
    act(() => form.setValue('cluster', { region: 'us' }))
    expect(form.getValues('zones')).toEqual(['us-east'])

    act(() => form.setValue('cluster', { region: 'eu' }))
    expect(received.items).toEqual(byRegion.eu)
    await vi.waitFor(() => expect(form.getValues('zones')).toEqual([]))
  })
})
