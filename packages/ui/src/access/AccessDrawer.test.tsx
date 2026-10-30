// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { useState } from 'react'
import { UIProvider } from '../components/Provider'
import {
  ALL_PRINCIPALS,
  applyChange,
  detailsOf,
  GRANTS,
  INHERITED,
  OWNER,
  PERMISSIONS,
  PROJECT,
  PROJECT_GRANTS,
  PROJECT_PEOPLE,
  PROJECT_ROLES,
  RECENT,
  RESOURCE,
  ROLES,
} from '../test/access'
import { mockListLayout } from '../test/layout'
import { AccessDrawer, type AccessDrawerProps } from './AccessDrawer'
import {
  alsoHas,
  buildModel,
  covers,
  grantPlan,
  overlapOf,
  removalOf,
  replacedBy,
  warnAboutMisuse,
} from './model'
import type { AccessChange, AccessGrant } from './types'

// jsdom has no layout, so the virtual list would measure its scroller as empty and draw no rows.
beforeAll(() => {
  mockListLayout(400)
})

const role = (id: string) => {
  const found = ROLES.find((r) => r.id === id)
  if (!found) {
    throw new Error(id)
  }
  return found
}
const model = () =>
  buildModel({
    roles: ROLES,
    principals: ALL_PRINCIPALS,
    grants: GRANTS,
    permissions: PERMISSIONS,
    inherited: INHERITED,
    owner: OWNER,
  })
const ids = (roles: readonly { id: string }[]) => roles.map((r) => r.id)

