import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, fireEvent, screen, userEvent, waitFor, within } from 'storybook/test'
import {
  AddIcon,
  ChevronDownIcon,
  CopyIcon,
  DownloadIcon,
  FolderIcon,
  GridIcon,
  HelpIcon,
  MoreIcon,
  RenameIcon,
  SettingsIcon,
  SignOutIcon,
  TerminalIcon,
  TrashIcon,
} from '../icons'
import { MoreButton, rowContextMenuProps, useRowMenuActive } from '../list/rowMenu'
import { ActionMenu } from './ActionMenu'
import { Avatar } from './Avatar'
import { buttonClasses } from './buttonClasses'
import { type OpenMenu, useContextMenu, useOpenMenu } from './ContextMenu'
import type { MenuSize } from './Menu'
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

const dot = (color: string) => (
  <span aria-hidden="true" className="size-2 rounded-full" style={{ backgroundColor: color }} />
)

function useRichItems(): MenuEntry[] {
  const [labels, setLabels] = useState<string[]>(['customer'])
  const toggle = (label: string) =>
    setLabels((on) => (on.includes(label) ? on.filter((l) => l !== label) : [...on, label]))
  return [
    {
      group: 'Switch product',
      items: [
        {
          label: 'Compute',
          description: 'Clusters · Sessions · IP addresses',
          icon: <TerminalIcon />,
          href: '#compute',
          current: true,
        },
        {
          label: 'Storage',
          description: 'Buckets · Disks · Snapshots',
          icon: <GridIcon />,
          href: '#storage',
        },
      ],
    },
    menuDivider,
    {
      label: 'Status',
      shortcut: 'S',
      items: [
        { label: 'Todo', onClick: () => {} },
        { label: 'In progress', onClick: () => {} },
        { label: 'Done', onClick: () => {} },
      ],
    },
    {
      label: 'Labels',
      shortcut: 'L',
      items: [
        {
          label: 'customer',
          icon: dot('#3b82f6'),
          checked: labels.includes('customer'),
          onClick: () => toggle('customer'),
        },
        {
          label: 'bug',
          icon: dot('#ef4444'),
          checked: labels.includes('bug'),
          onClick: () => toggle('bug'),
        },
      ],
    },
    {
      label: 'Milestone',
      shortcut: 'M',
      disabled: true,
      disabledReason: 'This team has no milestones yet',
      items: [{ label: 'v1', onClick: () => {} }],
    },
    menuDivider,
    {
      label: 'Changelog, new entries',
      icon: <HelpIcon />,
      badge: <span className="size-2 rounded-full bg-(--theme-info)" />,
      onClick: () => {},
    },
    { label: 'User guide', href: 'https://example.com/guide', target: '_blank' },
    { label: 'Clear terminal', shortcut: '⌘K', onClick: () => {} },
  ]
}

/** Rows with more to say: a description line, a group heading, the current page checked, a
 *  shortcut in plain text, a check that keeps the label's color dot, a disabled submenu with its
 *  reason, an unseen badge, and a link that opens a new tab. `size="sm"` makes 12px rows for a
 *  compact toolbar. */
export const RichRows: StoryObj<{ size: MenuSize }> = {
  args: { size: 'md' },
  argTypes: { size: { control: 'inline-radio', options: ['md', 'sm'] } },
  render: function Render({ size }) {
    return (
      <ActionMenu
        label="Issue actions"
        size={size}
        items={useRichItems()}
        triggerClassName={triggerClassName}
      >
        Issue actions
      </ActionMenu>
    )
  },
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole('button', { name: 'Issue actions' }))
    await expect(await screen.findByRole('group', { name: 'Switch product' })).toBeVisible()
    await expect(screen.getByRole('menuitem', { name: /Compute/ })).toHaveAttribute(
      'aria-current',
      'page',
    )
  },
}

/** Icons of different sizes, a 16px glyph, a 14px one and a color dot, sit in one 16px slot,
 *  so every label starts on the same line. A copy without a noun still confirms it copied. */
