// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import { Form, Formik } from 'formik'
import type { FieldComponentProps } from '../types/fieldComponentTypes'
import type { IRangeField } from './RangeField'
import RangeField from './RangeField'

global.ResizeObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}))

describe('RangeField default seeding', () => {
  const createProps = (
    fieldOverrides: Partial<IRangeField> = {},
  ): FieldComponentProps<IRangeField> => ({
    field: {
      type: 'range',
      name: 'flexStartWaitTime',
      min: 30,
      max: 604800,
      ...fieldOverrides,
    },
    label: 'Wait',
    labelPosition: 'top',
    missing: false,
    missingFields: [],
    values: {},
    setFormDirty: vi.fn(),
    disabled: false,
    currentValue: '',
  })

  // Render with the field absent from the form values, so RangeField must seed it.
  const renderUnset = (props: FieldComponentProps<IRangeField>) =>
    render(
      <Formik initialValues={{}} onSubmit={vi.fn()}>
        <Form>
          <RangeField {...props} />
        </Form>
      </Formik>,
    )

  it('seeds field.default when the form value is unset (not min)', () => {
    renderUnset(createProps({ default: 300 }))
    // The bug seeded field.min (30); the fix honors the configured default.
    expect(screen.getByRole('spinbutton')).toHaveValue(300)
  })

  it('falls back to min when no default is configured', () => {
    renderUnset(createProps({}))
    expect(screen.getByRole('spinbutton')).toHaveValue(30)
  })

  it('is unchanged for fields where default equals min (e.g. lustre)', () => {
    renderUnset(createProps({ default: 72, min: 72, max: 72 }))
    expect(screen.getByRole('spinbutton')).toHaveValue(72)
  })
})
