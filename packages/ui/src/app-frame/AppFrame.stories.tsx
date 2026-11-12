import type { Meta, StoryObj } from '@storybook/react-vite'
import { type ReactNode, useState } from 'react'
import { expect, userEvent, within } from 'storybook/test'
import { ContextMenuProvider, useOpenMenu } from '../components/ContextMenu'
import {
  AddIcon,
  FileTextIcon,
  GridIcon,
  InboxIcon,
  IssueIcon,
  ListViewIcon,
  MoreIcon,
  PinFilledIcon,
  ProjectIcon,
  SettingsIcon,
} from '../icons'
import {
  AppFrame,
  AppFrameListTakeover,
  AppFrameNavGroup,
  AppFrameNavItem,
  type AppFrameProps,
  AppFrameTakeover,
  AppFrameTakeoverBack,
  AppFrameToggle,
  useAppFrame,
  useAppFrameTakeover,
} from './index'

function Header() {
  const { isMobile } = useAppFrame()
  return (
    <header
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        minHeight: 48,
        padding: '0 16px',
        borderBottom: '1px solid var(--theme-border)',
      }}
    >
      {isMobile && <AppFrameToggle />}
      <h1 style={{ fontSize: 18, fontWeight: 600 }}>Projects</h1>
    </header>
  )
}
function Demo(args: AppFrameProps) {
  const [active, setActive] = useState('Projects')
  const [pinned, setPinned] = useState(['Climate research', 'Materials lab'])
  return (
    <AppFrame
      {...args}
      navigationKey={active}
      brand={
        args.brand ??
        (({ expanded }) => (
          <strong
            style={{ display: 'block', padding: '6px 0', textAlign: expanded ? 'start' : 'center' }}
          >
            {expanded ? 'Workspace' : 'W'}
          </strong>
        ))
      }
      navigation={
        <nav aria-label="Main navigation">
          {[
            { label: 'Overview', icon: GridIcon },
            { label: 'Projects', icon: ListViewIcon },
            { label: 'Settings', icon: SettingsIcon },
          ].map(({ label, icon: Icon }) => (
            <AppFrameNavItem
              key={label}
              label={label}
              icon={<Icon />}
              selected={active === label}
              onClick={() => setActive(label)}
            />
          ))}
          <AppFrameNavGroup
            label="Pinned"
            icon={<PinFilledIcon />}
            selected={pinned.includes(active)}
          >
            {pinned.map((label) => (
              <AppFrameNavItem
                key={label}
                label={label}
                icon={<ListViewIcon />}
                selected={active === label}
                onClick={() => setActive(label)}
                action={
                  <button
                    type="button"
                    aria-label={`Unpin ${label}`}
                    style={{ display: 'flex', width: 16, height: 16 }}
                    onClick={() => setPinned(pinned.filter((p) => p !== label))}
                  >
                    <PinFilledIcon />
                  </button>
                }
              />
            ))}
          </AppFrameNavGroup>
        </nav>
      }
      footer={({ isMobile }) => !isMobile && <AppFrameToggle />}
      header={<Header />}
    >
      <div style={{ padding: 24 }}>
        <h2 style={{ fontSize: 20, marginBottom: 8 }}>Shared projects</h2>
        <p style={{ color: 'var(--theme-muted-text-color)', marginBottom: 24 }}>
          Choose a project to view its resources and members.
        </p>
        {['Climate research', 'Materials lab', 'Team operations'].map((name, i) => (
          <div
            key={name}
            style={{
              display: 'flex',
              gap: 12,
              padding: '16px 0',
              borderTop: '1px solid var(--theme-border)',
            }}
          >
            <span style={{ flex: 1 }}>{name}</span>
            <span style={{ color: 'var(--theme-muted-text-color)' }}>{[8, 12, 4][i]} members</span>
          </div>
        ))}
      </div>
    </AppFrame>
  )
}
const meta = {
  title: 'UI/App frame',
  component: AppFrame,
  render: Demo,
  parameters: { layout: 'fullscreen' },
  args: {
    navigation: null,
    children: null,
    defaultExpanded: true,
    defaultWidth: 240,
    minWidth: 200,
    maxWidth: 400,
    railWidth: 64,
    resizable: true,
    mobileBreakpoint: 768,
    fullBleed: false,
    style: { height: 560 },
  },
  argTypes: {
    defaultExpanded: { control: 'boolean' },
    expanded: { control: 'boolean' },
    onExpandedChange: { action: 'expanded' },
    defaultWidth: { control: { type: 'range', min: 160, max: 400, step: 8 } },
    width: { control: 'number' },
    onWidthChange: { action: 'width' },
    minWidth: { control: 'number' },
    maxWidth: { control: 'number' },
    railWidth: { control: 'number' },
    resizable: { control: 'boolean' },
    mobileBreakpoint: { control: 'number' },
    navigationKey: { control: 'text' },
    navigationResetKey: { control: 'text' },
    sidebarProps: { control: 'object' },
    fullBleed: { control: 'boolean' },
    labels: { control: 'object' },
    mainId: { control: 'text' },
    mainClassName: { control: 'text' },
    className: { control: 'text' },
    style: { control: 'object' },
    banner: { control: 'text' },
    brand: { control: false },
    navigation: { control: false },
    header: { control: false },
    footer: { control: false },
    children: { control: false },
  },
} satisfies Meta<typeof AppFrame>
export default meta
type Story = StoryObj<typeof meta>
const sessions: { label: string; detail?: string; color?: string }[] = [
  { label: 'Refactor the importer', detail: 'Running', color: 'var(--theme-success)' },
  {
    label: 'Summarize last week',
    detail: 'Waiting for you',
    color: 'var(--theme-warning)',
  },
  { label: 'Fix flaky upload test', detail: 'Finished 2 hours ago' },
  { label: 'Draft release notes', detail: 'Finished yesterday' },
]
const longSessions: typeof sessions = [
  {
    label: 'Run the integration suite against the staging cluster',
    color: 'var(--theme-success)',
  },
  { label: 'Find why the nightly sync skips idle partitions' },
  {
    label: 'Review the network access changes in the open pull request',
    detail: 'Waiting for you',
    color: 'var(--theme-warning)',
  },
  { label: 'Short label' },
]
function StatusDot({ color }: { color: string }) {
  return (
    <span
      aria-hidden
      style={{ width: 8, height: 8, borderRadius: '50%', background: color, margin: 'auto' }}
    />
  )
}
function DetailsDemo({ items = sessions, ...args }: AppFrameProps & { items?: typeof sessions }) {
  const [active, setActive] = useState(items[0]?.label ?? '')
  return (
    <AppFrame
      {...args}
      brand={({ expanded }) => (
        <strong
          style={{ display: 'block', padding: '6px 0', textAlign: expanded ? 'start' : 'center' }}
        >
          {expanded ? 'Workspace' : 'W'}
        </strong>
      )}
      navigation={
        <nav aria-label="Main navigation">
          <AppFrameNavItem label="New session" icon={<AddIcon />} />
          <AppFrameNavGroup label="Sessions" collapsible={false}>
            {items.map(({ label, detail, color }) => (
              <AppFrameNavItem
                key={label}
                label={label}
                {...(detail ? { detail } : {})}
                {...(color ? { icon: <StatusDot color={color} /> } : {})}
                selected={active === label}
                onClick={() => setActive(label)}
                action={
                  <button
                    type="button"
                    aria-label={`More actions for ${label}`}
                    style={{ display: 'flex', width: 16, height: 16 }}
                  >
                    <MoreIcon />
                  </button>
                }
              />
            ))}
          </AppFrameNavGroup>
        </nav>
      }
      footer={({ isMobile }) => !isMobile && <AppFrameToggle />}
      header={<Header />}
    >
      <div style={{ padding: 24 }}>{active}</div>
    </AppFrame>
  )
}
const takeoverGroups = [
  {
    key: 'needs',
    label: 'Needs you',
    rows: [{ key: 'pool', label: 'Resize the node pool', detail: 'Needs approval', time: '2m' }],
  },
  {
    key: 'recent',
    label: 'Recent',
    rows: [
      { key: 'flaky', label: 'Flaky sign-in test', time: '3h' },
      { key: 'report', label: 'Queue time report', time: '1d' },
    ],
  },
]
function SessionsPage({ empty }: { empty: boolean }) {
  const [open, setOpen] = useState<string | null>('flaky')
  const openMenu = useOpenMenu()
  return (
    <>
      <AppFrameListTakeover
        newItem={{ label: 'New session', selected: open === null, onClick: () => setOpen(null) }}
        groups={
          empty
            ? []
            : takeoverGroups.map((group) => ({
                ...group,
                rows: group.rows.map((row) => ({
                  ...row,
                  selected: row.key === open,
                  onClick: () => setOpen(row.key),
                  menuItems: [{ label: 'Archive', onClick: () => {} }],
                })),
              }))
        }
        empty={<p style={{ padding: '8px 12px', fontSize: 13 }}>No sessions yet</p>}
        openMenu={openMenu}
      />
      <div style={{ padding: 24 }}>{open ?? 'New session'}</div>
    </>
  )
}
function TakeoverDemo({ empty = false, ...args }: AppFrameProps & { empty?: boolean }) {
  // The story's page always has a list; a host also asks for a narrow viewport.
  const takeover = useAppFrameTakeover(true)
  return (
    <ContextMenuProvider>
      <AppFrameTakeover value={takeover.takeover}>
        <AppFrame
          {...args}
          brand={
            takeover.active ? (
              <AppFrameTakeoverBack onBack={takeover.showNavigation} />
            ) : (
              <strong style={{ display: 'block', padding: '6px 0' }}>Workspace</strong>
            )
          }
          navigation={
            takeover.active ? (
              takeover.navigation
            ) : (
              <nav aria-label="Main navigation">
                <AppFrameNavItem label="Inbox" icon={<InboxIcon />} />
                <AppFrameNavItem label="Sessions" icon={<ListViewIcon />} selected />
                <AppFrameNavItem label="Settings" icon={<SettingsIcon />} />
              </nav>
            )
          }
          header={<Header />}
        >
          <SessionsPage empty={empty} />
        </AppFrame>
      </AppFrameTakeover>
    </ContextMenuProvider>
  )
}
/** A page's own list takes the place of the app's navigation, with a way back to it, rather than open a second drawer. Each row keeps its menu behind a button that is always shown. */
export const ListTakeover: StoryObj<AppFrameProps & { empty?: boolean }> = {
  render: TakeoverDemo,
  args: { empty: false },
  argTypes: { empty: { control: 'boolean' } },
}
/** With nothing to list, the page says so under the item that starts one. */
export const ListTakeoverEmpty: StoryObj<AppFrameProps & { empty?: boolean }> = {
  render: TakeoverDemo,
  args: { empty: true },
}

