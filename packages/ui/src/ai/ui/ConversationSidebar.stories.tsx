import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, screen, userEvent, waitFor, within } from 'storybook/test'
import { AppLink } from '../../components/AppLink'
import { useContextMenu } from '../../components/ContextMenu'
import { Drawer } from '../../components/Drawer'
import { EmptyState } from '../../components/EmptyState'
import { useShortcutFormat } from '../../components/Kbd'
import type { MenuEntry } from '../../components/MenuEntries'
import { StatusDot } from '../../components/StatusBadge'
import { StoryViewport } from '../stories/harness'
import {
  ConversationSidebar,
  type ConversationSidebarGroup,
  sidebarDrawerProps,
} from './ConversationSidebar'
import {
  SidebarRailItem,
  SidebarRow,
  SidebarRowBody,
  type SidebarRowShortcut,
  SidebarToggle,
  useRowDialogs,
  useSessionMenu,
} from './sidebar'

const meta: Meta = {
  title: 'Chat/Conversation sidebar',
  component: ConversationSidebar,
  parameters: { layout: 'fullscreen' },
}

export default meta

type State = 'waiting' | 'running' | 'idle'

interface Task {
  id: string
  title: string
  state: State
  age: string
  /** Where it runs, on the row's second line. */
  host?: string
}

const TASKS: Task[] = [
  { id: 't1', title: 'Approve the schema migration', state: 'waiting', age: '2m' },
  {
    id: 't2',
    title: 'Fix the flaky upload test',
    state: 'running',
    age: '4m',
    host: 'build-runner-2.local',
  },
  {
    id: 't3',
    title: 'Bump the build image and rerun every integration suite',
    state: 'running',
    age: '11m',
    host: 'build-runner-2.local',
  },
  { id: 't4', title: 'Write release notes', state: 'idle', age: '1h' },
  {
    id: 't5',
    title: 'Profile the slow report query on the staging replica',
    state: 'idle',
    age: '3d',
  },
]

const taskHref = (t: Task) => `/tasks/${t.id}?view=log#latest`

const VARIANT = { waiting: 'warning', running: 'success', idle: 'muted' } as const

function grouped(tasks: Task[]): ConversationSidebarGroup<Task>[] {
  return [
    {
      key: 'waiting',
      label: 'Needs you',
      tone: 'attention' as const,
      items: tasks.filter((t) => t.state === 'waiting'),
    },
    { key: 'running', label: 'Running', items: tasks.filter((t) => t.state === 'running') },
    { key: 'idle', label: 'Idle', items: tasks.filter((t) => t.state === 'idle') },
  ].filter((g) => g.items.length > 0)
}

/** A row's Rename and Delete, and Backspace or Delete on the row to delete it, opening on Delete
 *  so Enter answers. */
function useTaskActions(setTasks: (update: (tasks: Task[]) => Task[]) => void) {
  const sessionMenu = useSessionMenu()
  const { text } = useShortcutFormat()
  const { requestDelete, requestRename, dialogs } = useRowDialogs<Task>({
    strings: {
      deleteTitle: 'Delete task?',
      deleteBody: (t) => `“${t.title}” and its history are deleted for good.`,
      deleteAction: 'Delete',
      renameTitle: 'Rename task',
      renameLabel: 'Name',
      renamePlaceholder: 'Task name',
      renameAction: 'Rename',
    },
    nameOf: (t) => t.title,
    onDelete: (t) => {
      setTasks((all) => all.filter((other) => other.id !== t.id))
      return true
    },
    onRename: (t, title) => {
      setTasks((all) => all.map((other) => (other.id === t.id ? { ...other, title } : other)))
      return true
    },
  })
  return {
    dialogs,
    menuItems: (t: Task) => (row: HTMLLIElement) =>
      sessionMenu({
        rename: { onClick: () => requestRename(t) },
        remove: { onClick: () => requestDelete(t, row), shortcut: text('Backspace') },
      }),
    shortcuts: (t: Task): SidebarRowShortcut[] => [
      {
        keys: ['Backspace', 'Delete'],
        onPress: (row) => requestDelete(t, row, { initialFocus: 'confirm' }),
      },
    ],
  }
}

