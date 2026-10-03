// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { Form, Formik } from 'formik'
import FormikCustomInput from './FormikCustomInput'

// Mock ResizeObserver
global.ResizeObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}))

describe('FormikCustomInput', () => {
  const renderWithFormik = (
    props: Parameters<typeof FormikCustomInput>[0],
    initialValues: Record<string, unknown> = {},
  ) => {
    const fieldName = props.name
    return render(
      <Formik initialValues={{ [fieldName]: '', ...initialValues }} onSubmit={vi.fn()}>
        <Form>
          <FormikCustomInput {...props} />
        </Form>
      </Formik>,
    )
  }

  describe('value prop behavior', () => {
    it('should use field.value when value prop is not provided', () => {
      renderWithFormik({ name: 'testInput', type: 'string' }, { testInput: 'form-state-value' })

      const input = screen.getByRole('textbox')
      expect(input).toHaveValue('form-state-value')
    })

    it('should use value prop when provided, overriding field.value', () => {
      renderWithFormik(
        { name: 'testInput', type: 'string', value: 'override-value' },
        { testInput: 'form-state-value' },
      )

      const input = screen.getByRole('textbox')
      expect(input).toHaveValue('override-value')
    })

    it('should use field.value when value prop is undefined', () => {
      renderWithFormik(
        { name: 'testInput', type: 'string', value: undefined },
        { testInput: 'form-state-value' },
      )

      const input = screen.getByRole('textbox')
      expect(input).toHaveValue('form-state-value')
    })

    it('should display empty string when both value prop and field.value are empty', () => {
      renderWithFormik({ name: 'testInput', type: 'string', value: undefined }, { testInput: '' })

      const input = screen.getByRole('textbox')
      expect(input).toHaveValue('')
    })

    it('should use empty string value prop over field.value', () => {
      renderWithFormik(
        { name: 'testInput', type: 'string', value: '' },
        { testInput: 'form-state-value' },
      )

      const input = screen.getByRole('textbox')
      // Empty string is a valid value prop, so it should override
      expect(input).toHaveValue('')
    })
  })

  describe('password type handling with value prop', () => {
    it('should show empty for password when field.value equals defaultValue', () => {
      renderWithFormik(
        { name: 'testPassword', type: 'password', defaultValue: 'secret' },
        { testPassword: 'secret' },
      )

      // Password inputs don't have textbox role, query by type attribute
      const input = document.querySelector('input[type="password"]')
      expect(input).toHaveValue('')
    })

    it('should show value prop for password when value prop differs from defaultValue', () => {
      renderWithFormik(
        {
          name: 'testPassword',
          type: 'password',
          value: 'override-password',
          defaultValue: 'secret',
        },
        { testPassword: 'secret' },
      )

      const input = document.querySelector('input[type="password"]')
      // Password hiding follows the displayed value: if an override is shown,
      // it's not the stored default, so don't hide.
      expect(input).toHaveValue('override-password')
    })

    it('should use value prop for password when field.value differs from defaultValue', () => {
      renderWithFormik(
        {
          name: 'testPassword',
          type: 'password',
          value: 'override-password',
          defaultValue: 'secret',
        },
        { testPassword: 'different-value' },
      )

      const input = document.querySelector('input[type="password"]')
      // When field.value !== defaultValue, value prop takes effect
      expect(input).toHaveValue('override-password')
    })
  })

  describe('number type handling', () => {
    it('should handle number type with value prop', () => {
      renderWithFormik({ name: 'testNumber', type: 'number', value: 42 }, { testNumber: 100 })

      const input = screen.getByRole('spinbutton')
      expect(input).toHaveValue(42)
    })
  })

  describe('lowercase', () => {
    it('lowercases the value without a sanitize pattern', () => {
      renderWithFormik({ name: 'testInput', type: 'string', lowercase: true })
      fireEvent.change(screen.getByRole('textbox'), { target: { value: 'MyName' } })
      expect(screen.getByRole('textbox')).toHaveValue('myname')
    })

    it('lowercases before applying the sanitize pattern', () => {
      renderWithFormik({
        name: 'testInput',
        type: 'string',
        lowercase: true,
        sanitize: '[^a-z]',
      })
      fireEvent.change(screen.getByRole('textbox'), { target: { value: 'My-Name' } })
      expect(screen.getByRole('textbox')).toHaveValue('myname')
    })

    it('leaves the case alone when lowercase is not set', () => {
      renderWithFormik({ name: 'testInput', type: 'string' })
      fireEvent.change(screen.getByRole('textbox'), { target: { value: 'MyName' } })
      expect(screen.getByRole('textbox')).toHaveValue('MyName')
    })
  })
})
