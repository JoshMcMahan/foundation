import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, screen, userEvent, waitFor, within } from 'storybook/test'
import {
  ALL_PRINCIPALS,
  applyChange,
  detailsOf,
  GRANTS,
  INHERITED,
  OWNER,
  PEOPLE,
  PERMISSIONS,
  principalsFor,
  RECENT,
  RESOURCE,
  ROLES,
  wait,
} from '../test/access'
import { AccessDrawer, type AccessDrawerProps } from './AccessDrawer'
import type { AccessChange, AccessGrant } from './types'

interface StoryArgs
  extends Pick<
    AccessDrawerProps,
    | 'resourceName'
    | 'readOnly'
    | 'loading'
    | 'defaultArrangement'
    | 'groupCount'
    | 'peopleCount'
    | 'width'
  > {
  readOnlyReason: string
  /** Story only: no grants yet. */
  empty: boolean
  /** Story only: every save fails. */
  failSaves: boolean
  /** Story only: milliseconds a save takes. */
  saveDelay: number
  /** Story only: passes `describeGroup`, answering after this many milliseconds; -1 never does. */
  describeDelay: number | null
  /** Story only: people and groups come from `searchPrincipals`, as from a server, instead of
   *  all up front. */
  asyncSearch: boolean
  /** Story only: passes `recentPrincipalIds`. */
  recent: boolean
  /** Story only: passes `owner`. */
  withOwner: boolean
  /** Story only: passes `inherited`, a role granted to the organization. */
  withInherited: boolean
}

const meta: Meta<StoryArgs> = {
  title: 'UI/Access drawer',
  args: {
    resourceName: RESOURCE,
    readOnly: false,
    readOnlyReason: 'Only people with the Admin role can change it.',
    loading: false,
    defaultArrangement: 'role',
    groupCount: 240,
    peopleCount: PEOPLE.length,
    width: 560,
    empty: false,
    failSaves: false,
    saveDelay: 500,
    describeDelay: 300,
    asyncSearch: false,
    recent: true,
    withOwner: true,
    withInherited: true,
  },
  argTypes: {
    defaultArrangement: { control: 'inline-radio', options: ['role', 'principal'] },
    width: { control: 'text', description: 'Pixels, or a CSS length such as 100%.' },
    describeDelay: {
      control: 'number',
      description: 'Milliseconds `describeGroup` takes; -1 never answers; empty leaves it out.',
    },
  },
  parameters: { layout: 'fullscreen' },
}
export default meta
type Story = StoryObj<StoryArgs>

const failure = () => new Error('The server didn’t respond.')

function Demo({
  readOnlyReason,
  empty,
  failSaves,
  saveDelay,
  describeDelay,
  asyncSearch,
  recent,
  withOwner,
  withInherited,
  ...props
}: StoryArgs) {
  const [open, setOpen] = useState(true)
  const [grants, setGrants] = useState<AccessGrant[]>(empty ? [] : GRANTS)
  // A host passing principals up front passes them all; one that searches passes those it shows.
  const upFront = new Set([...principalsFor(grants).map((principal) => principal.id), ...RECENT])
  const principals = asyncSearch
    ? ALL_PRINCIPALS.filter((principal) => upFront.has(principal.id))
    : ALL_PRINCIPALS
  const onChange = async (change: AccessChange) => {
    await wait(saveDelay)
    if (failSaves) {
      throw failure()
    }
    setGrants((current) => applyChange(current, change))
  }
  return (
    <div className="min-h-screen bg-(--theme-app-bg) p-8 text-(--theme-app)">
      <p className="m-0 text-sm text-(--theme-muted-text-color)">Clusters /</p>
      <h1 className="m-0 mb-4 text-xl font-semibold">{RESOURCE}</h1>
      <button
        type="button"
        className="rounded-md border border-(--theme-border) px-3 py-1.5 text-sm"
        onClick={() => setOpen(true)}
      >
        Manage access
      </button>
      <AccessDrawer
        {...props}
        open={open}
        onClose={() => setOpen(false)}
        roles={ROLES}
        permissions={PERMISSIONS}
        principals={principals}
        grants={grants}
        owner={withOwner ? OWNER : undefined}
        inherited={withInherited && !empty ? INHERITED : undefined}
        onChange={onChange}
        readOnlyReason={readOnlyReason || undefined}
        recentPrincipalIds={recent ? RECENT : undefined}
        describeGroup={
          describeDelay === null || describeDelay === undefined
            ? undefined
            : async (groupId, signal) => {
                await wait(describeDelay < 0 ? 2 ** 31 - 1 : describeDelay, signal)
                return detailsOf(groupId)
              }
        }
        searchPrincipals={
          asyncSearch
            ? async (query, signal) => {
                await wait(400, signal)
                const q = query.toLowerCase()
                return ALL_PRINCIPALS.filter((principal) =>
                  [principal.name, principal.detail].some((text) =>
                    text?.toLowerCase().includes(q),
                  ),
                )
              }
            : undefined
        }
      />
    </div>
  )
}

