// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { openTooltip } from '../test/tooltip'
import { BreadcrumbsActionButton, HeaderAddButton } from './PageHeader'

const Icon = ({ className }: { className?: string }) => <svg className={className} />

describe('BreadcrumbsActionButton', () => {
  it('names the button from ariaLabel while keeping the visible label', () => {
    render(<BreadcrumbsActionButton icon={Icon} label="Save" ariaLabel="Save organization flags" />)
    expect(screen.getByRole('button', { name: 'Save organization flags' })).toHaveTextContent(
      'Save',
    )
  })

  it('names the link from ariaLabel', () => {
    render(
      <BreadcrumbsActionButton
        icon={Icon}
        label="Save"
        ariaLabel="Save workspace defaults"
        href="/somewhere"
      />,
    )
    expect(screen.getByRole('link', { name: 'Save workspace defaults' })).toBeInTheDocument()
  })

  it('falls back to the visible label when ariaLabel is absent', () => {
    render(<BreadcrumbsActionButton icon={Icon} label="Save" />)
    const button = screen.getByRole('button', { name: 'Save' })
    expect(button).not.toHaveAttribute('aria-label')
  })
})

describe('HeaderAddButton', () => {
  it('keeps a disabled menu item inert and names its reason', () => {
    const onSelect = vi.fn()
    render(
      <HeaderAddButton
        label="Create key"
        word="create"
        menu={[
          { label: 'API key', onClick: vi.fn() },
          {
            label: 'AI Gateway API key',
            onClick: onSelect,
            disabled: true,
            disabledReason: 'No allocations available',
          },
        ]}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Create key' }))
    const item = screen.getByRole('menuitem', {
      name: 'AI Gateway API key. No allocations available',
    })
    expect(item).toHaveAttribute('aria-disabled', 'true')
    fireEvent.click(item)
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('swallows clicks and names the reason when disabled', async () => {
    const onClick = vi.fn()
    render(
      <HeaderAddButton
        onClick={onClick}
        label="Attach storage"
        disabled
        disabledHint="Wait until the cluster has finished starting"
      />,
    )
    const button = screen.getByRole('button', {
      name: 'Attach storage. Wait until the cluster has finished starting',
    })
    expect(button).toHaveAttribute('aria-disabled', 'true')
    act(() => button.focus())
    await waitFor(() =>
      expect(openTooltip()).toHaveTextContent('Wait until the cluster has finished starting'),
    )
    fireEvent.click(button)
    expect(onClick).not.toHaveBeenCalled()
  })
})
