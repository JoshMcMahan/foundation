// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { screen } from '@testing-library/react'
import type React from 'react'
import { renderInForm } from '../test/form'
import RadioField from './Fields/RadioField'
import StringField from './Fields/StringField'
import TextAreaField from './Fields/TextAreaField'

const baseProps = {
  labelPosition: 'top' as const,
  missing: false,
  disabled: false,
}

const renderField = (node: React.ReactElement) => renderInForm(node, { testField: '' })

describe('FieldWrapper labelling', () => {
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

describe('FieldWrapper required mark', () => {
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
