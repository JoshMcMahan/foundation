// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import { Form, Formik } from 'formik'
import type { FieldComponentProps } from '../types/fieldComponentTypes'
import type { IStringField } from './StringField'
import StringField from './StringField'

// Mock ResizeObserver
global.ResizeObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}))

describe('StringField', () => {
  const createField = (overrides: Partial<IStringField> = {}): IStringField => ({
    type: 'string',
    name: 'testField',
    ...overrides,
  })

  const createProps = (
    fieldOverrides: Partial<IStringField> = {},
    propsOverrides: Partial<FieldComponentProps<IStringField>> = {},
  ): FieldComponentProps<IStringField> => ({
    field: createField(fieldOverrides),
    label: 'Test Label',
    labelPosition: 'top',
    missing: false,
    missingFields: [],
    values: {},
    setFormDirty: vi.fn(),
    disabled: false,
    currentValue: '',
    ...propsOverrides,
  })

  const renderWithFormik = (
    props: FieldComponentProps<IStringField>,
    initialValues: Record<string, unknown> = {},
  ) => {
    const fieldName = props.field.name!
    const currentValue = (initialValues[fieldName] ?? '') as string

    return render(
      <Formik initialValues={{ [fieldName]: '', ...initialValues }} onSubmit={vi.fn()}>
        <Form>
          <StringField {...props} currentValue={currentValue} />
        </Form>
      </Formik>,
    )
  }

  describe('prefillDefault behavior', () => {
    it('should not prefill value when prefillDefault is false', () => {
      const props = createProps({
        default: 'default-value',
        prefillDefault: false,
      })
      renderWithFormik(props, { testField: '' })

      const input = screen.getByRole('textbox')
      expect(input).toHaveValue('')
    })

    it('should render field value when prefillDefault is true', () => {
      const props = createProps({
        default: 'default-value',
        prefillDefault: true,
      })
      renderWithFormik(props, { testField: 'form-value' })

      const input = screen.getByRole('textbox')
      expect(input).toHaveValue('form-value')
    })

    it('should render field value over default when prefillDefault is true and value differs from default', () => {
      // Loading a saved configuration: form value is what the user previously saved,
      // not the schema default. The form-level DynamicDefaultsSync handles default-expression
      // syncing into form state; the field component just renders the form value.
      const props = createProps({
        default: 'default-value',
        prefillDefault: true,
      })
      renderWithFormik(props, { testField: 'config-value' })

      const input = screen.getByRole('textbox')
      expect(input).toHaveValue('config-value')
    })
  })
})
