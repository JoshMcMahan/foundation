// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { useState } from 'react'
import {
  ALL_GROUPS,
  applyChange,
  detailsOf,
  GRANTS,
  PERMISSIONS,
  RECENT,
  RESOURCE,
  ROLES,
} from '../test/access'
import { AccessDrawer, type AccessDrawerProps } from './AccessDrawer'
import { buildModel, covers, grantPlan, overlapOf, removalOf, warnAboutMisuse } from './model'
import type { AccessChange, AccessGrant } from './types'

// jsdom has no layout, so the virtual list would measure its scroller as empty and draw no rows.
beforeAll(() => {
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(400)
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(400)
})

const role = (id: string) => {
  const found = ROLES.find((r) => r.id === id)
  if (!found) {
    throw new Error(id)
  }
  return found
}
const model = () => buildModel(ROLES, ALL_GROUPS, GRANTS, PERMISSIONS)

describe('access model', () => {
  it('finds a role covered by another that gives all its permissions', () => {
    expect(covers(role('sudo'), role('login'))).toBe(true)
    expect(covers(role('login'), role('sudo'))).toBe(false)
    expect(covers(role('login'), role('login'))).toBe(false)
    const empty = { id: 'none', name: 'None', permissions: [] }
    expect(covers(role('admin'), empty)).toBe(false)
  })

  it('says which of a group’s roles already cover one, and whether everyone has it', () => {
    const m = model()
    expect(overlapOf(m, 'g-bio-admins', role('login')).coveredBy.map((r) => r.id)).toEqual(['sudo'])
    expect(overlapOf(m, 'g-contractors', role('login'))).toEqual({
      coveredBy: [],
      everyone: false,
    })
    expect(overlapOf(m, 'g-contractors', role('view')).everyone).toBe(true)
    // Everyone isn't covered by itself.
    expect(overlapOf(m, 'everyone', role('view')).everyone).toBe(false)
  })

  it('loses only what no role it keeps still gives, and names what it keeps', () => {
    const m = model()
    const admin = removalOf(m, 'g-analytics-admins', ['admin'])
    expect(admin.lost).toEqual(['access:manage', 'cluster:root', 'cluster:power', 'cluster:login'])
    expect(admin.keep).toEqual([])
    expect(admin.keepThroughEveryone.map((r) => r.id)).toEqual(['view'])

    const sudo = removalOf(m, 'g-bio-admins', ['sudo'])
    expect(sudo.lost).toEqual(['cluster:root'])
    // Start and stop gives only what Login does of it, so Login alone is named.
    expect(sudo.keep.map((r) => r.id)).toEqual(['login'])

    const login = removalOf(m, 'g-bio-admins', ['login'])
    expect(login.lost).toEqual([])
    expect(login.keep.map((r) => r.id)).toEqual(['sudo'])

    const all = removalOf(m, 'g-bio-admins', ['sudo', 'power', 'login'])
    expect(all.lost).toEqual(['cluster:root', 'cluster:login', 'cluster:power'])
  })

  it('plans only the grants that add something', () => {
    const plan = grantPlan(model(), ['g-research-team', 'g-contractors'], ['login', 'sudo'])
    expect(plan.grant).toEqual([
      { groupId: 'g-research-team', roleId: 'sudo' },
      { groupId: 'g-contractors', roleId: 'sudo' },
    ])
    expect(plan.held).toHaveLength(2)
  })

  it('warns about duplicate and unknown ids', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    warnAboutMisuse(
      [...ROLES, role('view')],
      ALL_GROUPS,
      [...GRANTS, { groupId: 'g-contractors', roleId: 'ghost' }],
      PERMISSIONS,
    )
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('two roles share the id "view"'))
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('unknown role "ghost"'))
    warn.mockRestore()
  })
})