function TaskSidebar({
  tasks: initialTasks,
  startCollapsed,
  links = false,
  fill = false,
  keyboard = false,
  groupsStorageKey = 'storyTaskSidebarGroups',
  onToggle,
}: {
  tasks: Task[]
  startCollapsed: boolean
  groupsStorageKey?: string
  fill?: boolean
  onToggle?: () => void
  /** Rows and rail items are links to their task, as a routed list's are. */
  links?: boolean
  /** Rows rename and delete from their menu, and delete from the keyboard. */
  keyboard?: boolean
}) {
  const [collapsed, setCollapsed] = useState(startCollapsed)
  const [tasks, setTasks] = useState(initialTasks)
  const [openId, setOpenId] = useState<string | undefined>('t2')
  const { openMenu, contextMenu } = useContextMenu()
  const actions = useTaskActions(setTasks)
  const open = tasks.find((t) => t.id === openId)
  return (
    <StoryViewport>
      <ConversationSidebar<Task>
        label="Tasks"
        collapsed={collapsed}
        fill={fill}
        onToggle={onToggle ?? (() => setCollapsed((c) => !c))}
        toggleLabels={{ open: 'Open sidebar', close: 'Close sidebar' }}
        resize={{
          storageKey: 'storyTaskSidebarWidth',
          label: 'Resize task list',
          hint: 'Drag to resize; double-click to reset',
        }}
        groups={grouped(tasks)}
        groupsStorageKey={groupsStorageKey}
        getKey={(t) => t.id}
        cycle={{ current: open, onSelect: (t) => setOpenId(t.id) }}
        placeholder={<EmptyState variant="bare" title="No tasks yet" />}
        renderRow={(t) => {
          const body = (
            <SidebarRowBody
              leading={t.state !== 'idle' && <StatusDot variant={VARIANT[t.state]} size={6} />}
              title={t.title}
              time={t.age}
              detail={
                t.host && <span className="truncate font-mono theme-muted-text">{t.host}</span>
              }
            />
          )
          return (
            <SidebarRow
              selected={t.id === openId}
              openMenu={openMenu}
              menuItems={keyboard ? actions.menuItems(t) : RENAME_ONLY}
              shortcuts={keyboard ? actions.shortcuts(t) : undefined}
            >
              {links ? (
                <AppLink
                  href={taskHref(t)}
                  onClick={() => setOpenId(t.id)}
                  className="flex min-w-0 flex-1 py-1 text-left"
                >
                  {body}
                </AppLink>
              ) : (
                <button
                  type="button"
                  onClick={() => setOpenId(t.id)}
                  className="flex min-w-0 flex-1 py-1 text-left"
                >
                  {body}
                </button>
              )}
            </SidebarRow>
          )
        }}
        rail={tasks
          .filter((t) => t.state !== 'idle')
          .map((t) => (
            <SidebarRailItem
              key={t.id}
              label={t.title}
              selected={t.id === openId}
              href={links ? taskHref(t) : undefined}
              onSelect={() => setOpenId(t.id)}
            >
              <StatusDot variant={VARIANT[t.state]} />
            </SidebarRailItem>
          ))}
      >
        {contextMenu}
        {keyboard && actions.dialogs}
      </ConversationSidebar>
    </StoryViewport>
  )
}

const RENAME_ONLY: MenuEntry[] = [{ label: 'Rename', onClick: () => {} }]

export const Grouped: StoryObj<{ collapsed: boolean; fill: boolean; links: boolean }> = {
  args: { collapsed: false, fill: false, links: false },
  argTypes: {
    collapsed: { control: 'boolean' },
    links: {
      control: 'boolean',
      description: 'Rows and rail items link to their task (SidebarRailItem `href`)',
    },
    fill: {
      control: 'boolean',
      description: 'Take the container width, with no rail or drag handle (as in a drawer)',
    },
  },
  render: (args) => (
    <TaskSidebar
      key={String(args.collapsed)}
      tasks={TASKS}
      startCollapsed={args.collapsed}
      fill={args.fill}
      links={args.links}
    />
  ),
}

/** The collapsed rail of a routed list: each item is a link to its task, so it opens in a new
 *  tab and shows its URL on hover. */
export const RailLinks: StoryObj<{ collapsed: boolean; fill: boolean; links: boolean }> = {
  ...Grouped,
  args: { collapsed: true, fill: false, links: true },
  play: async ({ canvasElement }) => {
    const item = within(canvasElement).getByRole('link', { name: 'Fix the flaky upload test' })
    await expect(item).toHaveAttribute('href', '/tasks/t2?view=log#latest')
  },
}

