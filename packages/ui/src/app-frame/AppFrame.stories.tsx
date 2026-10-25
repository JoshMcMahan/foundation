import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, userEvent, within } from 'storybook/test'
import { GridIcon, ListViewIcon, SettingsIcon } from '../icons'
import { AppFrame, AppFrameNavItem, type AppFrameProps, AppFrameToggle, useAppFrame } from './index'

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
  return (
    <AppFrame
      {...args}
      navigationKey={active}
      brand={({ expanded }) => (
        <strong
          style={{ display: 'block', padding: '6px 0', textAlign: expanded ? 'start' : 'center' }}
        >
          {expanded ? 'Workspace' : 'W'}
        </strong>
      )}
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
