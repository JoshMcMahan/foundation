// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { Form, Formik, useFormikContext } from 'formik'
import { act } from 'react'
import type { FieldComponentProps } from '../types/fieldComponentTypes'
import type { IDurationField } from './DurationField'
import DurationField from './DurationField'
import { getInvalidDurationPaths } from './durationValidity'

function Probe({ name }: { name: string }) {
  const { values } = useFormikContext<Record<string, unknown>>()
  return <span data-testid="val">{JSON.stringify(values[name] ?? null)}</span>
}

// Bridges the FieldComponentProps contract: fields receive currentValue and
// setFieldValue as props instead of reading Formik context themselves.
function Harness({
  field,
  initialValues,
}: {
  field: IDurationField
  initialValues: Record<string, unknown>
}) {
  return (
    <Formik initialValues={initialValues} onSubmit={vi.fn()}>
      <Form>
        <FieldUnderTest field={field} />
        <Probe name={field.name!} />
      </Form>
    </Formik>
  )
}

function FieldUnderTest({ field }: { field: IDurationField }) {
  const { values, setFieldValue, setFieldTouched } = useFormikContext<Record<string, unknown>>()
  const props: FieldComponentProps<IDurationField, number | string | undefined> = {
    field,
    label: field.label ?? 'Duration',
    labelPosition: 'top',
    missing: false,
    missingFields: [],
    values,
    setFormDirty: vi.fn(),
    disabled: false,
    currentValue: values[field.name!] as number | string | undefined,
    setFieldValue,
    setFieldTouched,
  }
  return <DurationField {...props} />
}

const makeField = (overrides: Partial<IDurationField> = {}): IDurationField => ({
  type: 'duration',
  name: 'maxDuration',
  label: 'Max Run Duration',
  min: 600,
  max: 604800,
  optional: true,
  ...overrides,
})

const renderField = (
  fieldOverrides: Partial<IDurationField> = {},
  initialValues: Record<string, unknown> = {},
) => render(<Harness field={makeField(fieldOverrides)} initialValues={initialValues} />)

const typeText = (value: string) => {
  fireEvent.change(screen.getByRole('textbox'), { target: { value } })
  act(() => vi.advanceTimersByTime(600))
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('DurationField', () => {
  it('displays stored seconds formatted', () => {
    renderField({}, { maxDuration: 86400 })
    expect(screen.getByRole('textbox')).toHaveValue('1-00:00:00')
  })

  it('displays sub-day values without the days part', () => {
    renderField({ min: 30 }, { maxDuration: 300 })
    expect(screen.getByRole('textbox')).toHaveValue('00:05:00')
  })

  it('writes parsed seconds to the form after the debounce', () => {
    renderField()
    typeText('2:00:00')
    expect(screen.getByTestId('val')).toHaveTextContent('7200')
  })

  it('shows a format error for bare numbers and leaves the form value untouched', () => {
    renderField({}, { maxDuration: 7200 })
    typeText('300')
    expect(screen.getByText('Enter a duration as DD-HH:MM:SS or HH:MM:SS.')).toBeInTheDocument()
    expect(screen.getByTestId('val')).toHaveTextContent('7200')
    expect(getInvalidDurationPaths()).toContain('maxDuration')

    typeText('1-00:00:00')
    expect(
      screen.queryByText('Enter a duration as DD-HH:MM:SS or HH:MM:SS.'),
    ).not.toBeInTheDocument()
    expect(screen.getByTestId('val')).toHaveTextContent('86400')
    expect(getInvalidDurationPaths()).not.toContain('maxDuration')
  })

  it('shows a range error with formatted limits for out-of-range input', () => {
    renderField()
    typeText('8-00:00:00')
    expect(screen.getByText('Must be between 00:10:00 and 7-00:00:00.')).toBeInTheDocument()
    expect(screen.getByTestId('val')).toHaveTextContent('null')
    expect(getInvalidDurationPaths()).toContain('maxDuration')
  })

  it('writes an empty string when cleared, without an error', () => {
    renderField({}, { maxDuration: 7200 })
    typeText('')
    expect(screen.getByTestId('val')).toHaveTextContent('""')
    expect(screen.queryByText(/Enter a duration|Must be between/)).not.toBeInTheDocument()
  })

  it('canonicalizes valid text on blur', () => {
    renderField()
    const input = screen.getByRole('textbox')
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: '2:00:00' } })
    fireEvent.blur(input)
    expect(input).toHaveValue('02:00:00')
    expect(screen.getByTestId('val')).toHaveTextContent('7200')
  })

  it('seeds the configured default when the value is unset', () => {
    renderField({ name: 'flexStartWaitTime', min: 30, default: 300 })
    expect(screen.getByTestId('val')).toHaveTextContent('300')
    expect(screen.getByRole('textbox')).toHaveValue('00:05:00')
  })

  it('normalizes legacy numeric-string values to numbers on mount', () => {
    renderField({ min: 30 }, { maxDuration: '300' })
    expect(screen.getByTestId('val')).toHaveTextContent('300')
    expect(screen.getByRole('textbox')).toHaveValue('00:05:00')
  })

  it('clears its registry entry on unmount', () => {
    const { unmount } = renderField()
    typeText('garbage')
    expect(getInvalidDurationPaths()).toContain('maxDuration')
    unmount()
    expect(getInvalidDurationPaths()).not.toContain('maxDuration')
  })

  it('re-validates a stored value against new limits when min changes', () => {
    const { rerender } = render(
      <Harness field={makeField({ min: 30 })} initialValues={{ maxDuration: 100 }} />,
    )
    expect(screen.queryByText(/Must be between/)).not.toBeInTheDocument()

    rerender(<Harness field={makeField({ min: 600 })} initialValues={{ maxDuration: 100 }} />)
    expect(screen.getByText(/Must be between/)).toBeInTheDocument()
    expect(getInvalidDurationPaths()).toContain('maxDuration')
  })

  it('shows the min-only message when no max is configured', () => {
    render(<Harness field={{ type: 'duration', name: 'maxDuration', min: 1 }} initialValues={{}} />)
    typeText('00:00:00')
    expect(screen.getByText('Must be at least 00:00:01.')).toBeInTheDocument()
    expect(getInvalidDurationPaths()).toContain('maxDuration')
  })
})