export const MixedIconSizes: StoryObj = {
  render: () => (
    <ActionMenu
      label="Label actions"
      items={[
        { label: 'Rename', icon: <RenameIcon className="size-4" />, onClick: () => {} },
        { label: 'Move to folder', icon: <FolderIcon className="size-3.5" />, onClick: () => {} },
        {
          label: 'Bug',
          icon: <span className="size-2 rounded-full bg-(--theme-error)" />,
          onClick: () => {},
        },
        { label: 'Copy link', icon: <CopyIcon className="size-3.5" />, copy: { text: '#bug' } },
        menuDivider,
        {
          label: 'Delete',
          icon: <TrashIcon className="size-4" />,
          destructive: true,
          onClick: () => {},
        },
      ]}
    >
      <MoreIcon />
    </ActionMenu>
  ),
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole('button', { name: 'Label actions' }))
    const labels = ['Rename', 'Move to folder', 'Bug', 'Copy link', 'Delete'].map(
      (name) => screen.getByText(name).getBoundingClientRect().left,
    )
    await expect(new Set(labels.map(Math.round)).size).toBe(1)
  },
}

/** The same rows at `size="sm"`, as a 12px toolbar's menus use. */
export const Compact: StoryObj = {
  render: function Render() {
    return (
      <div className="flex items-center gap-1 rounded-md border theme-border p-1 text-xs">
        <span className="px-1.5">notebook.ipynb</span>
        <ActionMenu label="Notebook actions" size="sm" items={useRichItems()}>
          <MoreIcon />
        </ActionMenu>
      </div>
    )
  },
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole('button', { name: 'Notebook actions' }))
    await expect(await screen.findByRole('menu')).toHaveAttribute('data-size', 'sm')
  },
}

/** A trigger of the host's own, here a button with visible text and a chevron, which needs no
 *  tooltip. `side` opens it above, `matchTriggerWidth` keeps it at least as wide, and `disabled`
 *  stops it opening while there is nothing to act on. */
export const CustomTrigger: StoryObj<{
  side: 'top' | 'bottom'
  matchTriggerWidth: boolean
  disabled: boolean
}> = {
  args: { side: 'bottom', matchTriggerWidth: true, disabled: false },
  argTypes: { side: { control: 'inline-radio', options: ['bottom', 'top'] } },
  render: ({ side, matchTriggerWidth, disabled }) => (
    <div className="flex min-h-80 items-center p-8">
      <ActionMenu
        label="Export"
        side={side}
        matchTriggerWidth={matchTriggerWidth}
        disabled={disabled}
        items={[
          { label: 'CSV', icon: <DownloadIcon />, onClick: () => {} },
          { label: 'JSON', icon: <DownloadIcon />, onClick: () => {} },
          { label: 'Open the API docs', href: 'https://example.com/api', target: '_blank' },
        ]}
        trigger={
          <button type="button" className={buttonClasses({ variant: 'secondary' })}>
            Export events from the last 30 days
            <ChevronDownIcon className="size-3 opacity-60" />
          </button>
        }
      />
    </div>
  ),
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole('button', { name: /Export events/ }))
    await expect(await screen.findByRole('menu', { name: 'Export' })).toBeVisible()
  },
}

/** Who is signed in heads the menu, above the rows and not among the choices, and one action is
 *  pinned under them, ruled off: here a switcher with its current organization checked. */
export const HeaderAndFooter: StoryObj = {
  render: () => (
    <div className="p-8">
      <ActionMenu
        label="Account"
        trigger={
          <button type="button" className={buttonClasses({ variant: 'ghost' })}>
            <Avatar name="Ada Okafor" size="sm" decorative />
            Ada Okafor
            <ChevronDownIcon className="size-3 opacity-60" />
          </button>
        }
        header={
          <div className="flex flex-col">
            <span className="text-sm font-medium">Ada Okafor</span>
            <span className="text-xs theme-muted-text">ada@example.com · v4.12.0</span>
          </div>
        }
        items={[
          {
            group: 'Organizations',
            items: [
              {
                label: 'Northwind',
                icon: <Avatar name="Northwind" size="xs" decorative />,
                href: '#northwind',
                current: true,
              },
              {
                label: 'Contoso',
                icon: <Avatar name="Contoso" size="xs" decorative />,
                href: '#contoso',
              },
              {
                label: 'Fabrikam',
                icon: <Avatar name="Fabrikam" size="xs" decorative />,
                href: '#fabrikam',
              },
            ],
          },
          menuDivider,
          { label: 'Settings', icon: <SettingsIcon />, href: '#settings' },
          { label: 'Sign out', icon: <SignOutIcon />, destructive: true, onClick: () => {} },
        ]}
        footer={{ label: 'See all organizations', href: '#organizations' }}
      />
    </div>
  ),
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole('button', { name: /Ada Okafor/ }))
    const menu = await screen.findByRole('menu')
    const rows = within(menu).getAllByRole('menuitem')
    await expect(rows.at(-1)).toHaveTextContent('See all organizations')
  },
}