const render = (args: StoryArgs) => <Demo {...args} />

const drawer = () => screen.findByRole('dialog')

async function expand(name: RegExp) {
  const dialog = await drawer()
  await userEvent.click(await within(dialog).findByRole('button', { name }))
}

async function openGrant() {
  const dialog = await drawer()
  const [button] = within(dialog)
    .getAllByRole('button', { name: 'Grant access' })
    .filter((b) => b.getClientRects().length > 0)
  if (button) {
    await userEvent.click(button)
  }
  return screen.findByRole('combobox', { name: 'People and groups' })
}

async function pickRoles(...names: string[]) {
  const roles = screen.getByRole('combobox', { name: 'Roles' })
  await userEvent.click(roles)
  for (const name of names) {
    await userEvent.type(roles, name)
    await userEvent.click(await screen.findByRole('option', { name }))
  }
  await closeList(roles)
}

/** Closes a field's list, if it is open, without stepping out of the form. */
async function closeList(field: HTMLElement) {
  if (field.getAttribute('aria-expanded') === 'true') {
    await userEvent.keyboard('{Escape}')
  }
}

/** Moves the highlight through the open list until it rests on `name`; up for a row above the
 *  chosen ones, where the highlight starts. */
async function highlight(name: string, key: 'ArrowDown' | 'ArrowUp' = 'ArrowDown') {
  for (let i = 0; i < 12; i++) {
    await userEvent.keyboard(`{${key}}`)
    await wait(50)
    const current = document.querySelector('[role="option"][data-highlighted]')
    // A person's row starts with the initials their face falls back to.
    if (current?.textContent?.includes(name)) {
      return
    }
  }
}

const principalsField = () => screen.getByRole('combobox', { name: 'People and groups' })

async function pickPrincipals(...names: string[]) {
  const principals = principalsField()
  await userEvent.click(principals)
  for (const name of names) {
    await userEvent.type(principals, name)
    await userEvent.click(await screen.findByRole('option', { name }))
  }
}

/** Who has access, role by role: overlap shows as a hint beside the group it applies to. */
export const ByRole: Story = {
  render,
  play: async () => {
    await expand(/^Admin/)
    await expand(/^Login/)
    await expect(await screen.findByText(/Included in Sudo/)).toBeInTheDocument()
  },
}

/** One by one: the owner first, then everyone, then people and groups. A redundant role says
 *  what already covers it, and roles from everyone show beside a group's own. */
export const ByPrincipal: Story = {
  args: { defaultArrangement: 'principal' },
  render,
  play: async () => {
    await expand(/^bio-admins/)
    const redundant = await screen.findByText('Redundant, included in Sudo')
    await waitFor(() => expect(redundant).toBeVisible())
  },
}

/** The grant form, in the same drawer: the button names what it grants. */
export const Grant: Story = {
  render,
  play: async () => {
    await openGrant()
    await pickPrincipals('research-team', 'contractors')
    await closeList(principalsField())
    await pickRoles('Sudo')
    // The open list hides the rest of the drawer from queries, as from a screen reader.
    await expect(screen.getByRole('button', { name: 'Grant Sudo', hidden: true })).toBeEnabled()
    await userEvent.click(screen.getByRole('combobox', { name: 'Roles' }))
  },
}

/** The picker: the pane beside the list follows the highlighted group. */
export const Picker: Story = {
  render,
  play: async () => {
    await openGrant()
    await pickPrincipals('research-team')
    await pickRoles('Sudo')
    await userEvent.click(principalsField())
    await highlight('data-eng')
    await expect(await screen.findByText(/Login will be redundant/)).toBeInTheDocument()
  },
}

/** Everyone highlighted: the pane says how far a grant to everyone reaches. */
export const PickerEveryone: Story = {
  render,
  play: async () => {
    await openGrant()
    await pickPrincipals('research-team')
    await pickRoles('Sudo')
    await userEvent.click(principalsField())
    await highlight('Everyone', 'ArrowUp')
    await expect(await screen.findByText(/Requires confirmation/)).toBeInTheDocument()
  },
}

/** The pane while `describeGroup` is still answering. */
export const GroupDetailsLoading: Story = {
  args: { describeDelay: -1 },
  render,
  play: async () => {
    await openGrant()
    await userEvent.click(principalsField())
    await highlight('data-eng')
  },
}

/** People and groups searched for on the server, for an organization with too many to pass up
 *  front. */
export const AsyncSearch: Story = {
  args: { asyncSearch: true },
  render,
  play: async () => {
    await openGrant()
    await userEvent.type(principalsField(), 'genomics')
    await expect(await screen.findByRole('option', { name: 'genomics-admins' })).toBeVisible()
  },
}

