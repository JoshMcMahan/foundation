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

import { DynamicForm } from './Form'

vi.mock('../components/Provider', async (importOriginal) =>
  (await import('../test/engine')).mockEngineHooks(importOriginal),
)
function renderForm(formJSONs: Record<string, unknown>) {
  return render(<DynamicForm formJSONs={formJSONs} initialValues={{}} />)
}

const fieldRow = (label: string) => {
  const labelEl = screen.getByText(label, { exact: true })
  const row = labelEl.closest('[data-field-label]')?.parentElement?.parentElement
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