/** No rows: the menu says so instead of opening empty. */
export const Empty: StoryObj = {
  render: () => (
    <ActionMenu
      label="Connect"
      items={[]}
      empty="No connected resources"
      triggerClassName={triggerClassName}
    >
      Connect
    </ActionMenu>
  ),
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole('button', { name: 'Connect' }))
    await expect(await screen.findByText('No connected resources')).toBeVisible()
  },
}

// A host's own stylesheet would hold this, or its utility classes such as
// `[--theme-app-bg:#1f2937]`; the story writes it out, as the package's CSS has no such class.
const TERMINAL_TOKENS = `.story-terminal-menu {
  --theme-app-bg: #1f2937;
  --theme-app: #f9fafb;
  --theme-border: #374151;
  --theme-hover: #374151;
  --theme-muted-text-color: #9ca3af;
  --theme-error-text: #fca5a5;
}`

/** A menu over a terminal takes the terminal's colors by overriding tokens through
 *  `themeClassName`, which its submenus inherit. */
export const TerminalTheme: StoryObj = {
  render: function Render() {
    return (
      <div
        className="flex h-72 items-start justify-end rounded-lg p-2 font-mono text-xs"
        style={{ backgroundColor: '#111827', color: '#e5e7eb' }}
      >
        <style>{TERMINAL_TOKENS}</style>
        <span className="me-auto p-1">ada@login-1:~$</span>
        <ActionMenu
          label="Terminal menu"
          themeClassName="story-terminal-menu"
          align="end"
          items={[
            { label: 'Clear', shortcut: '⌘K', onClick: () => {} },
            {
              label: 'Open in a new window',
              href: 'https://example.com/terminal',
              target: '_blank',
            },
            {
              label: 'Theme',
              items: [
                { label: 'Light', onClick: () => {} },
                { label: 'Dark', checked: true, onClick: () => {} },
              ],
            },
            menuDivider,
            { label: 'Close session', destructive: true, onClick: () => {} },
          ]}
          triggerClassName="rounded p-1 hover:bg-white/10"
        >
          <MoreIcon />
        </ActionMenu>
      </div>
    )
  },
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole('button', { name: 'Terminal menu' }))
    await expect(await screen.findByRole('menuitem', { name: /Clear/ })).toBeVisible()
  },
}

function SharedRow({ name }: { name: string }) {
  const openMenu = useOpenMenu()
  const { active, openMenu: openRowMenu } = useRowMenuActive(openMenu)
  const items = (): MenuEntry[] => [
    { label: 'Rename', icon: <RenameIcon />, shortcut: 'R', onClick: () => {} },
    {
      label: 'Copy link',
      icon: <CopyIcon />,
      copy: { text: `https://example.com/${name}`, label: 'link' },
    },
    {
      label: 'Move to',
      icon: <FolderIcon />,
      items: ['Core', 'Platform', 'Research']
        .filter((team) => team !== name)
        .map((team) => ({ label: team, onClick: () => {} })),
    },
    menuDivider,
    { label: 'Delete', icon: <TrashIcon />, destructive: true, onClick: () => {} },
  ]
  return (
    <li
      className={`group flex h-8 items-center gap-2 rounded-md pr-1 pl-2 text-sm ${active ? 'theme-hover' : 'hover:theme-hover'}`}
      {...rowContextMenuProps(openRowMenu, items)}
    >
      <span className="flex-1 truncate">{name}</span>
      <MoreButton label={`More actions for ${name}`} items={items} />
    </li>
  )
}

/** The one menu `UIProvider` mounts, opened through `useOpenMenu` with nothing to render. A
 *  second press on the more button closes it, and Shift+right-click keeps the browser's menu.
 *  At phone width, Move to opens in the menu's place, with a row back. */
export const SharedMenu: StoryObj = {
  render: () => (
    <ul className="w-64 space-y-0.5">
      {['Core', 'Platform', 'Research'].map((name) => (
        <SharedRow key={name} name={name} />
      ))}
    </ul>
  ),
  play: async ({ canvasElement }) => {
    const button = within(canvasElement).getByRole('button', { name: 'More actions for Core' })
    await userEvent.click(button)
    await expect(await screen.findByRole('menuitem', { name: /Rename/ })).toBeVisible()
    await userEvent.click(button)
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull())
  },
}
