import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, within } from 'storybook/test'
import { AppLink } from '../../components/AppLink'
import { useContextMenu } from '../../components/ContextMenu'
import { Drawer } from '../../components/Drawer'
import { EmptyState } from '../../components/EmptyState'
import { StatusDot } from '../../components/StatusBadge'
import { StoryViewport } from '../stories/harness'
import {
  ConversationSidebar,
  type ConversationSidebarGroup,
  sidebarDrawerProps,
} from './ConversationSidebar'
import { SidebarRailItem, SidebarRow, SidebarRowTitle, SidebarToggle } from './sidebar'

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
}

const TASKS: Task[] = [
  { id: 't1', title: 'Approve the schema migration', state: 'waiting', age: '2m' },
  { id: 't2', title: 'Fix the flaky upload test', state: 'running', age: '4m' },
  { id: 't3', title: 'Bump the build image', state: 'running', age: '11m' },
  { id: 't4', title: 'Write release notes', state: 'idle', age: '1h' },
  { id: 't5', title: 'Profile the slow report query', state: 'idle', age: '3d' },
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

function TaskSidebar({
  tasks,
  startCollapsed,
  links = false,
  fill = false,
  onToggle,
}: {
  tasks: Task[]
  startCollapsed: boolean
  fill?: boolean
  onToggle?: () => void
  /** Rows and rail items are links to their task, as a routed list's are. */
  links?: boolean
}) {
  const [collapsed, setCollapsed] = useState(startCollapsed)
  const [openId, setOpenId] = useState<string | undefined>('t2')
  const { openMenu, contextMenu } = useContextMenu()
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
        getKey={(t) => t.id}
        cycle={{ current: open, onSelect: (t) => setOpenId(t.id) }}
        placeholder={<EmptyState variant="bare" title="No tasks yet" />}
        renderRow={(t) => (
          <SidebarRow
            selected={t.id === openId}
            openMenu={openMenu}
            menuItems={[{ label: 'Rename', onClick: () => {} }]}
          >
            {links ? (
              <AppLink
                href={taskHref(t)}
                onClick={() => setOpenId(t.id)}
                className="flex min-w-0 flex-1 items-center gap-2 py-1 text-left"
              >
                {t.state !== 'idle' && <StatusDot variant={VARIANT[t.state]} size={6} />}
                <SidebarRowTitle time={t.age}>{t.title}</SidebarRowTitle>
              </AppLink>
            ) : (
              <button
                type="button"
                onClick={() => setOpenId(t.id)}
                className="flex min-w-0 flex-1 items-center gap-2 py-1 text-left"
              >
                {t.state !== 'idle' && <StatusDot variant={VARIANT[t.state]} size={6} />}
                <SidebarRowTitle time={t.age}>{t.title}</SidebarRowTitle>
              </button>
            )}
          </SidebarRow>
        )}
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
      </ConversationSidebar>
    </StoryViewport>
  )
}

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

// A host composing its own list puts it in a Drawer with sidebarDrawerProps on a
// narrow screen: the drawer covers its positioned container, a tap outside,
// Escape or a swipe to the left closes it, and the list fills it.
export const InDrawer: StoryObj<{ open: boolean }> = {
  args: { open: true },
  render: (args) => {
    const Phone = () => {
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
          <Drawer
            {...sidebarDrawerProps}
            open={open}
            onClose={() => setOpen(false)}
            aria-label="Tasks"
          >
            <TaskSidebar
              tasks={TASKS}
              startCollapsed={false}
              fill
              onToggle={() => setOpen(false)}
            />
          </Drawer>
        </div>
      )
    }
    return <Phone key={String(args.open)} />
  },
}

export const Rail: StoryObj = {
  render: () => <TaskSidebar tasks={TASKS} startCollapsed />,
}

export const Empty: StoryObj = {
  render: () => <TaskSidebar tasks={[]} startCollapsed={false} />,
}