/** The owner has every permission and can't be removed. */
export const Owner: Story = {
  render,
  play: async () => {
    await expand(/^Owner/)
    await expect(await screen.findByText('maya.lopez@example.com')).toBeVisible()
  },
}

/** A role granted to the organization shows here, locked, and isn't offered to grant. */
export const Inherited: Story = {
  render,
  play: async () => {
    await expand(/^Organization admin/)
    const note = await screen.findByText(/Inherited from the organization/)
    await waitFor(() => expect(note).toBeVisible())
  },
}

/** Granting to a person: the pane says which of their groups have access here already. */
export const GrantToPerson: Story = {
  render,
  play: async () => {
    await openGrant()
    await pickPrincipals('Jun Kim')
    await closeList(principalsField())
    await pickRoles('Login')
    await userEvent.click(principalsField())
    await highlight('Ana Ruiz')
    await expect(await screen.findByText('Groups with access')).toBeInTheDocument()
  },
}

/** Taking a role from a person says what they keep through their groups. */
export const RemoveFromPerson: Story = {
  args: { defaultArrangement: 'principal' },
  render,
  play: async () => {
    await expand(/^Tom Becker/)
    await userEvent.click(
      await screen.findByRole('button', { name: 'Remove Tom Becker from Sudo' }),
    )
    const kept = await screen.findByText(/Still has Login via research-team/)
    await waitFor(() => expect(kept).toBeVisible())
  },
}

/** Every one picked has every role picked already, so there is nothing to grant. */
export const NothingToGrant: Story = {
  render,
  play: async () => {
    await openGrant()
    await pickPrincipals('contractors')
    await closeList(principalsField())
    await pickRoles('Login')
    await expect(screen.getByRole('button', { name: 'Grant Login', hidden: true })).toHaveAttribute(
      'aria-disabled',
      'true',
    )
    await expect(screen.getByText('contractors already has Login')).toBeVisible()
  },
}

/** Granting to everyone warns how many people it reaches, and asks to confirm. */
export const GrantToEveryone: Story = {
  render,
  play: async () => {
    await openGrant()
    await pickPrincipals('Everyone')
    await closeList(principalsField())
    await pickRoles('Login')
    await expect(await screen.findByText('Login for all 214 people')).toBeVisible()
  },
}

/** The confirmation that follows, in the footer. */
export const GrantToEveryoneConfirm: Story = {
  render,
  play: async (context) => {
    await GrantToEveryone.play?.(context)
    await userEvent.click(screen.getByRole('button', { name: 'Grant to everyone', hidden: true }))
    await expect(
      await screen.findByRole('group', { name: 'Grant Login to all 214 people?' }),
    ).toBeVisible()
  },
}

/** Taking a role away first says what the group loses, and what it keeps. */
export const Remove: Story = {
  render,
  play: async () => {
    await expand(/^Admin/)
    await userEvent.click(
      await screen.findByRole('button', { name: 'Remove analytics-admins from Admin' }),
    )
    const lost = await screen.findByText('Change who has access')
    await waitFor(() => expect(lost).toBeVisible())
  },
}

/** A save that fails says nothing changed, and offers to try again. */
export const FailedSave: Story = {
  args: { failSaves: true, saveDelay: 300 },
  render,
  play: async () => {
    await expand(/^Sudo/)
    await userEvent.click(
      await screen.findByRole('button', { name: 'Remove bio-admins from Sudo' }),
    )
    await userEvent.click(await screen.findByRole('button', { name: 'Remove Sudo' }))
    await expect(
      await screen.findByText('Couldn’t remove bio-admins from Sudo', {}, { timeout: 3000 }),
    ).toBeVisible()
  },
}

/** Seen by someone who can't change it. */
export const ReadOnly: Story = {
  args: { readOnly: true },
  render,
}

/** Nothing granted yet. */
export const Empty: Story = {
  args: { empty: true, withOwner: false },
  render,
}

/** The grants still loading. */
export const Loading: Story = {
  args: { loading: true },
  render,
}

/** On a phone: the toolbar stacks and Grant access sits at the bottom. */
export const Phone: Story = {
  render,
  globals: { viewport: { value: 'mobile2', isRotated: false } },
  play: async () => {
    await expand(/^Admin/)
  },
}

/** The picker on a phone: no room for the pane, so a line under the highlighted group
 *  stands in for it. */
export const PhonePicker: Story = {
  render,
  globals: { viewport: { value: 'mobile2', isRotated: false } },
  play: async () => {
    await openGrant()
    await userEvent.click(principalsField())
    await highlight('data-eng')
    // The pane, hidden at this width, names them too; the line under the option is what shows.
    await waitFor(() =>
      expect(screen.getAllByText(/Ana Ruiz/).some((line) => line.checkVisibility())).toBe(true),
    )
  },
}
