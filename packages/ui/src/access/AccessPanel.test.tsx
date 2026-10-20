// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { useState } from 'react'
import { UIProvider } from '../components/Provider'
import {
  applyChange,
  WORKSPACE,
  WORKSPACE_ADMINS,
  WORKSPACE_GRANTS,
  WORKSPACE_PRINCIPALS,
  WORKSPACE_ROLES,
} from '../test/access'
import { AccessPanel, type AccessPanelProps } from './AccessDrawer'
import type { AccessChange } from './types'

function Panel({
  onChange,
  onVisibility,
  ...props
}: Partial<AccessPanelProps> & {
  onChange?: (change: AccessChange) => Promise<unknown> | undefined
  onVisibility?: (restricted: boolean) => Promise<unknown> | undefined
}) {
  const [grants, setGrants] = useState(WORKSPACE_GRANTS)
  const [restricted, setRestricted] = useState(false)
  return (
    <UIProvider>
      <AccessPanel
        resourceName={WORKSPACE}
        roles={WORKSPACE_ROLES}
        principals={WORKSPACE_PRINCIPALS}
        grants={grants}
        singleRole
        visibility={{
          restricted,
          openLabel: 'Everyone in the workspace',
          onChange: async (next) => {
            await onVisibility?.(next)
            setRestricted(next)
          },
        }}
        rules={[
          {
            id: 'admins',
            title: 'Workspace admins always have access',
            detail: 'Set in workspace settings',
            people: WORKSPACE_ADMINS,
            roleId: 'admin',
          },
        ]}
        onChange={async (change) => {
          await onChange?.(change)
          setGrants((current) => applyChange(current, change))
        }}
        {...props}
      />
    </UIProvider>
  )
}

describe('AccessPanel', () => {
  it('sits inline, one row per person or group with their one role', () => {
    render(<Panel />)
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByRole('region', { name: 'Access' })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Role for Lin Zhou' })).toHaveTextContent('Member')
  })

  it('swaps a role for another as one change', async () => {
    const onChange = vi.fn(() => Promise.resolve())
    render(<Panel onChange={onChange} />)
    fireEvent.click(screen.getByRole('combobox', { name: 'Role for Lin Zhou' }))
    const viewer = await screen.findByRole('option', { name: 'Viewer' })
    // Base UI commits a mouse click only when the press started on the option.
    fireEvent.pointerDown(viewer)
    fireEvent.click(viewer)
    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith({
        grant: [{ principalId: 'user:lin', roleId: 'viewer' }],
        revoke: [{ principalId: 'user:lin', roleId: 'member' }],
      }),
    )
    await waitFor(() =>
      expect(screen.getByRole('combobox', { name: 'Role for Lin Zhou' })).toHaveTextContent(
        'Viewer',
      ),
    )
  })

  it('switches who can see it, and says when that fails', async () => {
    const onVisibility = vi
      .fn()
      .mockRejectedValueOnce(new Error('Offline'))
      .mockResolvedValue(undefined)
    render(<Panel onVisibility={onVisibility} />)
    const switcher = screen.getByRole('group', { name: 'Who can see it' })
    fireEvent.click(within(switcher).getByRole('button', { name: 'Only people with access' }))
    expect(
      await screen.findByText('Couldn’t change to Only people with access'),
    ).toBeInTheDocument()
    // The switch shows what is in effect, not the choice that failed.
    expect(
      within(switcher).getByRole('button', { name: 'Everyone in the workspace' }),
    ).toHaveAttribute('aria-pressed', 'true')
    expect(
      within(switcher).getByRole('button', { name: 'Only people with access' }),
    ).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    await waitFor(() => expect(onVisibility).toHaveBeenCalledTimes(2))
    await waitFor(() =>
      expect(
        within(switcher).getByRole('button', { name: 'Only people with access' }),
      ).toHaveAttribute('aria-pressed', 'true'),
    )
  })

  it('shows a fixed rule ahead of the grants, locked, with who it covers', () => {
    render(<Panel />)
    const rule = screen.getByText('Workspace admins always have access')
    expect(rule).toBeInTheDocument()
    expect(
      screen.getByText('Includes Ada Okafor, Marcus Bell, Priya Nair, Tomás Ruiz, and 2 more'),
    ).toBeInTheDocument()
  })

  it('opens a row’s menu on a right-click, with its role checked', async () => {
    render(<Panel />)
    const row = screen.getByRole('combobox', { name: 'Role for Lin Zhou' }).closest('[id]')
    act(() => {
      fireEvent.contextMenu(row as Element, { clientX: 10, clientY: 10 })
    })
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Role' }))
    expect(await screen.findByRole('menuitemcheckbox', { name: /Member/ })).toHaveAttribute(
      'aria-checked',
      'true',
    )
    expect(screen.getByRole('menuitem', { name: 'Remove access' })).toBeInTheDocument()
  })

  it('opens the grant form in place, with a way back', async () => {
    render(<Panel />)
    fireEvent.click(screen.getAllByRole('button', { name: 'Grant access' })[0] as HTMLElement)
    expect(await screen.findByRole('region', { name: 'Grant access' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Back to access' })).toBeInTheDocument()
  })

  it('shows a footer under the list, and the grant form in its place', async () => {
    render(<Panel footer={<p>Guests never see private teams.</p>} />)
    expect(screen.getByText('Guests never see private teams.')).toBeInTheDocument()
    fireEvent.click(screen.getAllByRole('button', { name: 'Grant access' })[0] as HTMLElement)
    await screen.findByRole('button', { name: 'Back to access' })
    expect(screen.queryByText('Guests never see private teams.')).toBeNull()
  })

  it('shows access set somewhere else read-only, saying where, with a link there', () => {
    render(
      <Panel
        managedElsewhere={{
          reason: 'This team follows the workspace’s access.',
          href: '/settings/access',
          linkLabel: 'Workspace access',
        }}
      />,
    )
    expect(screen.getByText('This team follows the workspace’s access.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Workspace access' })).toHaveAttribute(
      'href',
      '/settings/access',
    )
    expect(screen.queryByRole('button', { name: 'Grant access' })).toBeNull()
    expect(screen.getByText('Lin Zhou')).toBeInTheDocument()
    expect(screen.queryByRole('combobox', { name: 'Role for Lin Zhou' })).toBeNull()
    expect(screen.queryByText('View only.', { exact: false })).toBeNull()
  })

  it('says only where access is set when nothing is granted here', () => {
    render(<Panel grants={[]} rules={[]} visibility={undefined} managedElsewhere={{}} />)
    expect(
      screen.getByText('Access here is set somewhere else, so it can’t be changed here.'),
    ).toBeInTheDocument()
    expect(screen.queryByText('No access granted')).toBeNull()
    expect(screen.queryByRole('link')).toBeNull()
  })
})
