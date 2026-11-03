import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, fireEvent, screen, userEvent, within } from 'storybook/test'
import { type OpenMenu, useContextMenu } from '../components/ContextMenu'
import type { MenuEntry } from '../components/MenuEntries'
import { StatusBadge } from '../components/StatusBadge'
import { Table } from '../components/Table'
import { FileTextIcon, StopIcon } from '../icons'
import { GroupRow, ListRow, ListRowActionsProvider } from './ListPage'
import { ListActionsHeader, listTableProps, NameCell, RowSelectCheckbox } from './ListTable'
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
    { label: 'Open console', href: 'https://example.com/console', target: '_blank' },
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

interface LinkedRowsArgs {
  selecting: boolean
  alwaysShowActions: boolean
}

/** Rows that open something have a link, the name's: it shows its URL on hover and opens in a
 *  new tab as any link does, and a click anywhere else on the row opens it too, in a new tab with
 *  a modified or middle click. Its focus ring is drawn around the row. A pinned action that
 *  navigates, such as Logs, is a link too. While selecting, a plain click selects the row
 *  instead. */
export const LinkedRows: StoryObj<LinkedRowsArgs> = {
  args: { selecting: false, alwaysShowActions: true },
  argTypes: {
    selecting: { control: 'boolean', description: 'Multi-selection active: a click selects.' },
    alwaysShowActions: { control: 'boolean', description: 'Pinned actions show at rest.' },
  },
  render: ({ selecting, alwaysShowActions }) => (
    <LinkedRowsDemo {...{ selecting, alwaysShowActions }} />
  ),
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    const name = canvas.getByRole('link', { name: /gpu-cluster/ })
    await expect(name).toHaveAttribute('href', '/clusters/a?tab=overview')
    if (args.selecting) {
      await expect(name).not.toHaveAttribute('data-row-link')
    } else {
      await expect(name).toHaveAttribute('data-row-link')
      await userEvent.click(canvas.getAllByText('ready')[0] as HTMLElement)
      await expect(canvas.getByRole('status')).toHaveTextContent('Opened /clusters/a?tab=overview')
    }
    const logs = canvas.getAllByRole('link', { name: 'Logs' })[0]
    await expect(logs).toHaveAttribute('href', '/clusters/a/logs#latest')
  },
}

/** A row's text selected to copy it, such as its status: the press dragged over it, let go,
 *  is a click on the row, but it doesn't open the row. The next click does. */
export const SelectedRowText: StoryObj<LinkedRowsArgs> = {
  ...LinkedRows,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const status = canvas.getAllByText('ready')[1] as HTMLElement
    // As the drag leaves it: the play can't drag the browser's own selection.
    const range = document.createRange()
    range.selectNodeContents(status)
    window.getSelection()?.removeAllRanges()
    window.getSelection()?.addRange(range)
    fireEvent.click(status)
    await expect(canvas.getByRole('status')).toHaveTextContent('Nothing opened')
    await expect(window.getSelection()?.toString()).toBe('ready')
  },
}

function LinkedRowsDemo({ selecting, alwaysShowActions }: LinkedRowsArgs) {
  const { openMenu, contextMenu } = useContextMenu()
  // Where the rows' clicks went, as a host's router would go there.
  const [opened, setOpened] = useState<string | null>(null)
  const [selected, setSelected] = useState<string[]>([])
  const toggle = (id: string) =>
    setSelected((ids) => (ids.includes(id) ? ids.filter((i) => i !== id) : [...ids, id]))
  // Wide enough (44rem) for pinned actions to show beside ⋯.
  return (
    <div className="max-w-3xl @container">
      <ListRowActionsProvider
        view={{ showActions: true, alwaysShowActions, columnClasses: [], columnStacks: [] }}
      >
        <Table {...listTableProps}>
          <Table.Header className="w-10" />
          <Table.Header>Name</Table.Header>
          <Table.Header>Status</Table.Header>
          <ListActionsHeader actionCount={2} />
          {ROWS.map((row) => (
            <ListRow
              key={row.id}
              href={`/clusters/${row.id}?tab=overview`}
              items={rowMenuItems(row.name)}
              goTo={setOpened}
              openMenu={openMenu}
              selected={selected.includes(row.id)}
              selectionActive={selecting}
              onRowSelect={() => toggle(row.id)}
              leading={
                <Table.Item className="w-10">
                  <RowSelectCheckbox
                    checked={selected.includes(row.id)}
                    label={`Select ${row.name}`}
                    onToggle={() => toggle(row.id)}
                  />
                </Table.Item>
              }
              pinnedActions={[
                {
                  key: 'logs',
                  label: 'Logs',
                  icon: <FileTextIcon />,
                  href: `/clusters/${row.id}/logs#latest`,
                },
                {
                  key: 'stop',
                  label: 'Stop',
                  icon: <StopIcon />,
                  onClick: () => {},
                  disabled: row.status === 'stopped',
                  disabledReason: 'Already stopped',
                },
              ]}
            >
              <NameCell
                icon={<span className="h-4 w-4 rounded-sm bg-(--theme-accent)" />}
                name={row.name}
                subtitle={row.subtitle}
                href={`/clusters/${row.id}?tab=overview`}
              />
              <Table.Item>
                <StatusBadge variant={row.status === 'ready' ? 'success' : 'muted'}>
                  {row.status}
                </StatusBadge>
              </Table.Item>
            </ListRow>
          ))}
        </Table>
      </ListRowActionsProvider>
      <p role="status" className="mt-3 px-4 text-xs text-(--theme-muted-text-color)">
        {opened ? `Opened ${opened}` : 'Nothing opened'}
      </p>
      {contextMenu}
    </div>
  )
}
