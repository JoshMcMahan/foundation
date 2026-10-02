// @vitest-environment jsdom
// Behavioral matrix ported from the retired kitchensink e2e suites
// (dynamic-form.test.ts "Dynamic Form Autoselect" and dropdown-filter.test.ts):
// the same formJSONs fixtures, asserted through the real field registry.
import '@testing-library/jest-dom/vitest'
import { render, screen, waitFor, within } from '@testing-library/react'

if (typeof structuredClone === 'undefined') {
  ;(global as Record<string, unknown>)['structuredClone'] = (obj: unknown): unknown =>
    JSON.parse(JSON.stringify(obj))
}

global.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver

import { flattenDisplayOptions } from '../components/dropdownUtils'
import { DynamicForm } from './Form'

vi.mock('../components/Provider', async (importOriginal) =>
  (await import('../test/engine')).mockEngineHooks(importOriginal),
)
function renderForm(formJSONs: Record<string, unknown>) {
  return render(<DynamicForm formJSONs={formJSONs} initialValues={{}} setFormDirty={() => {}} />)
}

const fieldRow = (label: string) => {
  const labelEl = screen.getByText(label, { exact: true })
  const row = labelEl.closest('.form-label')?.parentElement
  if (!row) {
    throw new Error(`no field row for label ${label}`)
  }
  return within(row as HTMLElement)
}

const comboboxInput = (label: string) =>
  fieldRow(label).getByTestId('combobox').querySelector('input') as HTMLInputElement | undefined

describe('dropdown autoselect', () => {
  const fixtures = {
    auto_select_dropdown: {
      label: 'Auto Select Dropdown',
      type: 'dropdown',
      options: [
        { label: 'Option 1', value: 'option1' },
        { label: 'Option 2', value: 'option2' },
      ],
      autoselect: true,
    },
    non_auto_select_dropdown: {
      label: 'Should not Auto Select Dropdown',
      type: 'dropdown',
      options: [
        { label: 'Option 1', value: 'option1' },
        { label: 'Option 2', value: 'option2' },
      ],
      autoselect: false,
    },
    dropdown_one_option: {
      label: 'Dropdown with one option',
      type: 'dropdown',
      options: [{ label: 'Option 1', value: 'option1' }],
    },
    dropdown_no_autoselect: {
      label: 'Dropdown without autoselect',
      type: 'dropdown',
      options: [{ label: 'Option 1', value: 'option1' }],
      autoselect: false,
    },
  }

  it('autoselects the first option when autoselect is true', async () => {
    renderForm(fixtures)
    await waitFor(() => expect(comboboxInput('Auto Select Dropdown')).toHaveValue('Option 1'))
  })

  it('selects nothing when autoselect is false', async () => {
    renderForm(fixtures)
    await waitFor(() => expect(comboboxInput('Auto Select Dropdown')).toHaveValue('Option 1'))
    expect(comboboxInput('Should not Auto Select Dropdown')).toHaveValue('')
  })

  it('autoselects a sole option by default', async () => {
    renderForm(fixtures)
    await waitFor(() => expect(comboboxInput('Dropdown with one option')).toHaveValue('Option 1'))
  })

  it('leaves even a sole option unselected when autoselect is false', async () => {
    renderForm(fixtures)
    await waitFor(() => expect(comboboxInput('Dropdown with one option')).toHaveValue('Option 1'))
    expect(comboboxInput('Dropdown without autoselect')).toHaveValue('')
  })
})

describe('dropdown filtering', () => {
  // The combobox options render through a virtual list, which draws nothing in
  // jsdom, so the filter pipeline is asserted as the pure function the
  // component renders from.
  const flat = [
    { label: 'hi', value: 'hi' },
    { label: 'hello', value: 'hello' },
    { label: 'bye', value: 'bye' },
  ]
  const categorized = [
    {
      category: 'Category 1',
      options: [
        { label: 'Option 1', value: 'option1' },
        { label: 'Option 2', value: 'option2' },
      ],
    },
    {
      category: 'Category 2',
      options: [
        { label: 'hi', value: 'hi' },
        { label: 'hello', value: 'hello' },
      ],
    },
  ]
  const labels = (opts: { label: string }[]) => opts.map((o) => o.label)

  it('shows every flat option for an empty query', () => {
    expect(labels(flattenDisplayOptions({ options: flat, query: '' }))).toEqual([
      'hi',
      'hello',
      'bye',
    ])
  })

  it('filters flat options down to matches', () => {
    expect(labels(flattenDisplayOptions({ options: flat, query: 'bye' }))).toEqual(['bye'])
    expect(labels(flattenDisplayOptions({ options: flat, query: 'hel' }))).toEqual(['hello'])
  })

  it('falls back to a disabled "No options found" row', () => {
    const result = flattenDisplayOptions({ options: flat, query: 'zzz' })
    expect(result).toEqual([{ label: 'No options found', value: '', disabled: true }])
  })

  it('keeps a category header when a member matches and drops the category otherwise', () => {
    expect(labels(flattenDisplayOptions({ options: categorized, query: 'Option' }))).toEqual([
      'Category 1',
      'Option 1',
      'Option 2',
    ])
    expect(labels(flattenDisplayOptions({ options: categorized, query: 'hi' }))).toEqual([
      'Category 2',
      'hi',
    ])
  })

  it('renders category headers as disabled rows ahead of their members', () => {
    const result = flattenDisplayOptions({ options: categorized, query: '' })
    expect(labels(result)).toEqual([
      'Category 1',
      'Option 1',
      'Option 2',
      'Category 2',
      'hi',
      'hello',
    ])
    expect(result[0]).toMatchObject({ disabled: true, category: true })
    expect(result[3]).toMatchObject({ disabled: true, category: true })
  })

  it('offers the typed query as a custom value when allowed instead of the empty state', () => {
    const result = flattenDisplayOptions({
      options: flat,
      query: 'zzz',
      allowCustomValue: true,
      customValueLabel: 'Use',
    })
    expect(result[0]).toEqual({ label: 'Use "zzz"', value: 'zzz' })
  })
})
