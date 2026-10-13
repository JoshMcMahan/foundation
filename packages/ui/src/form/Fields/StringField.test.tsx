// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { fireEvent, screen } from '@testing-library/react'
import { renderInForm } from '../../test/form'
import type { IStringField } from './StringField'
import StringField from './StringField'

describe('StringField', () => {
  const renderField = (field: Partial<IStringField> = {}, values: Record<string, unknown> = {}) =>
    renderInForm(
      <StringField
        field={{ type: 'string', name: 'testField', ...field }}
        label="Test Label"
        labelPosition="top"
        missing={false}
        disabled={false}
      />,
      values,
    )

  it('shows the form value', () => {
    renderField({ default: 'default-value' }, { testField: 'form-value' })
    expect(screen.getByRole('textbox')).toHaveValue('form-value')
  })

  it('shows an unset value empty, with its default as the placeholder', () => {
    renderField({ default: 'default-value' })
    expect(screen.getByRole('textbox')).toHaveValue('')
    expect(screen.getByRole('textbox')).toHaveAttribute('placeholder', 'default-value')
  })

  it('writes what is typed to the form', () => {
    const { form } = renderField()
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'typed' } })
    expect(form.getValues('testField')).toBe('typed')
    expect(form.getFieldState('testField').isTouched).toBe(true)
  })

  describe('password', () => {
    const password = () => document.querySelector('input[type="password"]')

    it('shows empty while it holds its default', () => {
      renderField({ type: 'password', default: 'secret' }, { testField: 'secret' })
      expect(password()).toHaveValue('')
    })

    it('shows a value other than its default', () => {
      renderField({ type: 'password', default: 'secret' }, { testField: 'different-value' })
      expect(password()).toHaveValue('different-value')
    })

    it('keeps its default when cleared', () => {
      const { form } = renderField({ type: 'password', default: 'secret' }, { testField: 'x' })
      fireEvent.change(password() as Element, { target: { value: '' } })
      expect(form.getValues('testField')).toBe('secret')
    })
  })

  describe('lowercase', () => {
    it('lowercases the value without a sanitize pattern', () => {
      renderField({ lowercase: true })
      fireEvent.change(screen.getByRole('textbox'), { target: { value: 'MyName' } })
      expect(screen.getByRole('textbox')).toHaveValue('myname')
    })

    it('lowercases before applying the sanitize pattern', () => {
      renderField({ lowercase: true, sanitize: '[^a-z]' })
      fireEvent.change(screen.getByRole('textbox'), { target: { value: 'My-Name' } })
      expect(screen.getByRole('textbox')).toHaveValue('myname')
    })

    it('still lowercases when the sanitize pattern is invalid', () => {
      const error = vi.spyOn(console, 'error').mockImplementation(() => {})
      renderField({ lowercase: true, sanitize: '[' })
      fireEvent.change(screen.getByRole('textbox'), { target: { value: 'MyName' } })
      expect(screen.getByRole('textbox')).toHaveValue('myname')
      error.mockRestore()
    })

    it('leaves the case alone when lowercase is not set', () => {
      renderField()
      fireEvent.change(screen.getByRole('textbox'), { target: { value: 'MyName' } })
      expect(screen.getByRole('textbox')).toHaveValue('MyName')
    })
  })

  describe('sanitize', () => {
    it('removes every disallowed character from a pasted value', () => {
      renderField({ sanitize: '[^a-z0-9-]' })
      fireEvent.change(screen.getByRole('textbox'), { target: { value: 'my name, here!' } })
      expect(screen.getByRole('textbox')).toHaveValue('mynamehere')
    })
  })
})
