// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import PermissionPicker from './PermissionPicker'

describe('PermissionPicker', () => {
  it('names a mode the choices do not offer, such as plan', () => {
    render(<PermissionPicker mode="plan" ceiling="accept-edits" onPick={vi.fn()} />)
    expect(screen.getByRole('button')).toHaveTextContent('Plan')
  })

  it('shows an unrecognised mode verbatim', () => {
    render(<PermissionPicker mode="custom-mode" ceiling="accept-edits" onPick={vi.fn()} />)
    expect(screen.getByRole('button')).toHaveTextContent('custom-mode')
  })
})