describe('access model', () => {
  it('finds a role covered by another that gives all its permissions', () => {
    expect(covers(role('sudo'), role('login'))).toBe(true)
    expect(covers(role('login'), role('sudo'))).toBe(false)
    expect(covers(role('login'), role('login'))).toBe(false)
    const empty = { id: 'none', name: 'None', permissions: [] }
    expect(covers(role('admin'), empty)).toBe(false)
  })

  it('says which of a group’s roles already cover one, and where else it has it', () => {
    const m = model()
    expect(ids(overlapOf(m, 'g-bio-admins', role('login')).coveredBy)).toEqual(['sudo'])
    expect(overlapOf(m, 'g-contractors', role('login'))).toEqual({
      owner: false,
      coveredBy: [],
      elsewhere: [],
    })
    expect(overlapOf(m, 'g-contractors', role('view')).elsewhere).toEqual([
      { role: role('view'), through: m.everyone },
    ])
    // Everyone isn't covered by itself.
    expect(overlapOf(m, 'everyone', role('view')).elsewhere).toEqual([])
  })

  it('gives a person their groups’ roles and everyone’s, and the owner every role', () => {
    const m = model()
    const priya = overlapOf(m, 'u-priya', role('login'))
    expect(priya.elsewhere.map((h) => h.through?.id)).toEqual(['g-data-eng'])
    expect(overlapOf(m, OWNER, role('admin')).owner).toBe(true)
    expect(alsoHas(m, 'g-org-admins')).toContainEqual({
      role: role('org-admin'),
      from: 'the organization',
    })
  })

  it('loses only what no role it keeps still gives, and names what it keeps', () => {
    const m = model()
    const admin = removalOf(m, 'g-analytics-admins', ['admin'])
    expect(admin.lost).toEqual(['access:manage', 'cluster:root', 'cluster:power', 'cluster:login'])
    expect(admin.keep).toEqual([])
    expect(admin.keepElsewhere.map((h) => [h.role.id, h.through?.id])).toEqual([
      ['view', 'everyone'],
    ])

    const sudo = removalOf(m, 'g-bio-admins', ['sudo'])
    expect(sudo.lost).toEqual(['cluster:root'])
    // Start and stop gives only what Login does of it, so Login alone is named.
    expect(ids(sudo.keep)).toEqual(['login'])

    const login = removalOf(m, 'g-bio-admins', ['login'])
    expect(login.lost).toEqual([])
    expect(ids(login.keep)).toEqual(['sudo'])

    const all = removalOf(m, 'g-bio-admins', ['sudo', 'power', 'login'])
    expect(all.lost).toEqual(['cluster:root', 'cluster:login', 'cluster:power'])
  })

  it('keeps what a person has through their groups, and the owner loses nothing', () => {
    const m = model()
    const tom = removalOf(m, 'u-tom', ['sudo'])
    expect(tom.lost).toEqual(['cluster:root'])
    expect(tom.keepElsewhere.map((h) => [h.role.id, h.through?.id])).toEqual([
      ['login', 'g-research-team'],
    ])
    expect(removalOf(m, OWNER, ['admin'])).toMatchObject({ owner: true, lost: [] })
  })

  it('plans only the grants that add something, and nothing for the owner', () => {
    const plan = grantPlan(model(), ['g-research-team', 'g-contractors', OWNER], ['login', 'sudo'])
    expect(plan.grant).toEqual([
      { principalId: 'g-research-team', roleId: 'sudo' },
      { principalId: 'g-contractors', roleId: 'sudo' },
    ])
    expect(plan.held).toHaveLength(4)
  })

  it('takes a role one holds at a time from whoever holds it, and nothing else', () => {
    const m = buildModel({
      roles: PROJECT_ROLES,
      principals: PROJECT_PEOPLE,
      grants: PROJECT_GRANTS,
    })
    expect(replacedBy(m, [{ principalId: 'u-priya', roleId: 'lead' }])).toEqual([
      { principalId: 'u-tom', roleId: 'lead' },
    ])
    // Granted to its holder, or a role many hold, it takes nothing.
    expect(replacedBy(m, [{ principalId: 'u-tom', roleId: 'lead' }])).toEqual([])
    expect(replacedBy(m, [{ principalId: 'u-priya', roleId: 'deputy' }])).toEqual([])
  })

  it('warns about duplicate and unknown ids', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    warnAboutMisuse({
      roles: [...ROLES, role('view')],
      principals: ALL_PRINCIPALS,
      grants: [...GRANTS, { principalId: 'g-contractors', roleId: 'ghost' }],
      permissions: PERMISSIONS,
      inherited: [{ principalId: 'g-nobody', roleId: 'view', from: 'the organization' }],
      owner: 'u-nobody',
    })
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('two roles share the id "view"'))
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('unknown role "ghost"'))
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('unknown principal "g-nobody"'))
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('the owner "u-nobody"'))
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
      principals={ALL_PRINCIPALS}
      grants={grants}
      owner={OWNER}
      inherited={INHERITED}
      permissions={PERMISSIONS}
      describeGroup={async (id) => detailsOf(id)}
      recentPrincipalIds={RECENT}
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
  return screen.findByRole('combobox', { name: 'People and groups' })
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
  it('counts who has access under the title, the owner and roles from above included', () => {
    render(<Host />)
    expect(screen.getByText(`${RESOURCE} · Everyone, 3 people, 7 groups`)).toBeInTheDocument()
  })

  it('clears the filter on Escape before it closes the drawer', async () => {
    const onClose = vi.fn()
    render(<Host onClose={onClose} />)
    const filter = screen.getByRole('searchbox', { name: 'Filter by role, person or group' })
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
    const principals = await openGrant()
    // The arrows move through the list and Enter picks: Everyone, then the recent groups.
    keyDown(principals, 'ArrowDown')
    await screen.findAllByRole('option')
    keyDown(principals, 'ArrowDown')
    keyDown(principals, 'Enter')
    await choose(principals, 'contractors')
    await choose(screen.getByRole('combobox', { name: 'Roles' }), 'Sudo')
    const grant = screen.getByRole('button', { name: 'Grant Sudo' })
    fireEvent.click(grant)
    await waitFor(() => expect(onChange).toHaveBeenCalled())
    expect(onChange).toHaveBeenCalledWith({
      grant: expect.arrayContaining([
        { principalId: 'g-contractors', roleId: 'sudo' },
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

  it('grants a role to a person', async () => {
    const onChange = vi.fn(async () => {})
    render(<Host onChange={onChange} />)
    const principals = await openGrant()
    await choose(principals, 'Jun Kim')
    await choose(screen.getByRole('combobox', { name: 'Roles' }), 'Login')
    fireEvent.click(screen.getByRole('button', { name: 'Grant Login' }))
    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith({
        grant: [{ principalId: 'u-jun', roleId: 'login' }],
        revoke: [],
      }),
    )
  })

  it('leaves out grants already held, and disables Grant when that is all of them', async () => {
    render(<Host />)
    const principals = await openGrant()
    await choose(principals, 'contractors')
    await choose(screen.getByRole('combobox', { name: 'Roles' }), 'Login')
    const grant = screen.getByRole('button', { name: 'Grant Login' })
    // Focusable, so its reason is read with it, and still not pressable.
    expect(grant).toHaveAttribute('aria-disabled', 'true')
    expect(grant).toHaveAccessibleDescription('contractors already has Login')
  })

  it('shows the owner, who can’t be removed and has nothing left to be granted', async () => {
    render(<Host />)
    fireEvent.click(screen.getByRole('button', { name: /^Owner/ }))
    expect(screen.getByText('maya.lopez@example.com')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Remove Maya Lopez/ })).toBeNull()
    const principals = await openGrant()
    await choose(principals, 'Maya Lopez')
    await choose(screen.getByRole('combobox', { name: 'Roles' }), 'Login')
    expect(screen.getByRole('button', { name: 'Grant Login' })).toHaveAccessibleDescription(
      'Maya Lopez already has Login',
    )
  })

  it('shows a role granted above the resource, locked, and doesn’t offer to grant it', async () => {
    render(<Host />)
    fireEvent.click(screen.getByRole('button', { name: /^Organization admin/ }))
    expect(screen.getByText(/Inherited from the organization/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Remove org-admins/ })).toBeNull()
    await openGrant()
    keyDown(screen.getByRole('combobox', { name: 'Roles' }), 'ArrowDown')
    const offered = (await screen.findAllByRole('option')).map(
      (option) => option.getAttribute('aria-label') ?? option.textContent,
    )
    expect(offered.some((name) => name?.startsWith('Admin'))).toBe(true)
    expect(offered.some((name) => name?.startsWith('Organization admin'))).toBe(false)
  })

  it('labels privileged roles in the role picker, and nowhere in the list', async () => {
    render(<Host />)
    expect(screen.queryByText('Privileged')).toBeNull()
    await openGrant()
    keyDown(screen.getByRole('combobox', { name: 'Roles' }), 'ArrowDown')
    expect(await screen.findByRole('option', { name: /^Sudo/ })).toHaveTextContent('Privileged')
    expect(screen.getByRole('option', { name: /^Login/ })).not.toHaveTextContent('Privileged')
  })

  it('asks before granting to everyone, saying how many people it reaches', async () => {
    const onChange = vi.fn(async () => {})
    render(<Host onChange={onChange} />)
    const principals = await openGrant()
    await choose(principals, 'Everyone')
    await choose(screen.getByRole('combobox', { name: 'Roles' }), 'Login')
    expect(screen.getByText('Login for all 214 people')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Grant to everyone' }))
    const ask = screen.getByRole('group', { name: 'Grant Login to all 214 people?' })
    expect(onChange).not.toHaveBeenCalled()
    fireEvent.click(within(ask).getByRole('button', { name: 'Grant to everyone' }))
    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith({
        grant: [{ principalId: 'everyone', roleId: 'login' }],
        revoke: [],
      }),
    )
  })

  it('steps back on Escape in the grant form, after the open list closes', async () => {
    const onClose = vi.fn()
    render(<Host onClose={onClose} />)
    const principals = await openGrant()
    await waitFor(() => expect(principals).toHaveFocus())
    keyDown(principals, 'ArrowDown')
    await screen.findAllByRole('option')
    keyDown(principals, 'Escape')
    expect(principals).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getByRole('combobox', { name: 'People and groups' })).toBeInTheDocument()
    keyDown(principals, 'Escape')
    await screen.findByRole('searchbox')
    expect(onClose).not.toHaveBeenCalled()
  })

  it('describes each option in a short summary', async () => {
    render(<Host />)
    const principals = await openGrant()
    keyDown(principals, 'ArrowDown')
    const group = await screen.findByRole('option', { name: 'data-eng' })
    expect(group).toHaveAccessibleDescription('24 members, has Login here')
    const person = await screen.findByRole('option', { name: 'Priya Nair' })
    expect(person).toHaveAccessibleDescription('priya.nair@example.com, has Login here')
    expect(screen.getByTestId('combobox-details')).toHaveAttribute('aria-hidden', 'true')
  })

  it('asks before a removal, says what is lost, and saves only the revoke', async () => {
    const onChange = vi.fn(async () => {})
    render(<Host onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: /^Admin/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Remove analytics-admins from Admin' }))
    const ask = screen.getByRole('group', { name: 'Remove analytics-admins from Admin?' })
    expect(within(ask).getByText('Run commands as root')).toBeInTheDocument()
    expect(within(ask).getByText(/Still has View via Everyone/)).toBeInTheDocument()
    fireEvent.click(within(ask).getByRole('button', { name: 'Remove Admin' }))
    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith({
        grant: [],
        revoke: [{ principalId: 'g-analytics-admins', roleId: 'admin' }],
      }),
    )
  })

  it('says what a person keeps through their groups when a role is taken away', () => {
    render(<Host defaultArrangement="principal" />)
    fireEvent.click(screen.getByRole('button', { name: /^Tom Becker/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Remove Tom Becker from Sudo' }))
    const ask = screen.getByRole('group', { name: 'Remove Tom Becker from Sudo?' })
    expect(within(ask).getByText('Permissions lost')).toBeInTheDocument()
    expect(within(ask).getByText('Run commands as root')).toBeInTheDocument()
    expect(within(ask).getByText(/Still has Login via research-team/)).toBeInTheDocument()
  })

  it('says why a save failed in the host’s words, from the error it rejected with', async () => {
    class Coded extends Error {
      readonly code: string
      constructor(code: string) {
        super('raw server text')
        this.code = code
      }
    }
    const onChange = vi
      .fn<(change: AccessChange) => Promise<void>>()
      .mockRejectedValue(new Coded('last_admin'))
    render(
      <Host
        onChange={onChange}
        errorMessage={(error) =>
          error instanceof Coded && error.code === 'last_admin'
            ? 'It needs at least one admin.'
            : undefined
        }
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /^Sudo/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Remove bio-admins from Sudo' }))
    fireEvent.click(screen.getByRole('button', { name: 'Remove Sudo' }))
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('It needs at least one admin. Nothing changed.')
    expect(alert).not.toHaveTextContent('raw server text')
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
    // The error's own words are the server's, not the reader's: they never show.
    expect(alert).toHaveTextContent('Something went wrong. Nothing changed.')
    expect(alert).not.toHaveTextContent('The server didn’t respond')
    expect(screen.getByRole('button', { name: 'Remove bio-admins from Sudo' })).toBeInTheDocument()
    await act(async () => fireEvent.click(within(alert).getByRole('button', { name: 'Retry' })))
    expect(onChange).toHaveBeenCalledTimes(2)
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull())
  })

  it('shows who has access without a way to change it when read-only', () => {
    render(<Host readOnly readOnlyReason="Only people with the Admin role can change it." />)
    expect(screen.getByText(/View only. Only people with the Admin role/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /^Admin/ }))
    expect(screen.queryByRole('button', { name: /^Remove / })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Grant access' })).toBeNull()
  })
})

/** A project with one lead at a time. */
function ProjectHost({
  onChange,
  ...props
}: Partial<AccessDrawerProps> & { onChange?: (change: AccessChange) => Promise<unknown> }) {
  const [grants, setGrants] = useState<AccessGrant[]>(PROJECT_GRANTS)
  return (
    <AccessDrawer
      open
      onClose={() => {}}
      resourceName={PROJECT}
      roles={PROJECT_ROLES}
      principals={PROJECT_PEOPLE}
      grants={grants}
      onChange={async (change) => {
        await onChange?.(change)
        setGrants((current) => applyChange(current, change))
      }}
      {...props}
    />
  )
}

describe('AccessDrawer with a role one holds at a time', () => {
  it('replaces whoever holds a role one holds at a time, saying so first', async () => {
    const onChange = vi.fn(async () => {})
    render(
      <UIProvider>
        <ProjectHost onChange={onChange} />
      </UIProvider>,
    )
    const people = await openGrant()
    await choose(people, 'Priya Nair')
    const roles = screen.getByRole('combobox', { name: 'Roles' })
    fireEvent.change(roles, { target: { value: 'Lead' } })
    keyDown(roles, 'ArrowDown')
    const lead = await screen.findByRole('option', { name: /^Lead/ })
    expect(lead).toHaveTextContent('Replaces Tom Becker')
    fireEvent.click(lead)
    if (roles.getAttribute('aria-expanded') === 'true') {
      keyDown(roles, 'Escape')
    }
    const grant = screen.getByRole('button', { name: 'Grant Lead' })
    expect(grant).toHaveAccessibleDescription('Lead for Priya Nair, replacing Tom Becker')
    fireEvent.click(grant)
    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith({
        grant: [{ principalId: 'u-priya', roleId: 'lead' }],
        revoke: [{ principalId: 'u-tom', roleId: 'lead' }],
      }),
    )
    expect(await screen.findByText('Priya Nair replaced Tom Becker as Lead')).toBeInTheDocument()
  })

  it('names who gets the role, not whom it replaces, when the grant fails', async () => {
    render(
      <ProjectHost
        onChange={async () => {
          throw new Error('The server didn’t respond.')
        }}
      />,
    )
    const people = await openGrant()
    await choose(people, 'Priya Nair')
    await choose(screen.getByRole('combobox', { name: 'Roles' }), 'Lead')
    fireEvent.click(screen.getByRole('button', { name: 'Grant Lead' }))
    expect(await screen.findByText('Couldn’t grant Lead to Priya Nair')).toBeInTheDocument()
  })

  it('says only what was granted when the role goes with others', async () => {
    render(
      <UIProvider>
        <ProjectHost />
      </UIProvider>,
    )
    const people = await openGrant()
    await choose(people, 'Priya Nair')
    const roles = screen.getByRole('combobox', { name: 'Roles' })
    await choose(roles, 'Lead')
    await choose(roles, 'Deputy')
    fireEvent.click(screen.getByRole('button', { name: 'Grant 2 roles' }))
    expect(await screen.findByText('Granted Lead and Deputy to Priya Nair')).toBeInTheDocument()
  })

  it('won’t grant a role one holds at a time to several at once', async () => {
    render(<ProjectHost />)
    const people = await openGrant()
    await choose(people, 'Priya Nair')
    await choose(people, 'Jun Kim')
    await choose(screen.getByRole('combobox', { name: 'Roles' }), 'Lead')
    const grant = screen.getByRole('button', { name: 'Grant Lead' })
    expect(grant).toHaveAttribute('aria-disabled', 'true')
    expect(grant).toHaveAccessibleDescription('Lead goes to one person or group at a time')
  })
})
