import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fireEvent, screen, userEvent, within } from 'storybook/test'
import { type OpenMenu, useContextMenu } from '../components/ContextMenu'
import type { MenuEntry } from '../components/MenuEntries'
import { StatusBadge } from '../components/StatusBadge'
import { Table } from '../components/Table'
import {
  GroupRow,
  ListActionsHeader,
  listTableProps,
  NameCell,
  RowSelectCheckbox,
} from './ListTable'
import { MoreButton, rowContextMenuProps, useRowMenuActive } from './rowMenu'

const meta: Meta = {
  title: 'UI/List',
}
export default meta

const ROWS = [
  {
    id: 'a',
    name: 'gpu-cluster',
    subtitle: 'aws · us-east-1',
    status: 'ready',
  },
  {
    id: 'b',
    name: 'archive-bucket',
    subtitle: 'gcp · us-central1',
    status: 'ready',
  },
  {
    id: 'c',
    name: 'dev-workspace',
    subtitle: 'azure · eastus',
    status: 'stopped',
  },
]

function rowMenuItems(name: string): MenuEntry[] {
  return [
    { label: 'Open', onClick: () => {} },
    { label: 'Copy name', copy: { text: name, label: 'name' } },
    { label: 'Delete', destructive: true, onClick: () => {} },
  ]
}

function DemoRow({ row, openMenu }: { row: (typeof ROWS)[number]; openMenu: OpenMenu }) {
  const { active, openMenu: openRowMenu } = useRowMenuActive(openMenu)
  const items = rowMenuItems(row.name)
  return (
    <tr
      className={active ? 'group theme-hover' : 'group hover:theme-hover'}
      {...rowContextMenuProps(openRowMenu, items)}
    >
      <Table.Item className="w-10">
        <div className="flex items-center gap-1">
          <RowSelectCheckbox checked={false} label={`Select ${row.name}`} onToggle={() => {}} />
          <MoreButton open={active} onOpen={(button) => openRowMenu(button, items)} />
        </div>
      </Table.Item>
      <NameCell
        icon={<span className="h-4 w-4 rounded-sm bg-(--theme-accent)" />}
        name={row.name}
        subtitle={row.subtitle}
        href={null}
      />
      <Table.Item>
        <StatusBadge variant={row.status === 'ready' ? 'success' : 'muted'}>
          {row.status}
        </StatusBadge>
      </Table.Item>
    </tr>
  )
}

/** Every row opens the one menu, from its ⋯ button or a right-click. */
function ListDemo() {
  const { openMenu, contextMenu } = useContextMenu()
  return (
    <div className="max-w-2xl">
      <Table {...listTableProps}>
        <ListActionsHeader actionCount={1} />
        <Table.Header>Name</Table.Header>
        <Table.Header>Status</Table.Header>
        <GroupRow label="Connected resources" count={ROWS.length} colSpan={3} />
        {ROWS.map((row) => (
          <DemoRow key={row.id} row={row} openMenu={openMenu} />
        ))}
      </Table>
      {contextMenu}
    </div>
  )
}

export const RowsWithContextMenu: StoryObj = {
  render: () => <ListDemo />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const buttons = await canvas.findAllByRole('button', {
      name: /more actions/i,
    })
    await userEvent.click(buttons[0] as HTMLElement)
    await expect(await screen.findByRole('menuitem', { name: 'Open' })).toBeVisible()
    await userEvent.keyboard('{Escape}')
    // A right-click inside the element, as a pointer's lands.
    const area = canvas.getByText('archive-bucket')
    const { left, top } = area.getBoundingClientRect()
    fireEvent.contextMenu(area, { clientX: left + 8, clientY: top + 8 })
    await expect(await screen.findByRole('menuitem', { name: 'Delete' })).toBeVisible()
  },
}
