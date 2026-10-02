// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import DropdownWrapper from './DropdownWrapper'

global.ResizeObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}))

describe('DropdownWrapper', () => {
  const renderWrapper = (fieldObj: React.ComponentProps<typeof DropdownWrapper>['fieldObj']) =>
    render(
      <DropdownWrapper
        options={[{ label: 'us-central1', value: 'us-central1' }]}
        fieldObj={fieldObj}
        setFormDirty={vi.fn()}
        currentValue=""
        setFieldValue={vi.fn()}
        setFieldTouched={vi.fn()}
      />,
    )

  it('names the combobox from the field label', () => {
    renderWrapper({ name: 'region', label: 'Region' })
    expect(screen.getByRole('combobox', { name: 'Region' })).toBeInTheDocument()
  })

  it('leaves the combobox unnamed when the field has no label', () => {
    renderWrapper({ name: 'region' })
    expect(screen.getByRole('combobox')).not.toHaveAttribute('aria-label')
  })
})
