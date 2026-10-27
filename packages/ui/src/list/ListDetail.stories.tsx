import type { Meta, StoryObj } from '@storybook/react-vite'
import { createContext, useContext, useState } from 'react'
import { expect, userEvent, waitFor, within } from 'storybook/test'
import { buttonClasses } from '../components/buttonClasses'
import { useContextMenu } from '../components/ContextMenu'
import Markdown from '../components/Markdown'
import type { MenuEntry } from '../components/MenuEntries'
import { PageHeader, PageHeaderBar, PageHeaderProvider } from '../components/PageHeader'
import { PageHeaderMenu } from '../components/PageHeaderAction'
import { type UILinkComponent, UIProvider } from '../components/Provider'
import { RelativeTime } from '../components/relativeTime'
import { cx } from '../cx'
import { InboxIcon, NotificationIcon, TrashIcon, WarningIcon } from '../icons'
import type { FilterField } from './filterModel'
import { ListDetail } from './ListDetail'
import { ListFilterBar } from './ListFilterBar'
import { ListPage } from './ListPage'
import { ListToolbar } from './ListToolbar'
import { ListFilterMenu } from './ListViewControls'
import { useListSearch } from './listSearch'
import { useListView } from './listView'
import { MoreButton, rowContextMenuProps, useRowMenuActive } from './rowMenu'

interface Args {
  open: boolean
  listWidth: number
  minDetailWidth: number
}

const meta: Meta<Args> = {
  title: 'UI/List/Detail',
  parameters: { layout: 'fullscreen' },
  args: { open: false, listWidth: 400, minDetailWidth: 320 },
  argTypes: {
    open: { description: 'Opens the first message, as following a link to it would.' },
    listWidth: {
      control: { type: 'number', min: 240, step: 20 },
      description: "The list's width where both panes show.",
    },
    minDetailWidth: {
      control: { type: 'number', min: 200, step: 20 },
      description:
        'The narrowest the detail goes beside the list; narrower than both, one shows at a time.',
    },
  },
}
export default meta

interface Message {
  id: string
  title: string
  body: string
  alert: boolean
  read: boolean
  minutesAgo: number
}

const MESSAGES: Message[] = [
  {
    id: 'm1',
    title: 'Cluster gpu-west is running low on quota',
    body: 'The **gpu-west** cluster has used 92% of its monthly allocation. Jobs queued after the limit is reached wait until the next cycle.\n\nRaise the allocation or move work to another cluster.',
    alert: true,
    read: false,
    minutesAgo: 4,
  },
  {
    id: 'm2',
    title: 'Workflow wind-tunnel-cfd finished',
    body: 'Run 418 completed in 2 h 14 min. Results are in `/results/cfd/418`.',
    alert: false,
    read: false,
    minutesAgo: 38,
  },
  {
    id: 'm3',
    title: 'Maya Okafor shared the storage bucket climate-archive with you',
    body: 'You can now read and write objects in **climate-archive**.',
    alert: false,
    read: false,
    minutesAgo: 95,
  },
  {
    id: 'm4',
    title: 'Scheduled maintenance on Saturday',
    body: 'The login nodes restart between 02:00 and 03:00 UTC. Running jobs are not affected.',
    alert: false,
    read: true,
    minutesAgo: 60 * 26,
  },
  {
    id: 'm5',
    title: 'Job 9921 failed: out of memory on node c-17',
    body: 'The job used 248 GB of the 256 GB requested before it was stopped. Request more memory or split the input.',
    alert: true,
    read: true,
    minutesAgo: 60 * 50,
  },
  {
    id: 'm6',
    title: 'Your API token laptop expires in 7 days',
    body: 'Create a new token before it expires so scripts that use it keep working.',
    alert: false,
    read: true,
    minutesAgo: 60 * 24 * 4,
  },
]

const FIELDS: FilterField<Message>[] = [
  {
    key: 'status',
    label: 'Status',
    kind: 'enum',
    value: (m) => (m.read ? 'read' : 'unread'),
    options: [
      { value: 'unread', label: 'Unread', count: MESSAGES.filter((m) => !m.read).length },
      { value: 'read', label: 'Read', count: MESSAGES.filter((m) => m.read).length },
    ],
  },
  {
    key: 'type',
    label: 'Type',
    kind: 'enum',
    value: (m) => (m.alert ? 'alert' : 'notification'),
    options: [
      { value: 'alert', label: 'Alerts', count: MESSAGES.filter((m) => m.alert).length },
      {
        value: 'notification',
        label: 'Notifications',
        count: MESSAGES.filter((m) => !m.alert).length,
      },
    ],
  },
]

