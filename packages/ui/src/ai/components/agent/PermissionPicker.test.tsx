// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import PermissionPicker from './PermissionPicker'

describe('PermissionPicker', () => {
  it('names a mode the choices do not offer, such as plan', () => {
    render(<PermissionPicker mode="plan" ceiling="accept-edits" onPick={vi.fn()} />)
    expect(screen.getByRole('combobox')).toHaveTextContent('Plan')
  })

  it('offers auto up to an auto ceiling', async () => {
    render(
      <PermissionPicker
        mode="auto"
        ceiling="auto"
        accepted={['read-only', 'accept-edits', 'auto', 'bypass-permissions', 'plan']}
        onPick={vi.fn()}
      />,
    )
    fireEvent.click(screen.getByRole('combobox', { name: 'Choose what the agent may do' }))
    const offered = within(await screen.findByRole('listbox'))
    expect(offered.getByRole('option', { name: /^Auto/ })).toBeInTheDocument()
    expect(offered.queryByRole('option', { name: /^Bypass permissions/ })).not.toBeInTheDocument()
  })

  it('leaves auto out for a machine that does not list it', async () => {
    render(<PermissionPicker mode="accept-edits" ceiling="bypass-permissions" onPick={vi.fn()} />)
    fireEvent.click(screen.getByRole('combobox', { name: 'Choose what the agent may do' }))
    const offered = within(await screen.findByRole('listbox'))
    expect(offered.getByRole('option', { name: /^Bypass permissions/ })).toBeInTheDocument()
    expect(offered.queryByRole('option', { name: /^Auto/ })).not.toBeInTheDocument()
  })

  it('shows an unrecognised mode verbatim', () => {
    render(<PermissionPicker mode="custom-mode" ceiling="accept-edits" onPick={vi.fn()} />)
    expect(screen.getByRole('combobox')).toHaveTextContent('custom-mode')
  })
})
