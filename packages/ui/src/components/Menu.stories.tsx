import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, fireEvent, screen, userEvent, waitFor, within } from 'storybook/test'
import { AddIcon, ClipboardIcon, EditIcon, TrashIcon } from '../icons'
import { ActionMenu } from './ActionMenu'
import { useContextMenu } from './ContextMenu'
import { type MenuEntry, type MenuSearch, menuDivider } from './MenuEntries'

const meta: Meta = {
  title: 'UI/Menus',
}
export default meta

const triggerClassName = 'rounded-md border theme-border px-3 py-1.5 text-sm hover:theme-hover'

function useItems(): MenuEntry[] {
  const [wrap, setWrap] = useState(true)
  return [
    { label: 'Rename', icon: <EditIcon />, onClick: () => {} },
    { label: 'Open in a new tab', href: '#details' },
    {
      label: 'Copy',
      icon: <ClipboardIcon />,
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