// The story's URL: which message is open, as `?open=<id>`, so the trail's link closes it.
const Navigate = createContext<(href: string) => void>(() => {})

const StoryLink: UILinkComponent = ({ href, onClick, children, ...rest }) => {
  const navigate = useContext(Navigate)
  return (
    <a
      href={href}
      {...rest}
      onClick={(e) => {
        e.preventDefault()
        onClick?.(e)
        navigate(href)
      }}
    >
      {children}
    </a>
  )
}

const ago = (minutes: number) => new Date(Date.now() - minutes * 60_000)

function TypeIcon({ alert }: { alert: boolean }) {
  return alert ? (
    <WarningIcon className="size-3.5 text-(--theme-warning)" />
  ) : (
    <NotificationIcon className="size-3.5 text-(--theme-muted-text-color)" />
  )
}

function Row({
  message,
  selected,
  onSelect,
  openMenu,
}: {
  message: Message
  selected: boolean
  onSelect: () => void
  openMenu: ReturnType<typeof useContextMenu>['openMenu']
}) {
  const items: MenuEntry[] = [
    { label: 'Mark as read', onClick: () => {} },
    { label: 'Delete', icon: <TrashIcon />, destructive: true, onClick: () => {} },
  ]
  const { active, openMenu: openRowMenu } = useRowMenuActive(openMenu)
  return (
    // biome-ignore lint/a11y/useSemanticElements: a button can't hold the row's More button
    <div
      role="button"
      tabIndex={0}
      data-selected={selected || undefined}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault()
          onSelect()
        }
      }}
      {...rowContextMenuProps(openRowMenu, items)}
      className={cx(
        'group grid w-full cursor-pointer items-center rounded-md px-2.5 py-2 text-left',
        selected || active ? 'bg-(--theme-muted-panel-bg)' : 'hover:bg-(--theme-muted-panel-bg)',
      )}
      // Sizes are inline: the package's stylesheet doesn't scan stories.
      style={{ gridTemplateColumns: '16px 1fr auto', columnGap: 10, marginBottom: 2 }}
    >
      <TypeIcon alert={message.alert} />
      <span className="flex min-w-0 items-center gap-1.5">
        {!message.read && <span className="size-1.5 shrink-0 rounded-full bg-(--theme-accent)" />}
        <span
          className={cx(
            'truncate text-sm',
            message.read ? 'text-(--theme-muted-text-color)' : 'font-medium text-(--theme-app)',
          )}
        >
          {message.title}
        </span>
      </span>
      <span className="flex items-center gap-1 whitespace-nowrap">
        <RelativeTime
          value={ago(message.minutesAgo)}
          format="compact"
          className={cx(
            'text-xs text-(--theme-muted-text-color)',
            active ? 'hidden' : 'group-hover:hidden',
          )}
        />
        <MoreButton open={active} onOpen={(button) => openRowMenu(button, items)} />
      </span>
      <span className="col-span-2 col-start-2 truncate text-xs text-(--theme-muted-text-color)">
        {message.body.replace(/[*`]/g, '')}
      </span>
    </div>
  )
}

/** An inbox: the messages beside the one being read, the way a page lays out a list and the item
 *  open from it. The open message is in the URL, so the trail's link back and the browser's back
 *  button both close it. */
function Inbox({ open: openFirst, listWidth, minDetailWidth }: Args) {
  const [openId, setOpenId] = useState<string | null>(openFirst ? 'm1' : null)
  const search = useListSearch(true)
  const view = useListView<Message>({
    storageKey: 'story-inbox',
    columns: [],
    filterFields: FIELDS,
  })
  const { openMenu, contextMenu } = useContextMenu()
  const query = search.filter.trim().toLowerCase()
  const shown = view.applyFilters(MESSAGES.filter((m) => m.title.toLowerCase().includes(query)))
  const open = MESSAGES.find((m) => m.id === openId) ?? null
  const unread = MESSAGES.filter((m) => !m.read).length
  const navigate = (href: string) =>
    setOpenId(new URL(href, 'http://story').searchParams.get('open'))

  return (
    <Navigate value={navigate}>
      <UIProvider slots={{ link: StoryLink }}>
        <PageHeaderProvider>
          <div className="flex flex-col bg-(--theme-app-bg)" style={{ height: '100dvh' }}>
            <PageHeaderBar />
            <PageHeader
              breadcrumbs={[{ label: 'Inbox' }]}
              titleActions={
                <PageHeaderMenu
                  label="Inbox actions"
                  items={[
                    { label: 'Mark all as read', onClick: () => {} },
                    { label: 'Delete all read', onClick: () => {} },
                  ]}
                />
              }
            />
            <ListDetail
              listLabel="Messages"
              detailLabel="Message"
              listWidth={listWidth}
              minDetailWidth={minDetailWidth}
              open={open !== null}
              // The item's kind, not its title, which its own heading shows just below.
              detailBreadcrumbs={[
                { label: 'Inbox', href: '/inbox' },
                { label: open?.alert ? 'Alert' : 'Notification' },
              ]}
              list={
                <ListPage
                  view={view}
                  toolbar={
                    <ListToolbar search={search} searchLabel="Search messages">
                      <ListFilterMenu view={view} />
                    </ListToolbar>
                  }
                  filterBar={<ListFilterBar filters={view.filterState} />}
                  total={MESSAGES.length}
                  matches={shown.length}
                  empty={{ icon: <InboxIcon />, title: "You're all caught up" }}
                  noMatches="No messages match"
                  count={{
                    noun: 'message',
                    nounPlural: 'messages',
                    filterActive: query !== '' || view.activeFilterCount > 0,
                  }}
                >
                  <div className="p-1.5">
                    {shown.map((message) => (
                      <Row
                        key={message.id}
                        message={message}
                        selected={message.id === openId}
                        onSelect={() => setOpenId(message.id)}
                        openMenu={openMenu}
                      />
                    ))}
                  </div>
                </ListPage>
              }
              detail={
                open ? (
                  <article className="min-h-0 flex-1 overflow-y-auto px-4 py-6 sm:px-10 sm:py-8">
                    <div className="mb-3 flex items-center gap-2.5">
                      <TypeIcon alert={open.alert} />
                      <span className="text-xs text-(--theme-muted-text-color)">
                        {open.alert ? 'Alert' : 'Notification'} ·{' '}
                        <RelativeTime value={ago(open.minutesAgo)} />
                      </span>
                    </div>
                    <h2 className="text-2xl font-semibold text-(--theme-app)">{open.title}</h2>
                    <div className="mt-3">
                      <Markdown>{open.body}</Markdown>
                    </div>
                    <div className="mt-5">
                      <a
                        href="/details"
                        className={buttonClasses({ variant: 'primary', size: 'sm' })}
                      >
                        View details
                      </a>
                    </div>
                  </article>
                ) : (
                  <div className="flex flex-1 flex-col items-center justify-center gap-3 text-(--theme-muted-text-color)">
                    <InboxIcon size={48} className="opacity-60" />
                    <p className="text-sm">{unread} unread messages</p>
                  </div>
                )
              }
            />
            {contextMenu}
          </div>
        </PageHeaderProvider>
      </UIProvider>
    </Navigate>
  )
}

/** Where both fit, the messages and the one being read sit side by side; with none open, the
 *  reading pane says how many are unread. */
export const SideBySide: StoryObj<Args> = {
  render: (args) => <Inbox {...args} />,
}

/** A message open beside the list, the list keeping its place and the row its highlight. */
export const SideBySideOpen: StoryObj<Args> = {
  args: { open: true },
  render: (args) => <Inbox {...args} />,
}

/** On a phone the list shows alone at full width, its count under the rows. Opening a message
 *  shows it alone; the trail's "Inbox" goes back to the list. */
export const Phone: StoryObj<Args> = {
  globals: { viewport: { value: 'mobile1', isRotated: false } },
  render: (args) => <Inbox {...args} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const list = canvas.getByRole('region', { name: 'Messages' })
    await waitFor(() => expect(list).toBeVisible())
    await userEvent.click(canvas.getByText('Workflow wind-tunnel-cfd finished'))
    await waitFor(() => expect(list).not.toBeVisible())
    await expect(
      canvas.getByRole('heading', { level: 2, name: 'Workflow wind-tunnel-cfd finished' }),
    ).toBeVisible()
    await userEvent.click(canvas.getByRole('link', { name: 'Inbox' }))
    await waitFor(() => expect(list).toBeVisible())
  },
}

/** On a phone with a message open: it fills the width, and the trail leads back to the list. */
export const PhoneOpen: StoryObj<Args> = {
  args: { open: true },
  globals: { viewport: { value: 'mobile1', isRotated: false } },
  render: (args) => <Inbox {...args} />,
}
