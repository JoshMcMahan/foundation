// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { fireEvent, screen } from '@testing-library/react'
import { renderInForm } from '../../test/form'
import RadioField from './RadioField'

const baseProps = {
  labelPosition: 'top' as const,
  missing: false,
  disabled: false,
}

describe('RadioField', () => {
  it('capitalizes an option without a label, and shows a label as written', () => {
    const { form } = renderInForm(
      <RadioField
        {...baseProps}
        field={{
          type: 'radio',
          name: 'precision',
          options: ['fp16', { label: 'Double', value: 'fp64' }],
        }}
        label="Precision"
      />,
      { precision: 'fp16' },
    )
    expect(screen.getByRole('radio', { name: 'fp16' })).toBeChecked()
    expect(screen.getByText('fp16')).toHaveClass('capitalize')
    expect(screen.getByText('Double')).not.toHaveClass('capitalize')
    fireEvent.click(screen.getByRole('radio', { name: 'Double' }))
    expect(form.getValues('precision')).toBe('fp64')
  })

  it('checks numeric options by their text and picks them as numbers', () => {
    const { form } = renderInForm(
      <RadioField
        {...baseProps}
        field={{ type: 'radio', name: 'workers', options: [1, 2, 4] }}
        label="Workers"
      />,
      { workers: 4 },
    )
    expect(screen.getByRole('radio', { name: '4' })).toBeChecked()
    fireEvent.click(screen.getByRole('radio', { name: '2' }))
    expect(form.getValues('workers')).toBe(2)
    expect(screen.getByRole('radio', { name: '2' })).toBeChecked()
  })

  it('names the group by its label and marks it missing or disabled', () => {
    renderInForm(
      <RadioField
        {...baseProps}
        missing
        disabled
        field={{ type: 'radio', name: 'size', options: ['small', 'large'] }}
        label="Size"
      />,
    )
    expect(screen.getByRole('radiogroup', { name: 'Size' })).toBeInTheDocument()
    for (const radio of screen.getAllByRole('radio')) {
      expect(radio).toHaveAttribute('aria-invalid', 'true')
      expect(radio).toHaveAttribute('aria-disabled', 'true')
    }
  })
})
