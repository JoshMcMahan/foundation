// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { fireEvent, screen } from '@testing-library/react'
import { renderInForm } from '../../test/form'
import BooleanField from './BooleanField'

const field = {
  type: 'boolean' as const,
  name: 'spot',
  description: 'A reclaimed node restarts from its last checkpoint.',
}

describe('BooleanField', () => {
  it.each(['top', 'left'] as const)('puts the switch before its label (%s labels)', (position) => {
    renderInForm(
      <BooleanField
        field={field}
        label="Use spot instances"
        labelPosition={position}
        disabled={false}
      />,
      { spot: false },
    )
    const toggle = screen.getByRole('switch')
    const label = screen.getByText('Use spot instances')
    expect(toggle.compareDocumentPosition(label) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('flips when its label is clicked', () => {
    const { form } = renderInForm(
      <BooleanField
        field={field}
        label="Use spot instances"
        labelPosition="left"
        disabled={false}
      />,
      { spot: false },
    )
    const toggle = screen.getByRole('switch', { name: 'Use spot instances' })
    fireEvent.click(screen.getByText('Use spot instances'))
    expect(toggle).toBeChecked()
    expect(form.getValues('spot')).toBe(true)
    fireEvent.click(screen.getByText('Use spot instances'))
    expect(form.getValues('spot')).toBe(false)
  })

  it('is named by its label alone and described by its description and help', () => {
    renderInForm(
      <BooleanField
        field={field}
        label="Use spot instances"
        labelPosition="top"
        disabled={false}
        help="Spot instances cost less."
      />,
      { spot: false },
    )
    const toggle = screen.getByRole('switch', { name: 'Use spot instances' })
    expect(toggle).toHaveAccessibleDescription(
      'A reclaimed node restarts from its last checkpoint. Spot instances cost less.',
    )
  })

  it('dims its label when disabled, and neither the switch nor the label changes it', () => {
    const { form } = renderInForm(
      <BooleanField
        field={{ ...field, disabled_message: 'Set by the queue.' }}
        label="Use spot instances"
        labelPosition="left"
        disabled
      />,
      { spot: true },
    )
    const toggle = screen.getByRole('switch', { name: 'Use spot instances' })
    expect(toggle).toBeDisabled()
    expect(screen.getByText('Use spot instances').parentElement).toHaveClass('opacity-60')
    fireEvent.click(screen.getByText('Use spot instances'))
    fireEvent.click(toggle)
    expect(toggle).toBeChecked()
    expect(form.getValues('spot')).toBe(true)
  })

  it("names a named option's state after the label, outside the switch's name", () => {
    const { form } = renderInForm(
      <BooleanField
        field={{
          type: 'boolean',
          name: 'visibility',
          options: { onOption: 'PUBLIC', offOption: 'PRIVATE' },
        }}
        label="Visibility"
        labelPosition="top"
        disabled={false}
      />,
      { visibility: 'PRIVATE' },
    )
    const toggle = screen.getByRole('switch', { name: 'Visibility' })
    const label = screen.getByText('Visibility')
    const state = screen.getByText('Private')
    expect(label.compareDocumentPosition(state) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    fireEvent.click(label)
    expect(form.getValues('visibility')).toBe('PUBLIC')
    expect(toggle).toBeChecked()
    expect(screen.getByText('Public')).toBeInTheDocument()
    expect(screen.queryByText('Private')).not.toBeInTheDocument()
  })
})
