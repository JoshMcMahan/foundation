// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { Form, Formik, useFormikContext } from 'formik'
import type { FieldComponentProps } from '../types/fieldComponentTypes'
import type { INumberField } from './NumberField'
import NumberField from './NumberField'

global.ResizeObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}))

// Surfaces the formik value so we can assert what NumberField seeded.
function Probe({ name }: { name: string }) {
  const { values } = useFormikContext<Record<string, unknown>>()
  return <span data-testid="val">{JSON.stringify(values[name] ?? null)}</span>
}

describe('NumberField prefillDefault', () => {
  const createProps = (
    fieldOverrides: Partial<INumberField> = {},
  ): FieldComponentProps<INumberField> =>
    ({
      field: {
        type: 'number',
        name: 'gpuCount',
        default: 1,
        ...fieldOverrides,
      },
      label: 'GPU Count',
      labelPosition: 'top',
      missing: false,
      missingFields: [],
      values: {},
      setFormDirty: vi.fn(),
      disabled: false,
      currentValue: undefined,
    }) as unknown as FieldComponentProps<INumberField>

  const renderIn = (
    props: FieldComponentProps<INumberField>,
    initialValues: Record<string, unknown> = {},
  ) =>
    render(
      <Formik initialValues={initialValues} onSubmit={vi.fn()}>
        <Form>
          <NumberField {...props} />
          <Probe name="gpuCount" />
        </Form>
      </Formik>,
    )

  it('seeds the default into the form value when prefillDefault is set and the value is unset', async () => {
    renderIn(createProps({ prefillDefault: true, default: 1 }))
    await waitFor(() => expect(screen.getByTestId('val')).toHaveTextContent('1'))
  })

  it('does not seed when prefillDefault is absent (default is placeholder-only)', () => {
    renderIn(createProps({ default: 1 }))
    expect(screen.getByTestId('val')).toHaveTextContent('null')
  })

  it('does not overwrite an existing value', () => {
    renderIn(createProps({ prefillDefault: true, default: 1 }), { gpuCount: 4 })
    expect(screen.getByTestId('val')).toHaveTextContent('4')
  })
})
