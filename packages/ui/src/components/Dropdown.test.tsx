// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import Dropdown, { type IProps } from './Dropdown'

// Mock ResizeObserver which is not available in jsdom
global.ResizeObserver = class implements ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

// Mock the usePopper hook since we're not testing popper functionality
vi.mock('react-popper', () => ({
  usePopper: () => ({
    styles: { popper: {} },
    attributes: { popper: {} },
  }),
}))

describe('Dropdown Component', () => {
  const mockOptions = [
    { label: 'Option 1', value: 'option1' },
    { label: 'Option 2', value: 'option2' },
    { label: 'Option 3', value: 'option3' },
  ]

  const setup = (props: Partial<IProps> = {}) => {
    const onChange = vi.fn()
    const defaultProps = {
      options: mockOptions,
      onChange,
      value: '',
    }

    return {
      onChange,
      ...render(<Dropdown {...defaultProps} {...props} />),
    }
  }

  it('keeps a typed custom value when the list closes before the field loses focus', () => {
    const onChange = vi.fn()
    function Field() {
      const [value, setValue] = useState('')
      return (
        <Dropdown
          allowCustomValue
          options={mockOptions}
          value={value}
          onChange={(next) => {
            setValue(next as string)
            onChange(next)
          }}
        />
      )
    }
    render(<Field />)
    const input = screen.getByRole('combobox')
    fireEvent.click(screen.getByTestId('combobox-button'))
    fireEvent.change(input, { target: { value: 'custom' } })
    // Tab closes the list first in a browser, the way Escape does here.
    fireEvent.keyDown(input, { key: 'Escape' })
    fireEvent.blur(input)
    expect(onChange).toHaveBeenLastCalledWith('custom')
  })

  it('renders correctly with default props', () => {
    setup()
    expect(screen.getByRole('combobox')).toBeInTheDocument()
  })

  it('shows loading state when loading prop is true', () => {
    setup({ loading: true })
    expect(screen.getByRole('combobox')).toHaveAttribute('placeholder', 'Loading...')
  })

  it('displays placeholder when no value is selected', () => {
    const placeholder = 'Select an option'
    setup({ placeholder, value: '' })
    expect(screen.getByRole('combobox')).toHaveAttribute('placeholder', placeholder)
  })

  it('disables the dropdown when disabled prop is true', () => {
    setup({ disabled: true })
    expect(screen.getByRole('combobox')).toBeDisabled()
  })

  it('names the combobox from ariaLabel', () => {
    setup({ ariaLabel: 'Provisioning Mode' })
    expect(screen.getByRole('combobox', { name: 'Provisioning Mode' })).toBeInTheDocument()
  })

  it('leaves the combobox unnamed when ariaLabel is empty or absent', () => {
    const { unmount } = setup()
    expect(screen.getByRole('combobox')).not.toHaveAttribute('aria-label')
    unmount()

    setup({ ariaLabel: '' })
    expect(screen.getByRole('combobox')).not.toHaveAttribute('aria-label')
  })

  it('describes the combobox with the description it is given', () => {
    render(<p id="hint">Where the job runs.</p>)
    setup({ ariaLabel: 'Cluster', 'aria-describedby': 'hint' })
    expect(screen.getByRole('combobox', { name: 'Cluster' })).toHaveAccessibleDescription(
      'Where the job runs.',
    )
  })

  it('applies the id prop to the combobox', () => {
    setup({ id: 'events-time-range' })
    expect(screen.getByRole('combobox')).toHaveAttribute('id', 'events-time-range')
  })

  it('shows the selected option icon next to the closed input', () => {
    setup({
      options: [
        {
          label: 'einstein',
          value: 'einstein',
          icon: <span data-testid="selected-icon" />,
        },
      ],
      value: 'einstein',
    })
    expect(screen.getByTestId('selected-icon')).toBeInTheDocument()
  })

  it('shows the icon when the selected value is an option inside a category', () => {
    setup({
      options: [
        {
          category: 'My Clusters',
          options: [
            {
              label: 'einstein',
              value: { id: 'cluster-1', name: 'einstein' },
              icon: <span data-testid="category-icon" />,
            },
          ],
        },
      ],
      value: { id: 'cluster-1', name: 'einstein' },
    })
    expect(screen.getByTestId('category-icon')).toBeInTheDocument()
  })

  it('hides the selected option icon while typing a query', () => {
    setup({
      options: [
        {
          label: 'einstein',
          value: 'einstein',
          icon: <span data-testid="typing-icon" />,
        },
      ],
      value: 'einstein',
    })
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'ei' } })
    expect(screen.queryByTestId('typing-icon')).not.toBeInTheDocument()
  })

  it('renders no icon overlay when the selected option has none', () => {
    const { container } = setup({ value: 'option1' })
    expect(container.querySelector('.pointer-events-none')).toBeNull()
  })
})