function Host({
  onChange,
  onClose = () => {},
  ...props
}: Partial<AccessDrawerProps> & { onChange?: (change: AccessChange) => Promise<unknown> }) {
  const [grants, setGrants] = useState<AccessGrant[]>(GRANTS)
  return (
    <AccessDrawer
      open
      onClose={onClose}
      resourceName={RESOURCE}
      roles={ROLES}
      groups={ALL_GROUPS}
      grants={grants}
      permissions={PERMISSIONS}
      describeGroup={async (id) => detailsOf(id)}
      recentGroupIds={RECENT}
      onChange={async (change) => {
        await onChange?.(change)
        setGrants((current) => applyChange(current, change))
      }}
      {...props}
    />
  )
}

const dialog = () => screen.getByRole('dialog')
const keyDown = (target: Element, key: string) => fireEvent.keyDown(target, { key })

async function openGrant() {
  // The drawer takes focus a frame after it opens; a click before that would lose the race.
  await waitFor(() => expect(dialog()).toContainElement(document.activeElement as HTMLElement))
  fireEvent.click(within(dialog()).getAllByRole('button', { name: 'Grant access' })[0] as Element)
  return screen.findByRole('combobox', { name: 'Groups' })
}

async function choose(field: HTMLElement, label: string) {
  fireEvent.change(field, { target: { value: label } })
  keyDown(field, 'ArrowDown')
  fireEvent.click(await screen.findByRole('option', { name: label }))
  if (field.getAttribute('aria-expanded') === 'true') {
    keyDown(field, 'Escape')
  }
}

