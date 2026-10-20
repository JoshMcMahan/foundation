import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, fireEvent, screen, userEvent, waitFor, within } from 'storybook/test'
import { ShieldIcon } from '../icons'
import {
  applyChange,
  WORKSPACE,
  WORKSPACE_ADMINS,
  WORKSPACE_GRANTS,
  WORKSPACE_PRINCIPALS,
  WORKSPACE_ROLES,
  wait,
} from '../test/access'
import { AccessDrawer, AccessPanel } from './AccessDrawer'
import type { AccessChange, AccessGrant, AccessRule } from './types'

interface StoryArgs {
  /** Passes `singleRole`: each person and group holds one role, picked on its row. */
  singleRole: boolean
  /** Passes `visibility`, the switch between open and only those listed. */
  withVisibility: boolean
  /** Passes `rules`, locked rows ahead of the grants. */
  withRules: boolean
  readOnly: boolean
  /** Passes `managedElsewhere`: access set on what it is part of, read-only with a link there. */
  managed: boolean
  /** Passes `footer`, a note under the list. */
  withFooter: boolean
  /** Passes `errorMessage`, which words a failed save from its error. */
  withErrorMessage: boolean
  /** Story only: every save fails. */
  failSaves: boolean
  /** Story only: milliseconds a save takes. */
  saveDelay: number
}

const meta: Meta<StoryArgs> = {
  title: 'UI/Access panel',
  args: {
    singleRole: true,
    withVisibility: true,
    withRules: true,
    readOnly: false,
    managed: false,
    withFooter: false,
    withErrorMessage: false,
    failSaves: false,
    saveDelay: 400,
  },
  parameters: { layout: 'fullscreen' },
}
export default meta
type Story = StoryObj<StoryArgs>

const RULES: AccessRule[] = [
  {
    id: 'admins',
    icon: <ShieldIcon />,
    title: 'Workspace admins always have access',
    detail: 'Set by who is an admin of the workspace',
    people: WORKSPACE_ADMINS,
    roleId: 'admin',
  },
]

function useAccess({ failSaves, saveDelay }: Pick<StoryArgs, 'failSaves' | 'saveDelay'>) {
  const [grants, setGrants] = useState<AccessGrant[]>(WORKSPACE_GRANTS)
  const [restricted, setRestricted] = useState(true)
  const save = async () => {
    await wait(saveDelay)
    if (failSaves) {
      throw new Error('The server didn’t respond.')
    }
  }
  return {
    grants,
    onChange: async (change: AccessChange) => {
      await save()
      setGrants((current) => applyChange(current, change))
    },
    visibility: {
      restricted,
      openLabel: 'Everyone in the workspace',
      onChange: async (next: boolean) => {
        await save()
        setRestricted(next)
      },
    },
  }
}

const MANAGED = {
  reason: 'This team follows the workspace’s access, so it’s changed there.',
  href: '#workspace-access',
  linkLabel: 'Workspace access',
}

/** As a host words a failure from its error's code; never the error's own message. */
const describeFailure = () => 'The server didn’t answer in time. Try again in a moment.'

function Settings({
  singleRole,
  withVisibility,
  withRules,
  readOnly,
  managed,
  withFooter,
  withErrorMessage,
  grants,
  ...args
}: StoryArgs & { grants?: AccessGrant[] }) {
  const access = useAccess(args)
  return (
    <div className="min-h-screen bg-(--theme-app-bg) px-4 py-8 text-(--theme-app) sm:px-8">
      <div className="mx-auto max-w-2xl">
        <h2 className="m-0 text-base font-semibold">Access</h2>
        <p className="m-0 mt-1 mb-4 text-sm text-(--theme-muted-text-color)">
          Who can see and change {WORKSPACE}.
        </p>
        <AccessPanel
          resourceName={WORKSPACE}
          roles={WORKSPACE_ROLES}
          principals={WORKSPACE_PRINCIPALS}
          grants={grants ?? access.grants}
          onChange={access.onChange}
          singleRole={singleRole}
          visibility={withVisibility ? access.visibility : undefined}
          rules={withRules ? RULES : undefined}
          readOnly={readOnly}
          readOnlyReason="Only workspace admins can change it."
          managedElsewhere={managed ? MANAGED : undefined}
          errorMessage={withErrorMessage ? describeFailure : undefined}
          footer={
            withFooter ? (
              <>
                Guests see only the teams they’re added to.{' '}
                <a
                  href="#guests"
                  className="text-(--theme-link) underline-offset-2 hover:underline"
                >
                  About guests
                </a>
              </>
            ) : undefined
          }
        />
      </div>
    </div>
  )
}

/** Inline in a settings section: who can see it above the list, the fixed rule ahead of the
 *  grants, and one role per person or group, picked on the row. Right-click a row for its menu. */
export const Inline: Story = {
  render: (args) => <Settings {...args} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Workspace admins always have access')).toBeVisible()
    await expect(canvas.getByRole('combobox', { name: 'Role for Lin Zhou' })).toHaveTextContent(
      'Member',
    )
  },
}

