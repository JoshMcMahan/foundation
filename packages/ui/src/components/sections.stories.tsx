import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, userEvent, waitFor, within } from 'storybook/test'
import { MoreIcon, StopIcon } from '../icons'
import { Button } from './Button'
import { Disclosure } from './Disclosure'
import { IconButton } from './IconButton'
import { InfoTip } from './InfoTip'
import { Section, type SectionSpacing, type SectionTone, type SectionVariant } from './Section'
import { Select } from './Select'
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
  spacing: SectionSpacing
  collapsible: boolean
  flush: boolean
  tone: SectionTone
  description: string
}> = {
  args: {
    variant: 'plain',
    spacing: 'regular',
    collapsible: true,
    flush: false,
    tone: 'default',
    description: 'Name and owner.',
  },
  argTypes: {
    variant: { control: 'inline-radio', options: ['plain', 'bare', 'card'] },
    spacing: { control: 'inline-radio', options: ['regular', 'tight'] },
    flush: { description: "A card's content reaches its edges." },
    tone: {
      control: 'inline-radio',
      options: ['default', 'error'],
      description: 'A card of irreversible actions.',
    },
  },
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

/** Tight spacing, for content that spaces itself tightly, such as a form with its labels over
 *  its fields: the content starts close under the rule. */
export const SectionsTight: typeof Sections = {
  ...Sections,
  args: { ...Sections.args, spacing: 'tight' },
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

/** No rule under the title: the title and what the section holds sit over its content. */
export const BareSections: typeof Sections = {
  ...Sections,
  name: 'Bare sections',
  args: { ...Sections.args, variant: 'bare', collapsible: false },
}

const NODES = [
  ['gpu-01', 'Ready', '8 cores'],
  ['gpu-02', 'Ready', '8 cores'],
  ['cpu-01', 'Draining', '32 cores'],
]

/** A flush card: a table's rules reach the card's edges instead of sitting inset. */
export const FlushCard: StoryObj = {
  name: 'Flush card',
  render: () => (
    <div className="max-w-xl">
      <Section
        variant="card"
        flush
        title="Nodes"
        beside={<span className="text-xs theme-muted-text">3</span>}
      >
        <table className="w-full border-t border-(--theme-border) text-left text-sm">
          <thead className="theme-muted-panel text-xs">
            <tr>
              <th className="px-4 py-2 font-medium">Name</th>
              <th className="px-4 py-2 font-medium">State</th>
              <th className="px-4 py-2 font-medium">Size</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-(--theme-border)">
            {NODES.map(([name, state, size]) => (
              <tr key={name}>
                <td className="px-4 py-2">{name}</td>
                <td className="px-4 py-2">{state}</td>
                <td className="px-4 py-2">{size}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>
    </div>
  ),
}

/** A danger zone: a card whose border and title take the error color over a clear body. */
export const DangerZone: StoryObj = {
  name: 'Danger zone',
  render: () => (
    <div className="max-w-xl">
      <Section
        variant="card"
        tone="error"
        collapsible={false}
        title="Danger zone"
        description="These can't be undone."
      >
        <div className="flex items-center justify-between gap-4 text-sm">
          <span>Delete this cluster and everything on it.</span>
          <Button variant="danger" size="sm">
            Delete cluster
          </Button>
        </div>
      </Section>
    </div>
  ),
}

const RANGES = [
  { value: '1h', label: 'Last hour' },
  { value: '24h', label: 'Last day' },
]

/** In a narrow header the actions take their own line, starting under the title's text,
 *  instead of squeezing it; a title that wraps keeps its chevron beside its first line. */
export const WrappingHeader: StoryObj = {
  name: 'Wrapping header',
  globals: { viewport: { value: 'mobile1', isRotated: false } },
  render: () => (
    <div className="w-[320px] max-w-full">
      <Section
        variant="card"
        title="Workload metrics for the training job"
        actions={<Select aria-label="Range" items={RANGES} defaultValue="1h" />}
      >
        {body}
      </Section>
    </div>
  ),
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

/** A whole row that toggles its detail, as a list of clusters has: no chevron, with its own
 *  buttons beside the toggle rather than in it, and its menu on a right-click. */
export const DisclosureRow: StoryObj<{ chevron: boolean }> = {
  args: { chevron: false },
  argTypes: { chevron: { description: 'False drops the chevron.' } },
  render: ({ chevron }) => (
    <div className="max-w-xl rounded-xl border theme-border text-sm">
      {['gpu-cluster-east', 'cpu-batch-west'].map((name) => (
        <Disclosure
          key={name}
          chevron={chevron}
          className="border-b theme-border px-3 py-2 last:border-b-0"
          summaryClassName="w-full items-center"
          summary={
            <>
              <StatusDot variant="success" />
              <span className="min-w-0 flex-1 truncate font-medium">{name}</span>
              <span className="theme-muted-text">4 nodes</span>
            </>
          }
          actions={
            <>
              <IconButton label={`Stop ${name}`} icon={<StopIcon />} />
              <IconButton label={`More actions for ${name}`} icon={<MoreIcon />} />
            </>
          }
          panelClassName="pt-2 ps-4"
        >
          <p className="m-0 theme-muted-text">Started 3 hours ago in us-east-1.</p>
        </Disclosure>
      ))}
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const toggle = canvas.getByRole('button', { name: /gpu-cluster-east/ })
    await expect(toggle).not.toContainElement(
      canvas.getByRole('button', { name: 'Stop gpu-cluster-east' }),
    )
    await userEvent.click(toggle)
    await waitFor(() => expect(toggle).toHaveAttribute('aria-expanded', 'true'))
  },
}
