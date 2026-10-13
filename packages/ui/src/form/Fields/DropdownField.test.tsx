// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { screen } from '@testing-library/react'
import { renderInForm } from '../../test/form'
import type { FieldComponentProps } from '../types/fieldComponentTypes'
import DropdownField, { type IDropdownField } from './DropdownField'

describe('DropdownField', () => {
  const props: FieldComponentProps<IDropdownField> = {
    field: {
      type: 'dropdown',
      name: 'provisioningMode',
      label: 'Provisioning Mode',
      options: [{ label: 'Controller NAT', value: 'controller-nat' }],
    },
    label: 'Provisioning Mode',
    labelPosition: 'top',
    missing: false,
    disabled: false,
  }

  it('names the combobox from the label so it is addressable by role', () => {
    renderInForm(<DropdownField {...props} />)

    expect(screen.getByRole('combobox', { name: 'Provisioning Mode' })).toBeInTheDocument()
  })
})
