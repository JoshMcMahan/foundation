// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { CreateModalSelect, type CreateModalSelectOption } from './CreateModal'

global.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver

const clusterOptions = (name: string, envs: number): CreateModalSelectOption[] => [
  { label: 'Login node', value: `login:${name}`, group: name },
  ...Array.from({ length: envs }, (_, i) => ({
    label: `${name}-env-${i}`,
    value: `env:${name}:${i}`,
    group: name,
    collapsible: true,
  })),
]

const options: CreateModalSelectOption[] = [
  { label: 'User Workspace', value: 'user-workspace' },
  ...clusterOptions('alpha', 4),
  ...clusterOptions('beta', 4),
]

const setup = (value = 'user-workspace') => {
  const onChange = vi.fn()
  render(
    <CreateModalSelect
      label="Target"
      value={value}
      options={options}
      onChange={onChange}
      collapsedLabel={(count) => `${count} environments`}
    />,
  )
  fireEvent.click(screen.getByRole('button', { name: 'Target' }))
  return onChange
}

describe('CreateModalSelect collapsible groups', () => {
  it('hides collapsible options behind a per-group toggle row', () => {
    setup()
    expect(screen.getAllByText('Login node')).toHaveLength(2)
    expect(screen.getAllByText('4 environments')).toHaveLength(2)
    expect(screen.queryByText('alpha-env-0')).not.toBeInTheDocument()
  })

  it('expands and re-collapses a group via its toggle row', () => {
    setup()
    const toggle = screen.getAllByText('4 environments')[0] as HTMLElement
    fireEvent.click(toggle)
    expect(screen.getByText('alpha-env-0')).toBeInTheDocument()
    expect(screen.queryByText('beta-env-0')).not.toBeInTheDocument()
    fireEvent.click(toggle)
    expect(screen.queryByText('alpha-env-0')).not.toBeInTheDocument()
  })

  it("starts with the selected value's group expanded", () => {
    setup('env:beta:1')
    // Once in the pill, once as a menu row.
    expect(screen.getAllByText('beta-env-1')).toHaveLength(2)
    expect(screen.queryByText('alpha-env-0')).not.toBeInTheDocument()
  })

  it('matches the group name in the filter and bypasses collapsing', () => {
    setup()
    fireEvent.change(screen.getByLabelText('Target', { selector: 'input' }), {
      target: { value: 'beta' },
    })
    expect(screen.getByText('Login node')).toBeInTheDocument()
    expect(screen.getByText('beta-env-0')).toBeInTheDocument()
    expect(screen.queryByText('alpha-env-0')).not.toBeInTheDocument()
    // Only the pill's copy remains; the menu row is filtered out.
    expect(screen.getAllByText('User Workspace')).toHaveLength(1)
  })

  it('selects an option revealed by expanding a group', () => {
    const onChange = setup()
    fireEvent.click(screen.getAllByText('4 environments')[0] as HTMLElement)
    fireEvent.click(screen.getByText('alpha-env-2'))
    expect(onChange).toHaveBeenCalledWith('env:alpha:2')
  })
})
