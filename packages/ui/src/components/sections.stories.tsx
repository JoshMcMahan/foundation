import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, userEvent, waitFor, within } from 'storybook/test'
import { Disclosure } from './Disclosure'
import { InfoTip } from './InfoTip'
import { Section, type SectionVariant } from './Section'
import { StatusDot } from './StatusBadge'
import { StickyBar } from './StickyBar'
import { Switch } from './Switch'
import { TabPanel, Tabs } from './Tabs'

const meta: Meta = {
  title: 'UI/Sections and tabs',
}
export default meta

const body = (
  <p className="text-sm theme-muted-text">
    Content that folds away with its section, kept mounted while closed.
  </p>
)

export const Sections: StoryObj<{
  variant: SectionVariant
  collapsible: boolean
  description: string
}> = {
  args: { variant: 'plain', collapsible: true, description: 'Name and owner.' },
  argTypes: { variant: { control: 'inline-radio', options: ['plain', 'card'] } },
  render: ({ description, ...args }) => (
    <div className="flex max-w-xl flex-col gap-6">
      <Section {...args} title="General" description={description}>
        {body}
      </Section>
      <Section
        {...args}
        title="Networking"
        beside={<InfoTip text="Where the service is reachable from." />}
        actions={
          <button type="button" className="text-sm text-(--theme-link)">
            Add
          </button>
        }
        defaultOpen={false}
      >
        {body}
      </Section>
    </div>
  ),
  play: async ({ canvasElement, args }) => {
    if (!args.collapsible) {
      return
    }
    const canvas = within(canvasElement)
    const trigger = canvas.getByRole('button', { name: 'Networking' })
    await expect(trigger).toHaveAttribute('aria-expanded', 'false')
    await userEvent.click(trigger)
    await waitFor(() => expect(trigger).toHaveAttribute('aria-expanded', 'true'))
  },
}

// A page of settings: each a card that can't fold, with what it holds said under
// its title, its actions at the end, and an id for links to it.
export const SettingsSections: StoryObj = {
  name: 'Settings sections',
  render: () => (
    <div className="flex max-w-xl flex-col gap-4">
      <Section
        variant="card"
        collapsible={false}
        id="access"
        title="Access"
        description="Who can see and change this resource."
        actions={
          <button type="button" className="text-sm text-(--theme-link)">
            Invite
          </button>
        }
      >
        {body}
      </Section>
      <Section
        variant="card"
        collapsible={false}
        id="retention"
        title="Retention"
        description="How long finished runs are kept."
      >
        {body}
      </Section>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const title = canvas.getByRole('heading', { name: 'Access' })
    const description = canvas.getByText('Who can see and change this resource.')
    const section = canvasElement.querySelector<HTMLElement>('#access')
    await expect(section).toHaveAccessibleDescription('Who can see and change this resource.')
    await expect(section).toContainElement(title)
    // A card that can't fold is always open, so its title keeps the text color
    // rather than the muted one a folded card's title takes.
    await expect(getComputedStyle(title).color).not.toBe(getComputedStyle(description).color)
    await expect(getComputedStyle(title).color).toBe(getComputedStyle(section as Element).color)
  },
}

function RememberedSection() {
  const [open, setOpen] = useState(false)
  return (
    <div className="flex max-w-xl flex-col gap-4">
      <label className="flex items-center gap-2 text-sm">
        <Switch checked={open} onCheckedChange={setOpen} />
        Show usage
      </label>
      <Section variant="card" title="Usage" open={open} onOpenChange={setOpen}>
        <div className="p-4">{body}</div>
      </Section>
    </div>
  )
}

// The host holds the state, such as a preference it remembers; the switch and the title share it.
export const ControlledSection: StoryObj = {
  name: 'Controlled section',
  render: () => <RememberedSection />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('switch'))
    await waitFor(() =>
      expect(canvas.getByRole('button', { name: 'Usage' })).toHaveAttribute(
        'aria-expanded',
        'true',
      ),
    )
  },
}

