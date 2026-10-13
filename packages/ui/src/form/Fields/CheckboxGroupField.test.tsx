// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { fireEvent, screen } from '@testing-library/react'
import { renderInForm } from '../../test/form'
import CheckboxGroupField from './CheckboxGroupField'

describe('CheckboxGroupField', () => {
  it('checks numeric options by their text and keeps the picked ones numbers', () => {
    const { form } = renderInForm(
      <CheckboxGroupField
        labelPosition="top"
        missing={false}
        disabled={false}
        field={{ type: 'checkbox-group', name: 'sizes', options: [1, 2, 4] }}
        label="Sizes"
      />,
      { sizes: [2] },
    )
    expect(screen.getByRole('checkbox', { name: '2' })).toBeChecked()
    fireEvent.click(screen.getByRole('checkbox', { name: '4' }))
    expect(form.getValues('sizes')).toEqual([2, 4])
  })
})