describe('DurationField disable checkbox', () => {
  const makeCheckboxField = (): IDurationField => ({
    type: 'duration',
    name: 'suspendTime',
    label: 'Suspend Time',
    min: 1,
    default: 300,
    disableValue: -1,
    disableLabel: 'Never suspend idle nodes',
  })

  const renderCheckboxField = (initialValues: Record<string, unknown>) =>
    render(<Harness field={makeCheckboxField()} initialValues={initialValues} />)

  it('renders no checkbox unless disableValue and disableLabel are set', () => {
    renderField()
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
  })

  it('shows a checked box and hides the input for a stored sentinel', () => {
    renderCheckboxField({ suspendTime: -1 })
    expect(screen.getByRole('checkbox')).toBeChecked()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    expect(screen.getByTestId('val')).toHaveTextContent('-1')
  })

  it('normalizes a legacy string sentinel to a number', () => {
    renderCheckboxField({ suspendTime: '-1' })
    expect(screen.getByRole('checkbox')).toBeChecked()
    expect(screen.getByTestId('val')).toHaveTextContent(/^-1$/)
  })

  it('checking writes the sentinel, cancels pending writes, and clears errors', () => {
    renderCheckboxField({ suspendTime: 300 })
    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: 'garbage' },
    })
    act(() => vi.advanceTimersByTime(600))
    expect(screen.getByText('Enter a duration as DD-HH:MM:SS or HH:MM:SS.')).toBeInTheDocument()
    expect(getInvalidDurationPaths()).toContain('suspendTime')

    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: '01:00:00' },
    })
    fireEvent.click(screen.getByRole('checkbox'))
    act(() => vi.advanceTimersByTime(600))
    expect(screen.getByTestId('val')).toHaveTextContent(/^-1$/)
    expect(
      screen.queryByText('Enter a duration as DD-HH:MM:SS or HH:MM:SS.'),
    ).not.toBeInTheDocument()
    expect(getInvalidDurationPaths()).not.toContain('suspendTime')
  })

  it('unchecking restores the default and re-shows the input', () => {
    renderCheckboxField({ suspendTime: -1 })
    fireEvent.click(screen.getByRole('checkbox'))
    expect(screen.getByTestId('val')).toHaveTextContent('300')
    expect(screen.getByRole('textbox')).toHaveValue('00:05:00')
    expect(screen.getByRole('checkbox')).not.toBeChecked()
  })
})
