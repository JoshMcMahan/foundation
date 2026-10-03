// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { render } from '@testing-library/react'
import { Formik } from 'formik'
import type { FieldComponentProps } from '../types/fieldComponentTypes'
import DropdownField, { type IDropdownField } from './DropdownField'
import MultiDropdownField, { type IMultiDropdownField } from './MultiDropdownField'

// The real lists are virtualized and render no rows without layout, so these
// stand-ins record what each field hands them.
const received = vi.hoisted(() => ({ options: [] as unknown[], parentValue: undefined as unknown }))
vi.mock('../SpecialTypes', () => ({
  FormikCustomDropdown: (props: { options: unknown[] }) => {
    received.options = props.options
    return null
  },
}))
vi.mock('../Form', () => ({
  MultiSelectionDropdown: (props: { options: unknown[]; parentValue?: unknown }) => {
    received.options = props.options
    received.parentValue = props.parentValue
    return null
  },
}))

const byRegion = {
  us: [{ label: 'Virginia', value: 'us-east' }],
  eu: [{ label: 'Frankfurt', value: 'eu-central' }],
}

const base = {
  label: 'Zone',
  labelPosition: 'top' as const,
  missing: false,
  missingFields: [],
  disabled: false,
  setFormDirty: vi.fn(),
}

describe('fields with depends_on', () => {
  it('DropdownField lists the options keyed by the current value it depends on', () => {
    const props: FieldComponentProps<IDropdownField, string> = {
      ...base,
      field: { type: 'dropdown', name: 'zone', depends_on: 'region', options: byRegion },
      values: { region: 'eu' },
      currentValue: '',
      setFieldValue: vi.fn(),
      setFieldTouched: vi.fn(),
    }
    render(<DropdownField {...props} />)
    expect(received.options).toEqual(byRegion.eu)
  })

  it('MultiDropdownField lists the keyed options and resets on the value, not the path', () => {
    const props: FieldComponentProps<IMultiDropdownField> = {
      ...base,
      field: {
        type: 'multi-dropdown',
        name: 'zones',
        depends_on: 'cluster.region',
        options: byRegion,
      },
      values: { cluster: { region: 'us' } },
      currentValue: [],
    }
    render(
      <Formik initialValues={{}} onSubmit={vi.fn()}>
        <MultiDropdownField {...props} />
      </Formik>,
    )
    expect(received.options).toEqual(byRegion.us)
    expect(received.parentValue).toBe('us')
  })
})
