import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, fireEvent, screen, userEvent, waitFor, within } from 'storybook/test'
import { AddIcon, CopyIcon, MoreIcon, RenameIcon, TrashIcon } from '../icons'
import { MoreButton, rowContextMenuProps, useRowMenuActive } from '../list/rowMenu'
import { ActionMenu } from './ActionMenu'
import { type OpenMenu, useContextMenu } from './ContextMenu'
import { type MenuEntry, type MenuSearch, menuDivider } from './MenuEntries'

const meta: Meta = {
  title: 'UI/Menus',
}
export default meta

const triggerClassName = 'rounded-md border theme-border px-3 py-1.5 text-sm hover:theme-hover'

function useItems(): MenuEntry[] {
  const [wrap, setWrap] = useState(true)
  return [
    { label: 'Rename', icon: <RenameIcon />, onClick: () => {} },
    { label: 'Open in a new tab', href: '#details' },
    {
      label: 'Copy',
      icon: <CopyIcon />,
      items: [
        { label: 'Copy name', copy: { text: 'gpu-cluster', label: 'name' } },
        { label: 'Copy ID', copy: { text: 'c-123', label: 'ID' } },
      ],
    },
    { label: 'Wrap lines', checked: wrap, onClick: () => setWrap((on) => !on) },
    {
      label: 'Archive',
      disabled: true,
      disabledReason: 'Stop the cluster before archiving it',
      onClick: () => {},
    },
    menuDivider,
    { label: 'Delete', icon: <TrashIcon />, destructive: true, onClick: () => {} },
  ]
}

/** Every kind of row: a link, a submenu, an on/off choice, a disabled action
 *  with its reason, and a destructive one after a divider. */
export const Actions: StoryObj<{ align: 'start' | 'end' }> = {
  args: { align: 'start' },
  argTypes: { align: { control: 'inline-radio', options: ['start', 'end'] } },
  render: function Render({ align }) {
    return (
      <ActionMenu
        label="Actions"
        align={align}
        items={useItems()}
        triggerClassName={triggerClassName}
      >
        Actions
      </ActionMenu>
    )
  },
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole('button', { name: 'Actions' }))
    await expect(await screen.findByRole('menuitem', { name: /Archive/ })).toHaveAttribute(
      'aria-disabled',
      'true',
    )
    await expect(screen.getByRole('menuitemcheckbox', { name: 'Wrap lines' })).toHaveAttribute(
      'aria-checked',
      'true',
    )
    await userEvent.hover(screen.getByRole('menuitem', { name: 'Copy' }))
    const copyId = await screen.findByRole('menuitem', { name: 'Copy ID' })
    await waitFor(() => expect(copyId).toBeVisible())
  },
}

/** With no `triggerClassName`, the trigger is a ghost icon button named by its
 *  label, which its tooltip shows. */
export const IconTrigger: StoryObj = {
  render: function Render() {
    return (
      <div className="p-8">
        <ActionMenu label="More actions" items={useItems()}>
          <MoreIcon />
        </ActionMenu>
      </div>
    )
  },
  play: async ({ canvasElement }) => {
    const trigger = within(canvasElement).getByRole('button', { name: 'More actions' })
    await userEvent.click(trigger)
    await expect(await screen.findByRole('menu')).toBeVisible()
  },
}

const TYPES: MenuEntry[] = [
  {
    label: 'Basic',
    items: [
      { label: 'Text', keywords: 'string', onClick: () => {} },
      { label: 'Number', onClick: () => {} },
    ],
  },
  {
    label: 'Choices',
    items: [
      { label: 'Dropdown', keywords: 'select', onClick: () => {} },
      { label: 'Radio buttons', keywords: 'radio', onClick: () => {} },
    ],
  },
]

const TYPE_SEARCH: MenuSearch = { placeholder: 'Search types', empty: 'No type matches' }

