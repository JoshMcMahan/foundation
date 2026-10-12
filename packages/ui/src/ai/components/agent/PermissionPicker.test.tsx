// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import PermissionPicker from './PermissionPicker'

describe('PermissionPicker', () => {
  it('names a mode the choices do not offer, such as plan', () => {
    render(<PermissionPicker mode="plan" ceiling="accept-edits" onPick={vi.fn()} />)
    expect(screen.getByRole('button')).toHaveTextContent('Plan')
  })

  it('offers auto up to an auto ceiling', () => {
    render(
      <PermissionPicker
        mode="auto"
        ceiling="auto"
        accepted={['read-only', 'accept-edits', 'auto', 'bypass-permissions', 'plan']}
        onPick={vi.fn()}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Choose what the agent may do' }))
    const offered = within(screen.getByRole('list'))
    expect(offered.getByText('Auto')).toBeInTheDocument()
    expect(offered.queryByText('Bypass permissions')).not.toBeInTheDocument()
  })

  it('leaves auto out for a machine that does not list it', () => {
    render(<PermissionPicker mode="accept-edits" ceiling="bypass-permissions" onPick={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Choose what the agent may do' }))
    const offered = within(screen.getByRole('list'))
    expect(offered.getByText('Bypass permissions')).toBeInTheDocument()
    expect(offered.queryByText('Auto')).not.toBeInTheDocument()
  })

  it('shows an unrecognised mode verbatim', () => {
    render(<PermissionPicker mode="custom-mode" ceiling="accept-edits" onPick={vi.fn()} />)
    expect(screen.getByRole('button')).toHaveTextContent('custom-mode')
  })
})