/** Switching who can see it saves at once, with Undo in a toast. */
export const Visibility: Story = {
  render: (args) => <Settings {...args} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const open = canvas.getByRole('button', { name: 'Everyone in the workspace' })
    fireEvent.click(open)
    await waitFor(() => expect(open).toHaveAttribute('aria-pressed', 'true'))
  },
}

/** A failed switch says nothing changed and offers to try again. */
export const VisibilityFailed: Story = {
  args: { failSaves: true, saveDelay: 0 },
  render: (args) => <Settings {...args} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    // A click as a mouse makes it: a scripted one also focuses the segment as a keyboard
    // would, and its ring would read as the choice.
    fireEvent.click(canvas.getByRole('button', { name: 'Everyone in the workspace' }))
    await expect(
      await canvas.findByText('Couldn’t change to Everyone in the workspace'),
    ).toBeVisible()
  },
}

/** The grant form takes the panel's place, with a back arrow in its own header. */
export const InlineGrant: Story = {
  render: (args) => <Settings {...args} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const [grant] = canvas
      .getAllByRole('button', { name: 'Grant access' })
      .filter((b) => b.getClientRects().length > 0)
    if (grant) {
      await userEvent.click(grant)
    }
    await expect(await canvas.findByRole('button', { name: 'Back to access' })).toBeVisible()
  },
}

/** A row's right-click menu: its role, checked, and Remove. */
export const RowMenu: Story = {
  render: (args) => <Settings {...args} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const row = canvas.getByText('Lin Zhou')
    const { left, top } = row.getBoundingClientRect()
    fireEvent.contextMenu(row, { clientX: left + 8, clientY: top + 8 })
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Role' }))
    await expect(await screen.findByRole('menuitemcheckbox', { name: /Member/ })).toHaveAttribute(
      'aria-checked',
      'true',
    )
  },
}

/** Read-only: the switch and the roles show, and nothing changes them. */
export const InlineReadOnly: Story = {
  args: { readOnly: true },
  render: (args) => <Settings {...args} />,
}

/** Access set somewhere else, such as a team's that follows its workspace: the list shows,
 *  read-only, under a note that says where, with a link there. */
export const ManagedElsewhere: Story = {
  args: { managed: true },
  render: (args) => <Settings {...args} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('link', { name: 'Workspace access' })).toBeVisible()
    await expect(canvas.queryByRole('button', { name: 'Grant access' })).toBeNull()
  },
}

/** Access set somewhere else with nothing granted here: only the note, not an empty list. */
export const ManagedElsewhereEmpty: Story = {
  args: { managed: true, withVisibility: false, withRules: false },
  render: (args) => <Settings {...args} grants={[]} />,
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).queryByText('No access granted')).toBeNull()
  },
}

/** A note or actions under the list, inside the frame. */
export const WithFooter: Story = {
  args: { withFooter: true },
  render: (args) => <Settings {...args} />,
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole('link', { name: 'About guests' })).toBeVisible()
  },
}

/** A failed save says why in the host's words, from `errorMessage`; without it, a generic
 *  sentence. The error's own message never shows. */
export const SaveFailed: Story = {
  args: { failSaves: true, saveDelay: 0, withErrorMessage: true },
  render: (args) => <Settings {...args} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    // A click as a mouse makes it: a scripted one also focuses the segment as a keyboard
    // would, and its ring would read as the choice.
    fireEvent.click(canvas.getByRole('button', { name: 'Everyone in the workspace' }))
    await expect(
      await canvas.findByText(
        'The server didn’t answer in time. Try again in a moment. Nothing changed.',
      ),
    ).toBeVisible()
  },
}

/** The same editor in a drawer, as a page without a settings section opens it. */
export const InDrawer: Story = {
  render: function Render({
    singleRole,
    withVisibility,
    withRules,
    readOnly,
    managed,
    withErrorMessage,
    withFooter: _footer,
    ...args
  }) {
    const access = useAccess(args)
    const [open, setOpen] = useState(true)
    return (
      <div className="min-h-screen bg-(--theme-app-bg) p-8 text-(--theme-app)">
        <button
          type="button"
          className="rounded-md border border-(--theme-border) px-3 py-1.5 text-sm"
          onClick={() => setOpen(true)}
        >
          Manage access
        </button>
        <AccessDrawer
          open={open}
          onClose={() => setOpen(false)}
          resourceName={WORKSPACE}
          roles={WORKSPACE_ROLES}
          principals={WORKSPACE_PRINCIPALS}
          grants={access.grants}
          onChange={access.onChange}
          singleRole={singleRole}
          visibility={withVisibility ? access.visibility : undefined}
          rules={withRules ? RULES : undefined}
          readOnly={readOnly}
          managedElsewhere={managed ? MANAGED : undefined}
          errorMessage={withErrorMessage ? describeFailure : undefined}
        />
      </div>
    )
  },
  play: async () => {
    const dialog = await screen.findByRole('dialog')
    await expect(within(dialog).getByRole('group', { name: 'Who can see it' })).toBeVisible()
  },
}
