// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import type { FieldComponentProps } from '../types/fieldComponentTypes'
import DropdownField, { type IDropdownField } from './DropdownField'

global.ResizeObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}))

describe('DropdownField', () => {
  const props: FieldComponentProps<IDropdownField, string> = {
    field: {
      type: 'dropdown',
      name: 'provisioningMode',
      label: 'Provisioning Mode',
      options: [{ label: 'Controller NAT', value: 'controller-nat' }],
    },
    label: 'Provisioning Mode',
    labelPosition: 'top',
    missing: false,
    missingFields: [],
    values: {},
    disabled: false,
    setFormDirty: vi.fn(),
    currentValue: '',
    setFieldValue: vi.fn(),
    setFieldTouched: vi.fn(),
  }

  it('names the combobox from the label so it is addressable by role', () => {
    render(<DropdownField {...props} />)

    expect(screen.getByRole('combobox', { name: 'Provisioning Mode' })).toBeInTheDocument()
  })
})