const views = [
  { value: 'overview', label: 'Overview' },
  { value: 'activity', label: 'Activity', badge: <StatusDot variant="warning" size={6} /> },
  { value: 'settings', label: 'Settings' },
] as const

export const PanelTabs: StoryObj = {
  name: 'Tabs',
  render: () => (
    <div className="max-w-xl">
      <Tabs label="Resource" items={[...views]} defaultValue="overview">
        {views.map((view) => (
          <TabPanel key={view.value} value={view.value} className="p-4 text-sm">
            {view.label} of the resource.
          </TabPanel>
        ))}
      </Tabs>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('tab', { name: 'Settings' }))
    await waitFor(() => expect(canvas.getByText('Settings of the resource.')).toBeVisible())
  },
}

function LinkTabsDemo() {
  const [page, setPage] = useState('overview')
  return (
    <div className="max-w-xl">
      <Tabs
        label="Resource"
        value={page}
        onValueChange={setPage}
        items={views.map((view) => ({ ...view, href: `#${view.value}` }))}
        end={<span className="text-sm theme-muted-text">Updated today</span>}
      />
      <p className="p-4 text-sm">The {page} page, which the router would show.</p>
    </div>
  )
}

// Tabs that are pages: links, with the current page's tab marked.
export const LinkTabs: StoryObj = {
  name: 'Link tabs',
  render: () => <LinkTabsDemo />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const activity = canvas.getByRole('tab', { name: 'Activity' })
    await expect(activity).toHaveAttribute('href', '#activity')
    await userEvent.click(activity)
    await waitFor(() => expect(activity).toHaveAttribute('aria-selected', 'true'))
  },
}

type StickyTabsArgs = { toolbar: boolean; panels: boolean }
const lines = Array.from({ length: 40 }, (_, line) => line + 1)

function StickyTabsDemo({ toolbar, panels }: StickyTabsArgs) {
  const [page, setPage] = useState('overview')
  const filler = lines.map((line) => (
    <p key={line} className="py-2 text-sm theme-muted-text">
      Line {line} of the {page} page.
    </p>
  ))
  return (
    // The shell's header bar sits above the page's own scroller, as PageHeaderBar does.
    <div className="flex max-w-xl flex-col" style={{ height: 448 }}>
      <div className="flex h-11 shrink-0 items-center border-b border-(--theme-border) px-4 text-sm font-semibold">
        Resource
      </div>
      <div data-testid="page" className="min-h-0 flex-1 overflow-y-auto">
        {toolbar && (
          <StickyBar className="flex h-12 items-center border-b border-(--theme-border) px-4 text-sm">
            Toolbar
          </StickyBar>
        )}
        <Tabs
          label="Resource"
          // Under the page's own pinned toolbar, when there is one.
          sticky
          value={page}
          onValueChange={setPage}
          items={views.map((view) => ({ ...view, ...(panels ? {} : { href: `#${view.value}` }) }))}
        >
          {panels &&
            views.map((view) => (
              <TabPanel key={view.value} value={view.value} className="px-4">
                {filler}
              </TabPanel>
            ))}
        </Tabs>
        {!panels && <div className="px-4">{filler}</div>}
      </div>
    </div>
  )
}

// The tab row stays pinned to the top of the page's scroller, under the shell's
// header, whether the tabs link to pages, which leaves them no panels, or show
// panels below; or under a toolbar the page pins above them.
export const StickyTabs: StoryObj<StickyTabsArgs> = {
  name: 'Sticky tabs',
  args: { toolbar: false, panels: false },
  argTypes: {
    toolbar: { description: 'A toolbar the page pins above the tabs.' },
    panels: { description: 'Panels under the tabs, rather than tabs that link to pages.' },
  },
  render: (args) => <StickyTabsDemo {...args} />,
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    const page = canvas.getByTestId('page')
    // The row is the tab list's parent, which holds the sticky classes.
    const row = canvas.getByRole('tablist').parentElement as HTMLElement
    const offset = () => row.getBoundingClientRect().top - page.getBoundingClientRect().top
    for (const top of [600, page.scrollHeight]) {
      page.scrollTo({ top })
      await waitFor(() => expect(page.scrollTop).toBeGreaterThan(500))
      await expect(offset()).toBe(args.toolbar ? 48 : 0)
    }
  },
}

