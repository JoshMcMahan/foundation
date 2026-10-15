import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, screen, userEvent, waitFor, within } from 'storybook/test'
import {
  ALL_GROUPS,
  applyChange,
  detailsOf,
  GRANTS,
  PERMISSIONS,
  RECENT,
  RESOURCE,
  ROLES,
  wait,
} from '../test/access'
import { AccessDrawer, type AccessDrawerProps } from './AccessDrawer'
import type { AccessChange, AccessGrant, AccessGroup } from './types'

interface StoryArgs
  extends Pick<
    AccessDrawerProps,
    'resourceName' | 'readOnly' | 'loading' | 'defaultArrangement' | 'groupCount' | 'width'
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
  /** Story only: groups come from `searchGroups`, as from a server, instead of all up front. */
  asyncSearch: boolean
  /** Story only: passes `recentGroupIds`. */
  recent: boolean
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
    width: 560,
    empty: false,
    failSaves: false,
    saveDelay: 500,
    describeDelay: 300,
    asyncSearch: false,
    recent: true,
  },
  argTypes: {
    defaultArrangement: { control: 'inline-radio', options: ['role', 'group'] },
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
  ...props
}: StoryArgs) {
  const [open, setOpen] = useState(true)
  const [grants, setGrants] = useState<AccessGrant[]>(empty ? [] : GRANTS)
  // A host passing groups up front passes them all; one that searches passes those it shows.
  const groups: AccessGroup[] = asyncSearch
    ? ALL_GROUPS.filter(
        (group) =>
          group.kind === 'everyone' ||
          grants.some((grant) => grant.groupId === group.id) ||
          RECENT.includes(group.id),
      )
    : ALL_GROUPS
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
        groups={groups}
        grants={grants}
        onChange={onChange}
        readOnlyReason={readOnlyReason || undefined}
        recentGroupIds={recent ? RECENT : undefined}
        describeGroup={
          describeDelay === null || describeDelay === undefined
            ? undefined
            : async (groupId, signal) => {
                await wait(describeDelay < 0 ? 2 ** 31 - 1 : describeDelay, signal)
                return detailsOf(groupId)
              }
        }
        searchGroups={
          asyncSearch
            ? async (query, signal) => {
                await wait(400, signal)
                const q = query.toLowerCase()
                return ALL_GROUPS.filter((group) => group.name.toLowerCase().includes(q))
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
  return screen.findByRole('combobox', { name: 'Groups' })
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
    if (current?.textContent?.startsWith(name)) {
      return
    }
  }
}

async function pickGroups(...names: string[]) {
  const groups = screen.getByRole('combobox', { name: 'Groups' })
  await userEvent.click(groups)
  for (const name of names) {
    await userEvent.type(groups, name)
    await userEvent.click(await screen.findByRole('option', { name }))
  }
}

/** Who has access, role by role: overlap shows as a hint beside the group it applies to. */
export const ByRole: Story = {
  render,
  play: async () => {
    await expand(/^Admin/)
    await expand(/^Login/)
    await expect(await screen.findByText(/Sudo covers this too/)).toBeInTheDocument()
  },
}

/** Group by group: a redundant role says what already covers it, and roles from everyone show
 *  beside the group's own. */
export const ByGroup: Story = {
  args: { defaultArrangement: 'group' },
  render,
  play: async () => {
    await expand(/^bio-admins/)
    const redundant = await screen.findByText('Redundant: Sudo already covers this.')
    await waitFor(() => expect(redundant).toBeVisible())
  },
}

/** The grant form, in the same drawer: the button names what it grants. */
export const Grant: Story = {
  render,
  play: async () => {
    await openGrant()
    await pickGroups('research-team', 'contractors')
    await closeList(screen.getByRole('combobox', { name: 'Groups' }))
    await pickRoles('Sudo')
    // The open list hides the rest of the drawer from queries, as from a screen reader.
    await expect(screen.getByRole('button', { name: 'Grant Sudo', hidden: true })).toBeEnabled()
    await userEvent.click(screen.getByRole('combobox', { name: 'Roles' }))
  },
}

/** The group picker: the pane beside the list follows the highlighted group. */
export const GroupPicker: Story = {
  render,
  play: async () => {
    await openGrant()
    await pickGroups('research-team')
    await pickRoles('Sudo')
    await userEvent.click(screen.getByRole('combobox', { name: 'Groups' }))
    await highlight('data-eng')
    await expect(await screen.findByText(/Login becomes redundant/)).toBeInTheDocument()
  },
}

/** Everyone highlighted: the pane says how far a grant to everyone reaches. */
export const GroupPickerEveryone: Story = {
  render,
  play: async () => {
    await openGrant()
    await pickGroups('research-team')
    await pickRoles('Sudo')
    await userEvent.click(screen.getByRole('combobox', { name: 'Groups' }))
    await highlight('Everyone', 'ArrowUp')
    await expect(await screen.findByText(/You’ll be asked to confirm/)).toBeInTheDocument()
  },
}

/** The pane while `describeGroup` is still answering. */
export const GroupDetailsLoading: Story = {
  args: { describeDelay: -1 },
  render,
  play: async () => {
    await openGrant()
    await userEvent.click(screen.getByRole('combobox', { name: 'Groups' }))
    await highlight('data-eng')
  },
}

/** Groups searched for on the server, for an organization with too many to pass up front. */
export const AsyncSearch: Story = {
  args: { asyncSearch: true },
  render,
  play: async () => {
    await openGrant()
    const groups = screen.getByRole('combobox', { name: 'Groups' })
    await userEvent.type(groups, 'genomics')
    await expect(await screen.findByRole('option', { name: 'genomics-admins' })).toBeVisible()
  },
}

/** Every group picked has every role picked already, so there is nothing to grant. */
export const NothingToGrant: Story = {
  render,
  play: async () => {
    await openGrant()
    await pickGroups('contractors')
    await closeList(screen.getByRole('combobox', { name: 'Groups' }))
    await pickRoles('Login')
    await expect(screen.getByRole('button', { name: 'Grant Login', hidden: true })).toHaveAttribute(
      'aria-disabled',
      'true',
    )
    await expect(screen.getByText(/so there’s nothing to grant/)).toBeVisible()
  },
}

/** Granting to everyone warns how many people it reaches, and asks to confirm. */
export const GrantToEveryone: Story = {
  render,
  play: async () => {
    await openGrant()
    await pickGroups('Everyone')
    await closeList(screen.getByRole('combobox', { name: 'Groups' }))
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
  args: { empty: true },
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

/** The group picker on a phone: no room for the pane, so a line under the highlighted group
 *  stands in for it. */
export const PhoneGroupPicker: Story = {
  render,
  globals: { viewport: { value: 'mobile2', isRotated: false } },
  play: async () => {
    await openGrant()
    await userEvent.click(screen.getByRole('combobox', { name: 'Groups' }))
    await highlight('data-eng')
    // The pane, hidden at this width, names them too; the line under the option is what shows.
    await waitFor(() =>
      expect(screen.getAllByText(/Ana Ruiz/).some((line) => line.checkVisibility())).toBe(true),
    )
  },
}