/** Items can carry a second line, and need no icon: a row with none starts at its label, and the rail shows its first letter. */
export const ItemDetails: Story = { render: DetailsDemo }
/** A long label ends in an ellipsis and leaves the row's action inside the sidebar, with a second line or without one. */
export const LongLabels: Story = {
  render: (args) => <DetailsDemo {...args} items={longSessions} />,
}
export const ItemDetailsCollapsed: Story = {
  render: DetailsDemo,
  args: { defaultExpanded: false },
}
function Swatch({ color, letter }: { color: string; letter: string }) {
  return (
    <span
      aria-hidden
      style={{
        display: 'grid',
        placeItems: 'center',
        width: 16,
        height: 16,
        borderRadius: 4,
        background: color,
        color: 'white',
        fontSize: 10,
        fontWeight: 600,
      }}
    >
      {letter}
    </span>
  )
}
function More({ name }: { name: string }) {
  return (
    <button
      type="button"
      aria-label={`More actions for ${name}`}
      style={{ display: 'flex', width: 16, height: 16 }}
    >
      <MoreIcon />
    </button>
  )
}
function NestedDemo(args: AppFrameProps) {
  const [active, setActive] = useState('Runbooks')
  const item = (label: string, icon?: ReactNode) => (
    <AppFrameNavItem
      key={label}
      label={label}
      icon={icon}
      selected={active === label}
      onClick={() => setActive(label)}
    />
  )
  const page = (label: string, children: ReactNode) => (
    <AppFrameNavGroup
      label={label}
      icon={<FileTextIcon />}
      href={`#${label.toLowerCase()}`}
      current={active === label}
      onClick={(event) => {
        event.preventDefault()
        setActive(label)
      }}
      action={<More name={label} />}
    >
      {children}
    </AppFrameNavGroup>
  )
  const team = (name: string, color: string, children: ReactNode) => (
    <AppFrameNavGroup
      label={name}
      icon={<Swatch color={color} letter={name.charAt(0)} />}
      action={<More name={name} />}
    >
      {children}
    </AppFrameNavGroup>
  )
  return (
    <AppFrame
      {...args}
      brand={({ expanded }) => (
        <strong
          style={{ display: 'block', padding: '6px 0', textAlign: expanded ? 'start' : 'center' }}
        >
          {expanded ? 'Workspace' : 'W'}
        </strong>
      )}
      navigation={
        <nav aria-label="Main navigation">
          {item('Inbox', <InboxIcon />)}
          <AppFrameNavGroup
            label="Teams"
            collapsible={false}
            action={
              <button
                type="button"
                aria-label="New team"
                style={{ display: 'flex', width: 16, height: 16 }}
              >
                <AddIcon />
              </button>
            }
          >
            {team(
              'Platform',
              'oklch(0.6 0.15 250)',
              <>
                {item('Issues', <IssueIcon />)}
                {item('Projects', <ProjectIcon />)}
                {page(
                  'Docs',
                  <>
                    {item('Onboarding', <FileTextIcon />)}
                    {page('Runbooks', item('Deploys', <FileTextIcon />))}
                  </>,
                )}
                {team('Storage', 'oklch(0.6 0.15 150)', item('Storage issues', <IssueIcon />))}
              </>,
            )}
            {team('Research', 'oklch(0.6 0.15 30)', item('Research issues', <IssueIcon />))}
          </AppFrameNavGroup>
        </nav>
      }
      footer={({ isMobile }) => !isMobile && <AppFrameToggle />}
      header={<Header />}
    >
      <div style={{ padding: 24 }}>{active}</div>
    </AppFrame>
  )
}
/** A group inside another is a row with its own icon and actions, and a group can be a page too, folded from the chevron at its end. */
export const NestedGroups: Story = { render: NestedDemo }
export const NestedGroupsCollapsed: Story = {
  render: NestedDemo,
  args: { defaultExpanded: false },
}
export const Expanded: Story = {}
export const Collapsed: Story = { args: { defaultExpanded: false } }
export const Compact: Story = { args: { minWidth: 168, defaultWidth: 184 } }
export const NarrowLabels: Story = {
  args: { minWidth: 168, defaultWidth: 168 },
  render: (args) => (
    <AppFrame
      {...args}
      brand={<strong>Workspace</strong>}
      navigation={
        <nav aria-label="Main navigation">
          {[
            'Overview',
            'Project administration',
            'Pending review requests',
            'Organization settings',
          ].map((label, index) => (
            <AppFrameNavItem
              key={label}
              href={`#${index}`}
              label={label}
              icon={<GridIcon />}
              selected={index === 1}
              badge={index === 2 ? 127 : undefined}
            />
          ))}
        </nav>
      }
      footer={<AppFrameToggle />}
      header={<Header />}
    >
      <p style={{ padding: 24 }}>Long navigation labels stay within the resized sidebar.</p>
    </AppFrame>
  ),
}
export const ShortSidebar: Story = {
  ...NarrowLabels,
  args: { ...NarrowLabels.args, style: { height: 200 } },
}
export const FullBleed: Story = { args: { fullBleed: true } }
export const FixedWidth: Story = { args: { resizable: false } }
export const ControlledResize: Story = {
  render: (args) => {
    const [width, setWidth] = useState(240)
    const [commits, setCommits] = useState(0)
    return (
      <AppFrame
        {...args}
        width={width}
        onWidthChange={(next) => {
          setWidth(next)
          setCommits((count) => count + 1)
        }}
        brand={({ expanded }) => (
          <strong style={{ display: 'block', textAlign: expanded ? 'start' : 'center' }}>
            {expanded ? 'Workspace' : 'W'}
          </strong>
        )}
        navigation={<AppFrameNavItem label="Projects" icon={<ListViewIcon />} selected />}
        footer={<AppFrameToggle />}
        header={<Header />}
      >
        <div style={{ padding: 24 }}>
          <p>Saved width: {width}px</p>
          <p>Width updates: {commits}</p>
          <p>Drag the sidebar edge. The saved preference updates once when you release it.</p>
        </div>
      </AppFrame>
    )
  },
}
export const ExternalLinks: Story = {
  render: (args) => (
    <AppFrame
      {...args}
      brand={({ expanded }) => (
        <strong style={{ display: 'block', textAlign: expanded ? 'start' : 'center' }}>
          {expanded ? 'Workspace' : 'W'}
        </strong>
      )}
      navigation={
        <nav aria-label="Main navigation">
          <AppFrameNavItem label="Projects" icon={<ListViewIcon />} selected />
          <AppFrameNavItem
            label="Documentation"
            icon={<GridIcon />}
            href="https://example.com/docs"
            target="_blank"
          />
        </nav>
      }
      footer={<AppFrameToggle />}
      header={<Header />}
    >
      <p style={{ padding: 24 }}>
        New-tab destinations stay named in both the expanded sidebar and icon rail.
      </p>
    </AppFrame>
  ),
}
export const SectionNavigation: Story = {
  render: (args) => {
    const [route, setRoute] = useState('projects/1')
    return (
      <AppFrame
        {...args}
        navigationKey={route}
        navigationResetKey={route.split('/')[0] ?? route}
        sidebarProps={{ 'aria-label': 'Workspace navigation' }}
        brand={<strong>Workspace</strong>}
        navigation={
          <nav aria-label="Main navigation">
            {Array.from({ length: 24 }, (_, i) => `projects/${i + 1}`).map((project) => (
              <AppFrameNavItem
                key={project}
                label={`Project ${project.split('/')[1]}`}
                icon={<ListViewIcon />}
                selected={route === project}
                onClick={() => setRoute(project)}
              />
            ))}
          </nav>
        }
        footer={<AppFrameToggle />}
        header={<Header />}
      >
        <div style={{ padding: 24 }}>
          <p>{route}</p>
          <p>Scroll navigation, then select another project. The list stays in place.</p>
          <button type="button" onClick={() => setRoute('settings')}>
            Switch to settings
          </button>
        </div>
      </AppFrame>
    )
  },
}
export const Banner: Story = {
  args: {
    banner: (
      <div
        style={{
          padding: '6px 16px',
          background: 'var(--theme-accent)',
          color: 'var(--theme-accent-text)',
        }}
      >
        Scheduled maintenance on Saturday, 09:00–10:00 UTC.
      </div>
    ),
  },
}
export const Dark: Story = { globals: { mode: 'dark' } }
function CustomNavigationDemo(args: AppFrameProps) {
  const [active, setActive] = useState('Projects')
  return (
    <AppFrame
      {...args}
      navigationKey={active}
      brand={({ expanded }) => <strong>{expanded ? 'Workspace' : 'W'}</strong>}
      navigation={({ expanded, isMobile }) => (
        <nav aria-label="Main navigation">
          {[
            { label: 'Overview', icon: GridIcon },
            { label: 'Projects', icon: ListViewIcon },
            { label: 'Settings', icon: SettingsIcon },
          ].map(({ label, icon: Icon }) => (
            <button
              key={label}
              type="button"
              aria-label={label}
              aria-current={active === label ? 'page' : undefined}
              onClick={() => setActive(label)}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: expanded ? 'start' : 'center',
                gap: 8,
                minHeight: isMobile ? 44 : 40,
                padding: expanded ? '8px 12px' : 0,
                border: '1px solid var(--theme-border)',
                borderRadius: 4,
                background: active === label ? 'var(--theme-sidebar-active-bg)' : 'transparent',
                color: active === label ? 'var(--theme-sidebar-active-text)' : 'inherit',
                cursor: 'pointer',
              }}
            >
              <Icon style={{ width: 18, height: 18, flexShrink: 0 }} />
              {expanded && label}
            </button>
          ))}
        </nav>
      )}
      footer={({ isMobile }) => !isMobile && <AppFrameToggle />}
      header={<Header />}
    >
      <div style={{ padding: 24 }}>
        <h2 style={{ fontSize: 20, marginBottom: 8 }}>{active}</h2>
        <p>The host styles these navigation buttons. The frame owns layout and its controls.</p>
      </div>
    </AppFrame>
  )
}
export const CustomNavigation: Story = {
  render: CustomNavigationDemo,
  parameters: {
    docs: {
      description: {
        story:
          'Custom navigation can use @parallelworks/ui/app-frame/layout.css alone. AppFrameNavItem requires navigation.css as well, or the combined app-frame.css import.',
      },
    },
  },
}
export const Mobile: Story = {
  args: { mobileBreakpoint: 10000, style: { width: 390, maxWidth: '100%', height: 700 } },
}
export const MobileOpen: Story = {
  ...Mobile,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Open navigation' }))
    await expect(canvas.getByRole('dialog', { name: 'Main navigation' })).toBeVisible()
  },
}
/** A brand that links home, as most apps' does, shows its whole focus ring in the drawer. */
export const MobileBrandLink: Story = {
  ...Mobile,
  args: {
    ...Mobile.args,
    brand: (
      <a href="#home" style={{ display: 'block', padding: '6px 0', fontWeight: 600 }}>
        Workspace
      </a>
    ),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Open navigation' }))
    const drawer = canvas.getByRole('dialog', { name: 'Main navigation' })
    await expect(drawer).toBeVisible()
    await userEvent.tab()
    await expect(within(drawer).getByRole('link', { name: 'Workspace' })).toHaveFocus()
  },
}
export const MobileBanner: Story = {
  ...MobileOpen,
  args: { ...Mobile.args, ...Banner.args, defaultWidth: 208 },
}
export const MobileRtl: Story = {
  ...MobileBanner,
  render: (args) => (
    <div dir="rtl">
      <Demo {...args} />
    </div>
  ),
}
export const MobileSectionNavigation: Story = {
  ...SectionNavigation,
  args: { ...Mobile.args },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Open navigation' }))
    const project = canvas.getByRole('button', { name: 'Project 24' })
    project.scrollIntoView({ block: 'nearest' })
    const scroll = project.closest('.pw-frame-links')
    const position = scroll?.scrollTop
    await userEvent.click(project)
    await userEvent.click(canvas.getByRole('button', { name: 'Open navigation' }))
    await expect(canvas.getByRole('button', { name: 'Project 24' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    await expect(
      canvas.getByRole('button', { name: 'Project 24' }).closest('.pw-frame-links')?.scrollTop,
    ).toBe(position)
  },
}
export const KeyboardResize: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const splitter = canvas.getByRole('separator')
    splitter.focus()
    await userEvent.keyboard('{End}')
    await expect(splitter).toHaveAttribute('aria-valuenow', '400')
    await userEvent.keyboard('{Home}{ArrowLeft}')
    await expect(splitter).toHaveAttribute('aria-valuenow', '64')
    await userEvent.keyboard('{ArrowRight}')
    await expect(splitter).toHaveAttribute('aria-valuenow', '200')
  },
}
