// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { screen, waitFor } from '@testing-library/react'
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
    disabled: false,
  }

  it('names the combobox from the label so it is addressable by role', () => {
    renderInForm(<DropdownField {...props} />)

    expect(screen.getByRole('combobox', { name: 'Provisioning Mode' })).toBeInTheDocument()
  })

  it('sets its secondary field from a grouped choice', async () => {
    const { form } = renderInForm(
      <DropdownField
        {...props}
        field={{
          type: 'dropdown',
          name: 'region',
          label: 'Region',
          secondaryField: 'zone',
          options: [
            {
              category: 'Americas',
              options: [{ label: 'East', value: 'east', secondaryValue: 'east-1' }],
            },
          ],
        }}
      />,
    )
    // The only choice is picked for the field, and sets the zone it names.
    await waitFor(() => expect(form.getValues()).toMatchObject({ region: 'east', zone: 'east-1' }))
  })
})