describe('AccessDrawer', () => {
  it('clears the filter on Escape before it closes the drawer', async () => {
    const onClose = vi.fn()
    render(<Host onClose={onClose} />)
    const filter = screen.getByRole('searchbox', { name: 'Filter by role or group' })
    fireEvent.change(filter, { target: { value: 'bio' } })
    keyDown(filter, 'Escape')
    expect(filter).toHaveValue('')
    expect(onClose).not.toHaveBeenCalled()
    keyDown(filter, 'Escape')
    await waitFor(() => expect(onClose).toHaveBeenCalled())
  })

  it('opens the sections a filter finds rows in, and lets them fold again', async () => {
    render(<Host />)
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'contractors' } })
    const login = screen.getByRole('button', { name: /^Login/ })
    expect(login).toHaveAttribute('aria-expanded', 'true')
    expect(screen.queryByRole('button', { name: /^Admin/ })).toBeNull()
    fireEvent.click(login)
    expect(login).toHaveAttribute('aria-expanded', 'false')
  })

  it('grants the picked roles to the picked groups as one change, from the keyboard', async () => {
    const onChange = vi.fn(async () => {})
    render(<Host onChange={onChange} />)
    const groups = await openGrant()
    // The arrows move through the list and Enter picks: Everyone, then the recent groups.
    keyDown(groups, 'ArrowDown')
    await screen.findAllByRole('option')
    keyDown(groups, 'ArrowDown')
    keyDown(groups, 'Enter')
    await choose(groups, 'contractors')
    await choose(screen.getByRole('combobox', { name: 'Roles' }), 'Sudo')
    const grant = screen.getByRole('button', { name: 'Grant Sudo' })
    fireEvent.click(grant)
    await waitFor(() => expect(onChange).toHaveBeenCalled())
    expect(onChange).toHaveBeenCalledWith({
      grant: expect.arrayContaining([
        { groupId: 'g-contractors', roleId: 'sudo' },
        expect.objectContaining({ roleId: 'sudo' }),
      ]),
      revoke: [],
    })
    expect((onChange.mock.calls[0] as unknown as [AccessChange])[0].grant).toHaveLength(2)
    // Back on the list once saved, on the button that opened the form.
    await waitFor(() =>
      expect(screen.getAllByRole('button', { name: 'Grant access' })[0]).toHaveFocus(),
    )
  })

  it('leaves out grants a group holds already, and disables Grant when that is all of them', async () => {
    render(<Host />)
    const groups = await openGrant()
    await choose(groups, 'contractors')
    await choose(screen.getByRole('combobox', { name: 'Roles' }), 'Login')
    const grant = screen.getByRole('button', { name: 'Grant Login' })
    // Focusable, so its reason is read with it, and still not pressable.
    expect(grant).toHaveAttribute('aria-disabled', 'true')
    expect(grant).toHaveAccessibleDescription(
      'contractors already has Login, so there’s nothing to grant.',
    )
  })

  it('asks before granting to everyone, saying how many people it reaches', async () => {
    const onChange = vi.fn(async () => {})
    render(<Host onChange={onChange} />)
    const groups = await openGrant()
    await choose(groups, 'Everyone')
    await choose(screen.getByRole('combobox', { name: 'Roles' }), 'Login')
    expect(screen.getByText('Login for all 214 people')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Grant to everyone' }))
    const ask = screen.getByRole('group', { name: 'Grant Login to all 214 people?' })
    expect(onChange).not.toHaveBeenCalled()
    fireEvent.click(within(ask).getByRole('button', { name: 'Grant to everyone' }))
    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith({
        grant: [{ groupId: 'everyone', roleId: 'login' }],
        revoke: [],
      }),
    )
  })

  it('steps back on Escape in the grant form, after the open list closes', async () => {
    const onClose = vi.fn()
    render(<Host onClose={onClose} />)
    const groups = await openGrant()
    await waitFor(() => expect(groups).toHaveFocus())
    keyDown(groups, 'ArrowDown')
    await screen.findAllByRole('option')
    keyDown(groups, 'Escape')
    expect(groups).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getByRole('combobox', { name: 'Groups' })).toBeInTheDocument()
    keyDown(groups, 'Escape')
    await screen.findByRole('searchbox')
    expect(onClose).not.toHaveBeenCalled()
  })

  it('describes each group option in a short summary', async () => {
    render(<Host />)
    const groups = await openGrant()
    keyDown(groups, 'ArrowDown')
    const option = await screen.findByRole('option', { name: 'data-eng' })
    expect(option).toHaveAccessibleDescription('24 members, has Login here')
    expect(screen.getByTestId('combobox-details')).toHaveAttribute('aria-hidden', 'true')
  })

  it('asks before a removal, says what is lost, and saves only the revoke', async () => {
    const onChange = vi.fn(async () => {})
    render(<Host onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: /^Admin/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Remove analytics-admins from Admin' }))
    const ask = screen.getByRole('group', { name: 'Remove analytics-admins from Admin?' })
    expect(within(ask).getByText('Run commands as root')).toBeInTheDocument()
    expect(within(ask).getByText(/They keep View, which everyone has/)).toBeInTheDocument()
    fireEvent.click(within(ask).getByRole('button', { name: 'Remove Admin' }))
    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith({
        grant: [],
        revoke: [{ groupId: 'g-analytics-admins', roleId: 'admin' }],
      }),
    )
  })

  it('says a failed save changed nothing, keeps the row, and retries', async () => {
    const onChange = vi
      .fn<(change: AccessChange) => Promise<void>>()
      .mockRejectedValueOnce(new Error('The server didn’t respond'))
      .mockResolvedValue(undefined)
    render(<Host onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: /^Sudo/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Remove bio-admins from Sudo' }))
    fireEvent.click(screen.getByRole('button', { name: 'Remove Sudo' }))
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Couldn’t remove bio-admins from Sudo')
    expect(alert).toHaveTextContent('The server didn’t respond. Nothing changed.')
    expect(screen.getByRole('button', { name: 'Remove bio-admins from Sudo' })).toBeInTheDocument()
    await act(async () => fireEvent.click(within(alert).getByRole('button', { name: 'Retry' })))
    expect(onChange).toHaveBeenCalledTimes(2)
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull())
  })

  it('shows who has access without a way to change it when read-only', () => {
    render(<Host readOnly readOnlyReason="Only people with the Admin role can change it." />)
    expect(
      screen.getByText(/You can see who has access. Only people with the Admin role/),
    ).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /^Admin/ }))
    expect(screen.queryByRole('button', { name: /^Remove / })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Grant access' })).toBeNull()
  })
})
