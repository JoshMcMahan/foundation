// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { fireEvent, screen, waitFor } from '@testing-library/react'
import { renderInForm } from '../../test/form'
import type { INumberField } from './NumberField'
import NumberField from './NumberField'

describe('NumberField', () => {
  const renderField = (field: Partial<INumberField> = {}, values: Record<string, unknown> = {}) =>
    renderInForm(
      <NumberField
        field={{ type: 'number', name: 'gpuCount', default: 1, ...field }}
        label="GPU Count"
        labelPosition="top"
        missing={false}
        disabled={false}
      />,
      values,
    )

  describe('prefillDefault', () => {
    it('seeds the default into the form value when prefillDefault is set and the value is unset', async () => {
      const { form } = renderField({ prefillDefault: true, default: 1 })
      await waitFor(() => expect(form.getValues('gpuCount')).toBe(1))
    })

    it('does not seed when prefillDefault is absent (default is placeholder-only)', () => {
      const { form } = renderField({ default: 1 })
      expect(form.getValues('gpuCount')).toBeUndefined()
    })

    it('does not overwrite an existing value', () => {
      const { form } = renderField({ prefillDefault: true, default: 1 }, { gpuCount: 4 })
      expect(form.getValues('gpuCount')).toBe(4)
    })
  })

  it('keeps typed numbers within range, and shows the clamped value on blur', () => {
    const { form } = renderField({ min: 0, max: 8 })
    const input = screen.getByRole('textbox')
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: '12' } })
    expect(form.getValues('gpuCount')).toBe(8)
    fireEvent.blur(input)
    expect(input).toHaveValue('8')
  })

  it('shows a value the form holds, as a number or as text, and writes typed numbers', () => {
    const { form } = renderField({}, { gpuCount: '2' })
    const input = screen.getByRole('textbox')
    expect(input).toHaveValue('2')
    fireEvent.change(input, { target: { value: '3.25' } })
    expect(form.getValues('gpuCount')).toBe(3.25)
  })

  it('clears to undefined', () => {
    const { form } = renderField({}, { gpuCount: 2 })
    fireEvent.change(screen.getByRole('textbox', { name: 'GPU Count' }), { target: { value: '' } })
    expect(form.getValues('gpuCount')).toBeUndefined()
  })

  it('groups thousands only when asked', () => {
    renderField({ thousandsSeparator: true }, { gpuCount: 1234567 })
    expect(screen.getByRole('textbox')).toHaveValue('1,234,567')
  })

  it('steps with the buttons', () => {
    const { form } = renderField({ step: 5 }, { gpuCount: 10 })
    fireEvent.pointerDown(screen.getByRole('button', { name: /increase/i }), { button: 0 })
    expect(form.getValues('gpuCount')).toBe(15)
  })
})
