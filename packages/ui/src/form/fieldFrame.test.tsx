// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { screen } from '@testing-library/react'
import type React from 'react'
import { renderInForm } from '../test/form'
import CheckboxGroupField from './Fields/CheckboxGroupField'
import DurationField from './Fields/DurationField'
import RadioField from './Fields/RadioField'
import StringField from './Fields/StringField'
import TextAreaField from './Fields/TextAreaField'

const baseProps = {
  labelPosition: 'top' as const,
  disabled: false,
}

const renderField = (node: React.ReactElement) => renderInForm(node, { testField: '' })

describe('a form field’s frame', () => {
  it('links the label to the input it wraps', () => {
    renderField(
      <StringField
        {...baseProps}
        field={{ type: 'string', name: 'testField' }}
        label="Display name"
      />,
    )

    const input = screen.getByLabelText(/Display name/) as HTMLInputElement
    expect(input.tagName).toBe('INPUT')
    expect(input.id).not.toBe('')
    const label = input.labels?.[0]
    expect(label).toHaveTextContent('Display name')
    expect(label).toHaveAttribute('for', input.id)
  })

  it('points aria-describedby at the description text', () => {
    renderField(
      <TextAreaField
        {...baseProps}
        field={{
          type: 'textarea',
          name: 'testField',
          description: 'Shown under the field',
        }}
        label="Notes"
      />,
    )

    const textarea = screen.getByLabelText(/Notes/)
    const describedBy = textarea.getAttribute('aria-describedby')
    expect(describedBy).toBeTruthy()
    expect(document.getElementById(describedBy as string)).toHaveTextContent(
      'Shown under the field',
    )
  })

  it('names the radio group with the field label', () => {
    renderField(
      <RadioField
        {...baseProps}
        field={{ type: 'radio', name: 'testField', options: ['a', 'b'] }}
        label="Target type"
      />,
    )

    expect(screen.getByRole('radiogroup', { name: 'Target type' })).toBeInTheDocument()
  })
})

describe('a form field’s required mark', () => {
  const requiredMark = () => screen.queryByText('*')

  it('treats an unevaluated optional expression as required', () => {
    renderField(
      <StringField
        {...baseProps}
        field={{
          type: 'string',
          name: 'testField',
          optional: '${{ needs.setup.outputs.skip }}',
        }}
        label="Region"
      />,
    )
    expect(requiredMark()).toBeInTheDocument()
  })

  it('drops the mark for an optional field', () => {
    renderField(
      <StringField
        {...baseProps}
        field={{ type: 'string', name: 'testField', optional: true }}
        label="Region"
      />,
    )
    expect(requiredMark()).not.toBeInTheDocument()
  })
})

describe('a field with an error', () => {
  const invalid = { ...baseProps, error: 'Enter a value.' }

  it('marks a text input invalid and shows the message, described by it', () => {
    renderField(
      <StringField {...invalid} field={{ type: 'string', name: 'testField' }} label="Region" />,
    )
    const input = screen.getByRole('textbox', { name: /Region/ })
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(input).toHaveAccessibleDescription('Enter a value.')
  })

  it('marks a duration invalid', () => {
    renderField(
      <DurationField {...invalid} field={{ type: 'duration', name: 'testField' }} label="Wait" />,
    )
    expect(screen.getByRole('textbox', { name: /Wait/ })).toHaveAttribute('aria-invalid', 'true')
  })

  it('marks a group of checkboxes invalid', () => {
    renderField(
      <CheckboxGroupField
        {...invalid}
        field={{ type: 'checkbox-group', name: 'testField', options: ['a', 'b'] }}
        label="Zones"
      />,
    )
    expect(screen.getByRole('group', { name: /Zones/ })).toHaveAttribute('aria-invalid', 'true')
    for (const box of screen.getAllByRole('checkbox')) {
      expect(box).toHaveAttribute('aria-invalid', 'true')
    }
  })
})