/** A search narrows the menu to the actions it matches, submenus included. */
export const WithSearch: StoryObj = {
  render: () => (
    <ActionMenu
      label="Add input"
      items={TYPES}
      search={TYPE_SEARCH}
      triggerClassName={triggerClassName}
    >
      <AddIcon className="inline h-3 w-3" /> Add input
    </ActionMenu>
  ),
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole('button', { name: 'Add input' }))
    const search = await screen.findByRole('searchbox', { name: 'Search types' })
    await waitFor(() => expect(search).toHaveFocus())
    await userEvent.type(search, 'radio')
    await expect(screen.getByRole('menuitem', { name: 'Radio buttons' })).toBeVisible()
    await userEvent.clear(search)
    await userEvent.type(search, 'zzz')
    await expect(screen.getByText('No type matches')).toBeVisible()
  },
}

function ContextMenuDemo() {
  const { openMenu, contextMenu } = useContextMenu()
  const items = useItems()
  return (
    <>
      {/* biome-ignore lint/a11y/noStaticElementInteractions: the area's menu is a shortcut; its actions live elsewhere too. */}
      <div
        className="rounded-md border theme-border p-8 text-sm theme-muted-text"
        onContextMenu={(e) => {
          e.preventDefault()
          openMenu(e, items)
        }}
      >
        Right-click anywhere here
      </div>
      {contextMenu}
    </>
  )
}

/** A menu opened at the pointer, as a row's or a canvas's right-click opens it. */
export const AtThePointer: StoryObj = {
  render: () => <ContextMenuDemo />,
  play: async ({ canvasElement }) => {
    // A right-click inside the element, as a pointer's lands.
    const area = within(canvasElement).getByText('Right-click anywhere here')
    const { left, top } = area.getBoundingClientRect()
    fireEvent.contextMenu(area, { clientX: left + 8, clientY: top + 8 })
    await expect(await screen.findByRole('menuitem', { name: 'Rename' })).toBeVisible()
  },
}

function MoreButtonRow({
  name,
  openMenu,
  visible,
  named,
}: {
  name: string
  openMenu: OpenMenu
  visible: boolean
  named: boolean
}) {
  const { active, openMenu: openRowMenu } = useRowMenuActive(openMenu)
  const items = useItems()
  return (
    <li
      className={`group flex h-8 items-center gap-2 rounded-md pr-1 pl-2 text-sm ${active ? 'theme-hover' : 'hover:theme-hover'}`}
      {...rowContextMenuProps(openRowMenu, items)}
    >
      <span className="flex-1 truncate">{name}</span>
      <MoreButton
        open={active}
        visible={visible}
        label={named ? `More actions for ${name}` : undefined}
        onOpen={(button) => openRowMenu(button, items)}
      />
    </li>
  )
}

/** A row's more button opens the same menu as its right-click. With a mouse it
 *  shows on the row's hover; on a touch screen it always shows. `label` names
 *  the row for a screen reader. */
export const MoreButtonOnARow: StoryObj<{ visible: boolean; named: boolean }> = {
  args: { visible: false, named: true },
  argTypes: {
    visible: { control: 'boolean', description: 'Shows at rest too' },
    named: { control: 'boolean', description: 'Passes a label naming the row' },
  },
  render: function Render({ visible, named }) {
    const { openMenu, contextMenu } = useContextMenu()
    return (
      <>
        <ul className="w-64 space-y-0.5">
          {['Core', 'Platform', 'Research'].map((name) => (
            <MoreButtonRow
              key={name}
              name={name}
              openMenu={openMenu}
              visible={visible}
              named={named}
            />
          ))}
        </ul>
        {contextMenu}
      </>
    )
  },
  play: async ({ canvasElement }) => {
    const button = within(canvasElement).getByRole('button', { name: 'More actions for Core' })
    await userEvent.click(button)
    await expect(await screen.findByRole('menuitem', { name: 'Rename' })).toBeVisible()
    await waitFor(() => expect(button).toHaveAttribute('aria-expanded', 'true'))
  },
}