// A single tab would only repeat the page's title, so the row stays hidden.
export const LoneTab: StoryObj = {
  name: 'Lone tab',
  render: () => (
    <div className="max-w-xl">
      <Tabs label="Resource" items={[views[0]]} value="overview" />
      <p className="text-sm">No tab row above this line.</p>
    </div>
  ),
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).queryByRole('tablist')).toBeNull()
  },
}

function SegmentedTabsDemo({ fill, iconOnly }: { fill: boolean; iconOnly: boolean }) {
  const [view, setView] = useState('chat')
  return (
    <div className="flex w-64 flex-col gap-6">
      <Tabs
        label="Assistant"
        variant="segmented"
        fill={fill}
        iconOnly={iconOnly}
        value={view}
        onValueChange={setView}
        items={[
          {
            value: 'chat',
            label: 'Chat',
            href: '#chat',
            icon: <StatusDot variant="muted" size={6} />,
          },
          {
            value: 'agents',
            label: 'Agents',
            href: '#agents',
            icon: <StatusDot variant="success" size={6} />,
            badge: <StatusDot variant="warning" size={6} />,
          },
        ]}
      />
    </div>
  )
}

// Pages that look like a SegmentedControl, for a few views in a small space such as a sidebar.
export const SegmentedTabs: StoryObj<{ fill: boolean; iconOnly: boolean }> = {
  name: 'Segmented tabs',
  args: { fill: true, iconOnly: false },
  render: (args) => <SegmentedTabsDemo {...args} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('tab', { name: 'Agents' }))
    await waitFor(() =>
      expect(canvas.getByRole('tab', { name: 'Agents' })).toHaveAttribute('aria-selected', 'true'),
    )
  },
}

/** A line inside content that reveals detail beneath it. Unlike a Section it has no
 *  heading: a tool call's arguments, a model's reasoning, or a dialog's advanced options. */
export const Disclosures: StoryObj<{ disabled: boolean }> = {
  args: { disabled: false },
  argTypes: { disabled: { description: 'Nothing to reveal: the line shows without a toggle.' } },
  render: ({ disabled }) => (
    <div className="flex max-w-xl flex-col gap-4 text-sm">
      <Disclosure
        summary="Advanced"
        summaryClassName="text-xs font-medium theme-muted-text hover:theme-text"
        panelClassName="pt-2"
      >
        <p className="theme-muted-text">Options most runs leave alone.</p>
      </Disclosure>
      <Disclosure
        disabled={disabled}
        summaryClassName="w-full"
        summary={
          <>
            <StatusDot variant="success" className="mt-1.5" />
            <span className="min-w-0 truncate font-mono text-[13px]">
              <span className="font-semibold">Read</span>
              <span className="theme-muted-text">(config.yaml)</span>
            </span>
          </>
        }
        panelClassName="ml-5 mt-1"
      >
        <pre className="rounded-md bg-(--theme-muted-panel-bg) p-2 font-mono text-xs">
          name: build
        </pre>
      </Disclosure>
    </div>
  ),
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    const advanced = canvas.getByRole('button', { name: 'Advanced' })
    await userEvent.click(advanced)
    await waitFor(() => expect(advanced).toHaveAttribute('aria-expanded', 'true'))
    if (!args.disabled) {
      await userEvent.click(canvas.getByRole('button', { name: /Read/ }))
      await waitFor(() => expect(canvas.getByText('name: build')).toBeVisible())
    }
  },
}