/** A row reached from the keyboard rings its whole highlight, not the smaller box of its link. */
export const KeyboardFocus: StoryObj<{ collapsed: boolean; fill: boolean; links: boolean }> = {
  ...Grouped,
  args: { collapsed: false, fill: false, links: true },
  play: async ({ canvasElement }) => {
    const row = within(canvasElement).getByRole('link', { name: /Fix the flaky upload test/ })
    row.focus()
    await expect(row).toHaveFocus()
  },
}

/** ↑ and ↓ move between rows, across groups, and Home and End to either end. Backspace or Delete
 *  on a row asks to delete it, opening on Delete so Enter answers, and once the row is gone focus
 *  is on the row that took its place. The menu shows the key beside Delete. */
export const KeyboardActions: StoryObj<{ links: boolean }> = {
  args: { links: true },
  argTypes: { links: { control: 'boolean' } },
  render: (args) => (
    <TaskSidebar
      key={String(args.links)}
      tasks={TASKS}
      startCollapsed={false}
      links={args.links}
      keyboard
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    canvas.getByRole('link', { name: /Approve the schema migration/ }).focus()
    await userEvent.keyboard('{ArrowDown}')
    await expect(canvas.getByRole('link', { name: /Fix the flaky upload test/ })).toHaveFocus()
    await userEvent.keyboard('{Backspace}')
    const dialog = await screen.findByRole('alertdialog', { name: 'Delete task?' })
    await waitFor(() =>
      expect(within(dialog).getByRole('button', { name: 'Delete' })).toHaveFocus(),
    )
  },
}

const FOLDED_GROUPS_KEY = 'storyTaskSidebarFoldedGroups'

/** A group's heading folds its rows away and brings them back, and the list remembers which
 *  groups are folded. A folded group shows how many rows it holds; an open one shows its chevron
 *  on hover. Idle starts folded here. */
export const FoldedGroups: StoryObj<{ folded: string[] }> = {
  args: { folded: ['idle'] },
  argTypes: {
    folded: {
      control: 'check',
      options: ['waiting', 'running', 'idle'],
      description: 'The groups the list remembers folded (`groupsStorageKey`)',
    },
  },
  render: (args) => {
    localStorage.setItem(FOLDED_GROUPS_KEY, JSON.stringify(args.folded))
    return (
      <TaskSidebar
        key={args.folded.join()}
        tasks={TASKS}
        startCollapsed={false}
        groupsStorageKey={FOLDED_GROUPS_KEY}
      />
    )
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const idle = canvas.getByRole('button', { name: 'Idle' })
    await expect(idle).toHaveAttribute('aria-expanded', 'false')
    await expect(idle).toHaveTextContent('Idle2')
    await expect(canvas.queryByText('Write release notes')).toBeNull()
    const running = canvas.getByRole('button', { name: 'Running' })
    await userEvent.click(running)
    await expect(running).toHaveAttribute('aria-expanded', 'false')
    await expect(canvas.queryByText('Fix the flaky upload test')).toBeNull()
    await userEvent.click(running)
    await expect(canvas.getByText('Fix the flaky upload test')).toBeVisible()
  },
}

type InDrawerStoryArgs = { open: boolean }

function InDrawerExample(args: InDrawerStoryArgs) {
  const [open, setOpen] = useState(args.open)
  return (
    <div
      style={{ position: 'relative', overflow: 'hidden', width: 390, height: '100dvh' }}
      className="bg-(--theme-panel-bg)"
    >
      <div className="p-2">
        <SidebarToggle
          collapsed={!open}
          onToggle={() => setOpen(!open)}
          openLabel="Open sidebar"
          closeLabel="Close sidebar"
        />
      </div>
      <Drawer {...sidebarDrawerProps} open={open} onClose={() => setOpen(false)} aria-label="Tasks">
        <TaskSidebar tasks={TASKS} startCollapsed={false} fill onToggle={() => setOpen(false)} />
      </Drawer>
    </div>
  )
}

// A host composing its own list puts it in a Drawer with sidebarDrawerProps on a
// narrow screen: the drawer covers its positioned container, a tap outside,
// Escape or a swipe to the left closes it, and the list fills it.
export const InDrawer: StoryObj<InDrawerStoryArgs> = {
  args: { open: true },
  render: (args) => <InDrawerExample {...args} key={String(args.open)} />,
}

export const Rail: StoryObj = {
  render: () => <TaskSidebar tasks={TASKS} startCollapsed />,
}

export const Empty: StoryObj = {
  render: () => <TaskSidebar tasks={[]} startCollapsed={false} />,
}
