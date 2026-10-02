import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, screen, userEvent, within } from 'storybook/test'
import { StatusBadge } from '../components/StatusBadge'
import { Table } from '../components/Table'
import {
  GroupRow,
  ListActionsHeader,
  listTableProps,
  NameCell,
  RowSelectCheckbox,
} from './ListTable'
import { MoreButton, type RowMenuItem, useRowMenu } from './RowContextMenu'

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

function rowMenuItems(name: string): RowMenuItem[] {
  return [
    { kind: 'action', label: 'Open', onSelect: () => {} },
    { kind: 'action', label: 'Copy name', copy: { text: name, label: 'name' } },
    { kind: 'action', label: 'Delete', destructive: true, onSelect: () => {} },
  ]
}

function ListDemo() {
  const { openMenu, contextMenu } = useRowMenu()
  return (
    <div className="max-w-2xl">
      <Table {...listTableProps}>
        <ListActionsHeader actionCount={1} />
        <Table.Header>Name</Table.Header>
        <Table.Header>Status</Table.Header>
        <GroupRow label="Connected resources" count={ROWS.length} colSpan={3} />
        {ROWS.map((row) => (
          <tr key={row.id} className="group">
            <Table.Item className="w-10">
              <div className="flex items-center gap-1">
                <RowSelectCheckbox
                  checked={false}
                  label={`Select ${row.name}`}
                  onToggle={() => {}}
                />
                <MoreButton onOpen={(x, y) => openMenu(x, y, rowMenuItems(row.name))} />
              </div>
            </Table.Item>
            <NameCell
              icon={<span className="h-4 w-4 rounded-sm bg-(--theme-element)" />}
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
    // The menu portals to document.body.
    await expect(await screen.findByRole('menu')).toBeVisible()
  },
}
