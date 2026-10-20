import type { Meta, StoryObj } from '@storybook/react-vite'
import { type CSSProperties, type ReactNode, useLayoutEffect, useRef, useState } from 'react'
import { expect, screen, userEvent, waitFor, within } from 'storybook/test'
import { formatBytes } from '../format'
import { CalendarIcon, ClusterIcon, MoreIcon, TagIcon, UploadIcon, UserIcon } from '../icons'
import {
  applyTheme,
  DEFAULT_PRESET,
  generateTheme,
  type Mode,
  schemeFor,
  THEME_PRESETS,
} from '../theme/index'
import { ActionMenu } from './ActionMenu'
import { Avatar, AvatarGroup, type AvatarSize } from './Avatar'
import { Button } from './Button'
import { buttonClasses } from './buttonClasses'
import { Checkbox } from './Checkbox'
import { Autocomplete, Combobox } from './Combobox'
import { ConfirmModal, useConfirm } from './ConfirmModal'
import { CreateModal, CreateModalSelect, CreateModalSwitch } from './CreateModal'
import { DatePicker } from './DatePicker'
import { EmptyState, type EmptyStateVariant } from './EmptyState'
import { ExternalLink } from './ExternalLink'
import { Field } from './Field'
import { type FieldBoxSize, fieldBox } from './fieldBox'
import { InfoTip } from './InfoTip'
import { Input } from './Input'
import { Kbd } from './Kbd'
import { positionKeys } from './keys'
import { type BarTone, type BarValuePlacement, Meter, ProgressBar } from './Meter'
import { Modal, type ModalProps, type ModalSize } from './Modal'
import { NumberInput } from './NumberInput'
import { Overview } from './Overview'
import { type AvatarColoring, UIProvider } from './Provider'
import { RunStatusIcon, type RunStatusIconStatus, runStatusTone } from './RunStatusIcon'
import { Elapsed, RelativeTime } from './relativeTime'
import { SegmentedControl } from './SegmentedControl'
import { Select } from './Select'
import {
  type BadgeEmphasis,
  type BadgeShape,
  type BadgeSize,
  type BadgeVariant,
  CountBadge,
  StatusBadge,
  StatusDot,
} from './StatusBadge'
import { Switch } from './Switch'
import { type SortDirection, Table, type TableDensity } from './Table'
import { Tooltip } from './Tooltip'

const meta: Meta = {
  title: 'UI/Primitives',
}
export default meta

const RUN_STATUSES: RunStatusIconStatus[] = [
  'pending',
  'running',
  'completed',
  'error',
  'canceled',
  'canceling',
  'skipped',
  'skipped-failed',
  'faulted',
  'warning',
  '',
]

/** A run status as an icon beside what ran, and in words as a badge in the same tone. Under
 *  way spins in info blue; `pending` and `warning` are looks a host maps its own statuses onto. */
export const RunStatuses: StoryObj = {
  render: () => (
    <div className="flex flex-col gap-2 text-sm">
      {RUN_STATUSES.map((status) => (
        <div key={status || 'none'} className="flex items-center gap-6">
          <span className="flex w-20 items-center gap-2">
            <RunStatusIcon status={status} />
            build
          </span>
          <StatusBadge variant={runStatusTone(status)}>{status || 'not run'}</StatusBadge>
        </div>
      ))}
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('img', { name: 'error' })).toBeVisible()
    await expect(canvas.getByRole('img', { name: 'completed' })).toBeVisible()
  },
}

/** A host's own status in a run's look, with its own name, shown on hover with `tooltip`. */
export const RunStatusLabels: StoryObj<{ tooltip: boolean }> = {
  args: { tooltip: true },
  argTypes: { tooltip: { description: 'Shows the name on hover too.' } },
  render: ({ tooltip }) => (
    <div className="flex items-center gap-4 p-8 text-sm">
      <RunStatusIcon status="running" label="Provisioning" tooltip={tooltip} />
      <RunStatusIcon status="running" label="Deleting" tooltip={tooltip} />
      <RunStatusIcon status="pending" label="Queued" tooltip={tooltip} />
      <RunStatusIcon status="warning" label="Degraded" tooltip={tooltip} />
      <RunStatusIcon status="completed" label="Deployed" tooltip={tooltip} />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('img', { name: 'Provisioning' })).toHaveAttribute(
      'data-status',
      'running',
    )
  },
}

const BADGE_VARIANTS: BadgeVariant[] = [
  'default',
  'success',
  'warning',
  'error',
  'info',
  'muted',
  'accent',
]

export const Badges: StoryObj<{
  emphasis: BadgeEmphasis
  shape: BadgeShape
  caps: boolean
  size: BadgeSize
}> = {
  args: { emphasis: 'soft', shape: 'pill', caps: false, size: 'sm' },
  argTypes: {
    emphasis: { control: 'inline-radio', options: ['soft', 'solid', 'outline'] },
    shape: { control: 'inline-radio', options: ['pill', 'tag'] },
    caps: { description: 'Uppercase, tracked letters.' },
    size: { control: 'inline-radio', options: ['sm', 'md'] },
  },
  render: (args) => (
    <div className="flex flex-wrap items-center gap-3">
      <StatusBadge {...args} variant="success" dot>
        Running
      </StatusBadge>
      <StatusBadge {...args} variant="warning" pulse>
        Degraded
      </StatusBadge>
      <StatusBadge {...args} variant="error">
        Stopped
      </StatusBadge>
      <StatusBadge {...args} variant="info">
        Preview
      </StatusBadge>
      <StatusBadge {...args} variant="muted">
        Archived
      </StatusBadge>
      <StatusBadge {...args} variant="accent">
        New
      </StatusBadge>
      <StatusDot variant="success" />
    </div>
  ),
}

/** Every tone at every emphasis, as pills and as tags. */
export const BadgeEmphases: StoryObj = {
  render: () => (
    <div className="flex flex-col gap-3">
      {(['pill', 'tag'] as const).map((shape) =>
        (['soft', 'solid', 'outline'] as const).map((emphasis) => (
          <div key={`${shape}-${emphasis}`} className="flex flex-wrap items-center gap-2">
            <span className="w-24 text-xs theme-muted-text">
              {shape} {emphasis}
            </span>
            {BADGE_VARIANTS.map((variant) => (
              <StatusBadge
                key={variant}
                variant={variant}
                emphasis={emphasis}
                shape={shape}
                size="md"
              >
                {variant}
              </StatusBadge>
            ))}
          </div>
        )),
      )}
    </div>
  ),
}

/** A tag for a short label, in caps or sentence case; a link badge; a long state cut off
 *  inside a narrow cell. */
export const BadgeUses: StoryObj = {
  render: () => (
    <div className="flex flex-col gap-4 text-sm">
      <div className="flex items-center gap-2">
        <StatusBadge shape="tag" caps variant="accent" emphasis="solid">
          All users
        </StatusBadge>
        <StatusBadge shape="tag" caps variant="info">
          Preview
        </StatusBadge>
        <StatusBadge shape="tag" emphasis="outline" variant="accent" size="md">
          Decided
        </StatusBadge>
        <StatusBadge
          shape="tag"
          emphasis="outline"
          variant="muted"
          size="md"
          className="line-through"
        >
          Superseded
        </StatusBadge>
      </div>
      <div className="flex items-center gap-2">
        <StatusBadge
          variant="accent"
          size="md"
          render={<a href="#changelog" />}
          className="font-mono"
        >
          v2.4.0
        </StatusBadge>
        <StatusBadge variant="accent" emphasis="solid">
          New
        </StatusBadge>
        <StatusBadge emphasis="outline">Your version</StatusBadge>
      </div>
      <div className="w-28 rounded-md border border-(--theme-border) p-2">
        <StatusBadge variant="warning" dot truncate>
          Waiting for capacity
        </StatusBadge>
      </div>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('link', { name: 'v2.4.0' })).toBeVisible()
  },
}

const HOST_COUNT_CSS =
  '.story-host-count { background: light-dark(#b45309, #f59e0b); color: light-dark(#fff, #111) }'

/** Counts beside a link or tab, capped at 99+; a host passes its own color in `className`. */
export const CountBadges: StoryObj<{ count: number; max: number; size: BadgeSize }> = {
  args: { count: 140, max: 99, size: 'md' },
  argTypes: {
    count: { control: { type: 'number', min: 0 } },
    max: { control: { type: 'number', min: 1 } },
    size: { control: 'inline-radio', options: ['sm', 'md'] },
  },
  render: ({ count, max, size }) => (
    <div className="flex w-56 flex-col gap-1 text-sm">
      {/* A host's own color, as a host's stylesheet would set it. */}
      <style>{HOST_COUNT_CSS}</style>
      <span className="flex items-center justify-between rounded-md px-2 py-1">
        Inbox
        <CountBadge count={count} max={max} size={size} label="unread" />
      </span>
      <span className="flex items-center justify-between rounded-md px-2 py-1">
        Decisions
        <CountBadge count={4} size={size} label="waiting" className="story-host-count" />
      </span>
      <span className="flex items-center justify-between rounded-md px-2 py-1">
        Orphaned
        <CountBadge count={7} size={size} emphasis="soft" variant="warning" />
      </span>
      <span className="flex items-center justify-between rounded-md px-2 py-1">
        Archived
        <CountBadge count={0} size={size} emphasis="soft" variant="muted" showZero />
      </span>
    </div>
  ),
  play: async ({ canvasElement, args }) => {
    if (args.count <= args.max) {
      return
    }
    await expect(within(canvasElement).getByText(`${args.max}+`)).toBeVisible()
  },
}

/** A picture, or initials until it loads and when it fails; one image to assistive
 *  technology either way. */
export const Avatars: StoryObj = {
  render: () => (
    <div className="flex items-end gap-3">
      <Avatar name="Ada Lovelace" size="xs" />
      <Avatar name="Ada Lovelace" size="sm" status="online" />
      <Avatar name="Grace Hopper" size="md" status="away" />
      <Avatar name="Alan Turing" size="lg" status="busy" />
      <Avatar name="Katherine Johnson" src="/missing-avatar.png" size="xl" status="offline" />
      <Avatar size="2xl" />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    // The name says the presence the dot shows.
    await expect(canvas.getByRole('img', { name: 'Grace Hopper, away' })).toHaveTextContent('GH')
    // A picture that fails keeps the initials.
    await waitFor(() =>
      expect(canvas.getByRole('img', { name: 'Katherine Johnson, offline' })).toHaveTextContent(
        'KJ',
      ),
    )
  },
}

/** A ring passed in `className` traces the shape, circle or square, so overlapping avatars read
 *  as separate faces. Beside a printed name the avatar is `decorative`, so a screen reader says
 *  the name once. */
export const AvatarRings: StoryObj<{ decorative: boolean }> = {
  args: { decorative: true },
  render: ({ decorative }) => (
    <div className="flex flex-col gap-4 p-8">
      <div className="flex">
        {['Ada Lovelace', 'Grace Hopper', 'Alan Turing', 'Radia Perlman'].map((name, index) => (
          // Overlapping, so each ring cuts its circle out of the one before.
          <span key={name} style={{ marginLeft: index === 0 ? 0 : -8 }} className="flex">
            <Avatar name={name} size="md" className="ring-2 ring-(--theme-app-bg)" />
          </span>
        ))}
        <span style={{ marginLeft: -8 }} className="flex">
          <Avatar
            name="Triage bot"
            kind="agent"
            size="md"
            className="ring-2 ring-(--theme-app-bg)"
          />
        </span>
      </div>
      <div className="flex items-center gap-2 text-sm">
        <Avatar
          name="Grace Hopper"
          size="sm"
          decorative={decorative}
          className="ring-2 ring-(--theme-accent)"
        />
        Grace Hopper
      </div>
    </div>
  ),
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('img', { name: 'Ada Lovelace' })).toHaveClass('rounded-full')
    await expect(canvas.queryAllByRole('img', { name: 'Grace Hopper' })).toHaveLength(
      args.decorative ? 1 : 2,
    )
  },
}

const NAMES = [
  'Ada Lovelace',
  'Grace Hopper',
  'Alan Turing',
  'Katherine Johnson',
  'Edsger Dijkstra',
  'Barbara Liskov',
  'Donald Knuth',
  'Frances Allen',
  'Ken Thompson',
  'Margaret Hamilton',
  'Dennis Ritchie',
  'Radia Perlman',
  'research-team',
  'data-eng',
  'contractors',
  'ml-platform',
]

interface AvatarColorArgs {
  /** Story only: the names in the grid, one per line. */
  names: string
  colorKey: string
  size: AvatarSize
  /** Story only: the scheme's contrast, 0–100. */
  contrast: number
}

/** The grid in one mode of the toolbar's theme, whatever mode the page is in. */
function ModePanel({
  mode,
  theme,
  contrast,
  children,
}: {
  mode: Mode
  theme: string
  contrast: number
  children: ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)
  const preset = THEME_PRESETS.find((p) => p.name === theme) ?? DEFAULT_PRESET
  useLayoutEffect(() => {
    const scheme = schemeFor(preset.theme, mode)
    if (ref.current) {
      applyTheme(
        ref.current,
        generateTheme({ ...scheme, interface: { ...scheme.interface, contrast } }),
      )
      ref.current.style.colorScheme = mode
    }
  }, [preset, mode, contrast])
  return (
    <div ref={ref} className="rounded-lg bg-(--theme-app-bg) p-4 text-(--theme-app)">
      <p className="m-0 mb-3 text-sm font-medium text-(--theme-muted-text-color)">
        {mode === 'light' ? 'Light' : 'Dark'}
      </p>
      {children}
    </div>
  )
}

/** Without a picture, a face takes a color from the theme's categorical palette, picked by its
 *  name, so the same name has the same color everywhere. Every fill keeps its initials at text
 *  contrast; a nameless face keeps the accent. */
export const AvatarColors: StoryObj<AvatarColorArgs> = {
  args: { names: NAMES.join('\n'), colorKey: '', size: 'lg', contrast: 30 },
  argTypes: {
    names: { control: 'text' },
    colorKey: {
      control: 'text',
      description: 'Passed to every avatar; empty keys each by its name.',
    },
    size: { control: 'select', options: ['xs', 'sm', 'md', 'lg', 'xl', '2xl'] },
    contrast: { control: { type: 'range', min: 0, max: 100, step: 5 } },
  },
  render: ({ names, colorKey, size, contrast }, { globals }) => {
    const list = names
      .split('\n')
      .map((name) => name.trim())
      .filter(Boolean)
    const grid = (
      <ul
        // Stories build no styles of their own, so the grid is inline.
        className="m-0 grid list-none gap-3 p-0"
        style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(11rem, 1fr))' }}
      >
        {list.map((name, index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: the list may repeat a name
          <li key={`${index}:${name}`} className="flex min-w-0 items-center gap-2 text-sm">
            <Avatar name={name} size={size} colorKey={colorKey || undefined} />
            <span className="truncate">{name}</span>
          </li>
        ))}
        <li className="flex items-center gap-2 text-sm text-(--theme-muted-text-color)">
          <Avatar size={size} />
          No name
        </li>
      </ul>
    )
    return (
      <div
        className="grid gap-4"
        style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(20rem, 1fr))' }}
      >
        {(['light', 'dark'] as const).map((mode) => (
          <ModePanel key={mode} mode={mode} theme={globals['theme']} contrast={contrast}>
            {grid}
          </ModePanel>
        ))}
      </div>
    )
  },
  play: async ({ canvasElement }) => {
    const [light] = within(canvasElement).getAllByRole('list')
    // The same name keeps its color; a nameless face keeps the accent.
    const fill = (name: string) => within(light as HTMLElement).getByRole('img', { name }).innerHTML
    await expect(fill('Ada Lovelace')).toMatch(/theme-category-\d/)
    await expect(fill('User avatar')).not.toMatch(/theme-category/)
  },
}

interface AvatarKindArgs {
  avatarColoring: AvatarColoring
  size: AvatarSize
  tooltip: boolean
}

const KIND_ROWS = [
  { name: 'maya', kind: 'person' },
  { name: 'Grace Hopper', kind: 'person' },
  { name: 'alan.turing@example.com', kind: 'person' },
  { name: 'Triage', kind: 'agent' },
  { name: 'Release notes writer', kind: 'agent' },
] as const

/** Who is a person and who is an agent. An agent is always a rounded square, so its shape and not
 *  only its color tells it apart. Under UIProvider's `avatarColoring="kind"` every person shares
 *  one tint and every agent another, with two initials even for a one-word name; a host sets
 *  `--avatar-person`, `--avatar-agent` and their `-text` colors to its own. `colorClassName`
 *  fills one that is neither, such as a connector, and `tooltip` names it on hover. */
export const AvatarKinds: StoryObj<AvatarKindArgs> = {
  args: { avatarColoring: 'kind', size: 'md', tooltip: true },
  argTypes: {
    avatarColoring: { control: 'inline-radio', options: ['name', 'kind'] },
    size: { control: 'select', options: ['xs', 'sm', 'md', 'lg', 'xl', '2xl'] },
    tooltip: { control: 'boolean' },
  },
  render: ({ avatarColoring, size, tooltip }) => (
    <UIProvider avatarColoring={avatarColoring}>
      <ul className="m-0 flex list-none flex-col gap-3 p-8">
        {KIND_ROWS.map(({ name, kind }) => (
          <li key={name} className="flex items-center gap-2 text-sm">
            <Avatar name={name} kind={kind} size={size} tooltip={tooltip} />
            <span>{name}</span>
          </li>
        ))}
        <li className="flex items-center gap-2 text-sm">
          <Avatar
            name="Webhook"
            size={size}
            tooltip={tooltip}
            colorClassName="bg-(--theme-muted-panel-bg) text-(--theme-muted-text-color)"
          />
          <span>Webhook</span>
        </li>
        <li className="flex items-center gap-2 text-sm">
          <Avatar name="Release notes writer" kind="agent" src="/missing-avatar.png" size={size} />
          <span>An agent whose picture failed</span>
        </li>
      </ul>
    </UIProvider>
  ),
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('img', { name: 'Triage' })).toHaveAttribute(
      'data-shape',
      'square',
    )
    await expect(canvas.getByRole('img', { name: 'maya' })).toHaveTextContent(
      args.avatarColoring === 'kind' ? 'MA' : 'M',
    )
  },
}

interface AvatarGroupArgs {
  count: number
  max: number
  total: number
  showOverflow: boolean
  size: AvatarSize
  ring: boolean
  ringColor: string
}

const GROUP_PEOPLE = [
  'Ada Lovelace',
  'Grace Hopper',
  'Alan Turing',
  'Radia Perlman',
  'Ken Thompson',
  'Barbara Liskov',
  'Donald Knuth',
  'Frances Allen',
]

/** Overlapping faces with a "+N" chip for the rest. `max` caps how many show; `total` counts
 *  the rest when the children are already a slice. Each avatar takes a ring in the color behind
 *  the stack, `ringColor`, which follows its shape, and one can set its own as a highlight. */
export const AvatarGroups: StoryObj<AvatarGroupArgs> = {
  args: {
    count: 6,
    max: 4,
    total: 0,
    showOverflow: true,
    size: 'sm',
    ring: true,
    ringColor: '',
  },
  argTypes: {
    count: { control: { type: 'range', min: 0, max: 8 }, description: 'Story only' },
    max: { control: { type: 'number', min: 0 } },
    total: { control: { type: 'number', min: 0 }, description: '0 leaves it unset' },
    showOverflow: { control: 'boolean' },
    size: { control: 'select', options: ['xs', 'sm', 'md', 'lg', 'xl', '2xl'] },
    ring: { control: 'boolean' },
    ringColor: { control: 'color', description: 'Empty is the panel color' },
  },
  render: ({ count, max, total, showOverflow, size, ring, ringColor }) => (
    <div className="flex flex-col gap-6 p-8 text-sm">
      <div className="rounded-xl border border-(--theme-border) bg-(--theme-panel-bg) p-4">
        <AvatarGroup
          max={max}
          total={total || undefined}
          showOverflow={showOverflow}
          size={size}
          ring={ring}
          ringColor={ringColor || undefined}
          label={`${total || count} people`}
        >
          {GROUP_PEOPLE.slice(0, count).map((name) => (
            <Avatar key={name} name={name} tooltip />
          ))}
        </AvatarGroup>
      </div>
      <UIProvider avatarColoring="kind">
        <div className="flex items-center gap-3 rounded-xl border border-(--theme-border) bg-(--theme-panel-bg) p-4">
          <AvatarGroup size={size} label="Assigned to Ada Lovelace, Triage and Grace Hopper">
            <Avatar name="Ada Lovelace" tooltip />
            <Avatar name="Triage" kind="agent" tooltip />
            {/* A host would pass className="[--avatar-ring:…]"; stories build no styles. */}
            <span
              className="flex"
              style={{ '--avatar-ring': 'var(--theme-info)' } as CSSProperties}
            >
              <Avatar name="Grace Hopper" tooltip="Grace is editing the title" />
            </span>
          </AvatarGroup>
          <span className="text-(--theme-muted-text-color)">By kind, one highlighted</span>
        </div>
      </UIProvider>
      <div className="flex items-center gap-3 p-4">
        {/* The whole stack is the tooltip's trigger: the group takes its props and ref. */}
        <Tooltip content="Ada Lovelace, Grace Hopper, Alan Turing and 6 others">
          <AvatarGroup
            size={size}
            max={3}
            total={9}
            ringColor="var(--theme-app-bg)"
            showOverflow={false}
            label="9 online"
          >
            {GROUP_PEOPLE.slice(0, 3).map((name) => (
              <Avatar key={name} name={name} />
            ))}
          </AvatarGroup>
        </Tooltip>
        <span className="text-(--theme-muted-text-color)">9 online, one tooltip for the stack</span>
      </div>
    </div>
  ),
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    const group = canvas.getByRole('group', { name: `${args.total || args.count} people` })
    const shown = Math.min(args.count, args.max)
    await expect(within(group).queryAllByRole('img')).toHaveLength(shown)
    const rest = (args.total || args.count) - shown
    if (args.showOverflow && rest > 0) {
      await expect(within(group).getByText(`${rest} more`)).toBeInTheDocument()
    }
  },
}

/** Where there is nothing yet: a panel stands in for a whole list, plain gives
 *  a list or page body the same room with no frame, dashed marks a place to add
 *  the first item, and bare sits inside something that already frames it. The
 *  icon is a bare, faded glyph. */
export const EmptyStates: StoryObj<{
  variant: EmptyStateVariant
  headingLevel: 2 | 3 | 4 | undefined
}> = {
  args: { variant: 'panel', headingLevel: undefined },
  argTypes: {
    variant: { control: 'inline-radio', options: ['panel', 'plain', 'dashed', 'bare'] },
    headingLevel: {
      control: 'inline-radio',
      options: [undefined, 2, 3, 4],
      description: 'Makes the title a heading, for an empty state that stands in for a section.',
    },
  },
  render: ({ variant, headingLevel }) => (
    <div className="max-w-xl">
      <EmptyState
        variant={variant}
        headingLevel={headingLevel}
        icon={<ClusterIcon />}
        title="No clusters yet"
        description="Connect machines you run, or start new ones in the cloud."
        action={
          <Button variant="primary" size="sm">
            Add cluster
          </Button>
        }
      />
    </div>
  ),
}

/** Every look side by side: a page body, an upload target and a sidebar. */
export const EmptyStateVariants: StoryObj = {
  render: () => (
    <div className="flex max-w-xl flex-col gap-6">
      <EmptyState
        variant="plain"
        icon={<ClusterIcon />}
        title="No clusters yet"
        description="Clusters you connect or start show here."
      />
      <EmptyState
        variant="dashed"
        headingLevel={3}
        icon={<UploadIcon />}
        title="No thumbnails"
        description="Upload an image to show on the workflow’s card."
        action={
          <Button variant="secondary" size="sm" icon={<UploadIcon />}>
            Upload image
          </Button>
        }
      />
      <div className="panel w-64">
        <EmptyState variant="bare" title="No recent files" />
      </div>
    </div>
  ),
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByRole('heading', { level: 3, name: 'No thumbnails' }),
    ).toBeVisible()
  },
}

type ModalArgs = Pick<ModalProps, 'align' | 'dismissible' | 'size' | 'closeButton'> & {
  paragraphs: number
}

function ModalDemo({
  align,
  dismissible,
  closeButton,
  size = 'md',
  paragraphs = 1,
}: Partial<ModalArgs>) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button variant="primary" onClick={() => setOpen(true)}>
        Open modal
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        align={align}
        dismissible={dismissible}
        closeButton={closeButton}
        size={size}
        title="Release notes"
        description="Focus stays inside until the modal closes, then returns to the button that opened it."
        footer={
          <Button variant="primary" size="sm" onClick={() => setOpen(false)}>
            Done
          </Button>
        }
      >
        {positionKeys(paragraphs, 'note').map((key) => (
          <p key={key} className="mb-3 text-sm last:mb-0">
            This version speeds up the scheduler, adds a retry policy to every job, and keeps logs
            for thirty days instead of seven.
          </p>
        ))}
      </Modal>
    </>
  )
}

const openModal = async (canvasElement: HTMLElement, name = 'Open modal') => {
  await userEvent.click(within(canvasElement).getByRole('button', { name }))
}

/** The standard layout: a title that names it, a description, a body and a footer. Escape
 *  and the backdrop close it. */
export const ModalStory: StoryObj<ModalArgs> = {
  name: 'Modal',
  args: { align: 'top', dismissible: true, closeButton: false, size: 'md', paragraphs: 1 },
  argTypes: {
    align: { control: 'inline-radio', options: ['top', 'center'] },
    dismissible: { control: 'boolean', description: 'False ignores Escape and the backdrop.' },
    closeButton: { control: 'boolean', description: 'A close button at the header’s end.' },
    size: { control: 'inline-radio', options: ['sm', 'md', 'lg', 'xl'] },
    paragraphs: {
      control: { type: 'range', min: 1, max: 30 },
      description: 'How long the body runs.',
    },
  },
  render: (args) => <ModalDemo {...args} />,
  play: async ({ canvasElement }) => {
    await openModal(canvasElement)
    const dialog = await screen.findByRole('dialog', { name: 'Release notes' })
    await waitFor(() => expect(dialog).toBeVisible())
    await expect(dialog).toHaveAccessibleDescription(/Focus stays inside/)
  },
}

/** A body taller than the window scrolls on its own, keeping the title and the footer in view. */
export const ModalLongBody: StoryObj = {
  name: 'Modal, long body',
  render: () => <ModalDemo paragraphs={30} />,
  play: async ({ canvasElement }) => {
    await openModal(canvasElement)
    const dialog = await screen.findByRole('dialog', { name: 'Release notes' })
    await waitFor(() => expect(dialog).toBeVisible())
    const done = within(dialog).getByRole('button', { name: 'Done' })
    const bottom = done.getBoundingClientRect().bottom
    await expect(bottom).toBeLessThanOrEqual(window.innerHeight)
  },
}

function FullscreenModalDemo() {
  const stage = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  return (
    <div
      ref={stage}
      className="flex h-48 items-center justify-center gap-3 rounded-lg bg-black p-6 text-white"
    >
      <Button variant="secondary" onClick={() => stage.current?.requestFullscreen()}>
        Enter fullscreen
      </Button>
      <Button variant="primary" onClick={() => setOpen(true)}>
        Open modal
      </Button>
      <ConfirmModal
        open={open}
        onClose={() => setOpen(false)}
        align="center"
        title="Restart session?"
        description="This will stop and restart the desktop process."
        confirmLabel="Restart"
        onConfirm={() => setOpen(false)}
      />
    </div>
  )
}

/** While an element is fullscreen the browser shows only its subtree, so a modal opened
 *  there portals into it rather than the body. Enter fullscreen, then open the modal. */
export const ModalInFullscreen: StoryObj = {
  name: 'Modal, inside fullscreen',
  render: () => <FullscreenModalDemo />,
  play: async ({ canvasElement }) => {
    await openModal(canvasElement)
    const dialog = await screen.findByRole('dialog', { name: 'Restart session?' })
    await waitFor(() => expect(dialog).toBeVisible())
  },
}

/** Unsaved input: Escape and the backdrop leave it open, its own buttons still close it. */
export const ModalNotDismissible: StoryObj = {
  name: 'Modal, not dismissible',
  render: () => <ModalDemo dismissible={false} />,
  play: async ({ canvasElement }) => {
    await openModal(canvasElement)
    const dialog = await screen.findByRole('dialog', { name: 'Release notes' })
    await userEvent.keyboard('{Escape}')
    await expect(dialog).toBeVisible()
  },
}

function ContentModalDemo() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button variant="primary" onClick={() => setOpen(true)}>
        Open modal
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        size="lg"
        title="Connect from your terminal"
        description="Run this once on the machine you connect from."
        closeButton
      >
        <pre className="m-0 overflow-x-auto rounded-md bg-(--theme-muted-panel-bg) p-3 font-mono text-xs">
          pw ssh login-1.gpu-cluster-east
        </pre>
      </Modal>
    </>
  )
}

/** A modal that only shows something, with no footer to close it: the close button in its
 *  header does, as Escape and the backdrop do. It opens and closes with a short fade and
 *  scale, a fade alone under reduced motion. */
export const ModalCloseButton: StoryObj = {
  name: 'Modal, close button',
  render: () => <ContentModalDemo />,
  play: async ({ canvasElement }) => {
    await openModal(canvasElement)
    const dialog = await screen.findByRole('dialog', { name: 'Connect from your terminal' })
    await userEvent.click(within(dialog).getByRole('button', { name: 'Close' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  },
}

function FormModalDemo() {
  const [open, setOpen] = useState(false)
  const [saved, setSaved] = useState('')
  return (
    <>
      <Button variant="primary" onClick={() => setOpen(true)}>
        Open modal
      </Button>
      {saved && <p className="mt-2 text-sm">Saved {saved}</p>}
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        size="lg"
        title="New knowledge entry"
        onSubmit={(event) => {
          setSaved(String(new FormData(event.currentTarget).get('title') ?? ''))
          setOpen(false)
        }}
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" type="submit">
              Save
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <Input label="Title" name="title" defaultValue="Deploying to staging" />
          <Input label="Tags" name="tags" placeholder="ops, release" />
        </div>
      </Modal>
    </>
  )
}

/** One form across the body and the footer: Enter in a field, or the footer's submit button,
 *  saves. */
export const ModalForm: StoryObj = {
  name: 'Modal, form',
  render: () => <FormModalDemo />,
  play: async ({ canvasElement }) => {
    await openModal(canvasElement)
    const dialog = await screen.findByRole('dialog', { name: 'New knowledge entry' })
    await userEvent.type(within(dialog).getByRole('textbox', { name: 'Tags' }), 'ops{Enter}')
    await expect(await within(canvasElement).findByText('Saved Deploying to staging')).toBeVisible()
  },
}

interface ConfirmArgs {
  destructive?: boolean
  pending?: boolean
  error?: string
  initialFocus?: 'cancel' | 'confirm' | undefined
}

function ConfirmDemo({ destructive = false, pending, error, initialFocus }: ConfirmArgs) {
  const [open, setOpen] = useState(false)
  const [snapshots, setSnapshots] = useState(false)
  return (
    <>
      <Button variant="primary" onClick={() => setOpen(true)}>
        Open modal
      </Button>
      <ConfirmModal
        open={open}
        onClose={() => setOpen(false)}
        destructive={destructive}
        title={destructive ? 'Delete cluster?' : 'Confirm action'}
        description={
          destructive ? 'Its jobs stop and its disks are erased.' : 'You can change this later.'
        }
        confirmLabel={destructive ? 'Delete' : 'Confirm'}
        onConfirm={() => setOpen(false)}
        pending={pending}
        error={error || undefined}
        initialFocus={initialFocus}
      >
        {destructive && (
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={snapshots} onCheckedChange={setSnapshots} />
            Also delete its snapshots
          </label>
        )}
      </ConfirmModal>
    </>
  )
}

/** Left-aligned question, a ruled footer, Cancel beside the action. Focus starts on the action,
 *  and on Cancel when the action can't be undone. */
export const ConfirmModalStory: StoryObj<ConfirmArgs> = {
  name: 'Confirm modal',
  args: { pending: false, error: '', initialFocus: undefined },
  argTypes: {
    pending: { description: 'Work the host runs: the buttons wait.' },
    error: { control: 'text', description: 'Why the last confirm failed.' },
    initialFocus: {
      control: 'inline-radio',
      options: [undefined, 'cancel', 'confirm', 'first-control'],
    },
  },
  render: (args) => <ConfirmDemo {...args} />,
  play: async ({ canvasElement }) => {
    await openModal(canvasElement)
    // The dialog portals outside the story canvas.
    const dialog = await screen.findByRole('dialog', { name: 'Confirm action' })
    await waitFor(() => expect(dialog).toBeVisible())
  },
}

/** A destructive confirmation is an alertdialog: it waits for an answer, and the backdrop doesn't close it. */
export const DestructiveConfirmModal: StoryObj = {
  name: 'Confirm modal, destructive',
  render: () => <ConfirmDemo destructive />,
  play: async ({ canvasElement }) => {
    await openModal(canvasElement)
    const dialog = await screen.findByRole('alertdialog', { name: 'Delete cluster?' })
    await waitFor(() => expect(dialog).toBeVisible())
    await expect(dialog).toHaveAccessibleDescription('Its jobs stop and its disks are erased.')
  },
}

function RenameDemo() {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('gpu-cluster-east')
  return (
    <>
      <Button variant="primary" onClick={() => setOpen(true)}>
        Open modal
      </Button>
      <ConfirmModal
        open={open}
        onClose={() => setOpen(false)}
        title="Rename cluster"
        description="Jobs that name it by its old name stop finding it."
        confirmLabel="Rename"
        confirmDisabled={!name.trim()}
        onConfirm={() => setOpen(false)}
      >
        <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} />
      </ConfirmModal>
    </>
  )
}

/** With a field in the body, focus starts in it rather than on a button, so the reader types
 *  at once. */
export const ConfirmModalWithField: StoryObj = {
  name: 'Confirm modal, with a field',
  render: () => <RenameDemo />,
  play: async ({ canvasElement }) => {
    await openModal(canvasElement)
    const dialog = await screen.findByRole('dialog', { name: 'Rename cluster' })
    await waitFor(() => expect(within(dialog).getByRole('textbox', { name: 'Name' })).toHaveFocus())
  },
}

function AddMountDemo() {
  const [open, setOpen] = useState(false)
  const [resource, setResource] = useState<string | null>(null)
  return (
    <>
      <Button variant="primary" onClick={() => setOpen(true)}>
        Open modal
      </Button>
      <ConfirmModal
        open={open}
        onClose={() => setOpen(false)}
        title="Add mount"
        description="A directory on a resource, mounted into your workspace."
        confirmLabel="Add mount"
        onConfirm={() => setOpen(false)}
      >
        {/* The body is padded already: its fields go straight in, at the title's edge. */}
        <div className="flex flex-col gap-4">
          <Field label="Resource" required>
            <Select
              items={[
                { value: 'gpu', label: 'gpu-cluster-east' },
                { value: 'cpu', label: 'cpu-batch-west' },
              ]}
              value={resource}
              onValueChange={setResource}
              placeholder="Pick a resource"
            />
          </Field>
          <Input
            label="Workspace path"
            mono
            defaultValue="/home/__USER__/pw/clusters/__CLUSTER__/"
          />
          <Input label="Resource path" mono placeholder="/shared/data" />
        </div>
      </ConfirmModal>
    </>
  )
}

/** A confirm that asks for several fields. At phone width the panel takes the screen's width
 *  less a small gutter, its fields line up with the title, and its actions share the footer's
 *  width at a thumb's height. */
export const ConfirmModalWithForm: StoryObj = {
  name: 'Confirm modal, with a form',
  render: () => <AddMountDemo />,
  play: async ({ canvasElement }) => {
    await openModal(canvasElement)
    const dialog = await screen.findByRole('dialog', { name: 'Add mount' })
    await waitFor(() => expect(dialog).toBeVisible())
  },
}

/** A failed confirm keeps the dialog open and says why, so the reader can try again. */
export const ConfirmModalError: StoryObj = {
  name: 'Confirm modal, failed',
  render: () => (
    <ConfirmDemo destructive error="The cluster has running jobs. Stop them, then try again." />
  ),
  play: async ({ canvasElement }) => {
    await openModal(canvasElement)
    const dialog = await screen.findByRole('alertdialog', { name: 'Delete cluster?' })
    await expect(within(dialog).getByRole('alert')).toBeVisible()
  },
}

function UseConfirmDemo() {
  const { confirm, dialog } = useConfirm()
  const [members, setMembers] = useState(['Ada Okafor', 'Lin Zhou'])
  // Counted outside render, so a retry from the same dialog sees the first try.
  const tries = useRef(0)
  return (
    <>
      <ul className="w-72 space-y-1 text-sm">
        {members.map((name) => (
          <li key={name} className="flex items-center justify-between gap-2">
            {name}
            <ActionMenu
              label={`More actions for ${name}`}
              items={[
                {
                  label: 'Remove from workspace',
                  destructive: true,
                  onClick: () =>
                    void confirm({
                      title: `Remove ${name}?`,
                      description: 'They lose access to every team in the workspace.',
                      confirmLabel: 'Remove',
                      destructive: true,
                      // The first try fails, to show the error in place.
                      onConfirm: async () => {
                        await new Promise((resolve) => setTimeout(resolve, 400))
                        tries.current += 1
                        if (tries.current === 1) {
                          throw new Error(`${name} owns a team. Hand it over first.`)
                        }
                        setMembers((all) => all.filter((m) => m !== name))
                      },
                      errorMessage: (failure) =>
                        failure instanceof Error ? failure.message : 'Something went wrong.',
                    }),
                },
              ]}
            >
              <MoreIcon />
            </ActionMenu>
          </li>
        ))}
      </ul>
      {dialog}
    </>
  )
}

/** `useConfirm` asks from a menu row without dialog state by hand. A failure shows in the
 *  dialog, which stays open for another try. */
export const UseConfirm: StoryObj = {
  name: 'Confirm modal, from a menu',
  render: () => <UseConfirmDemo />,
  play: async ({ canvasElement }) => {
    await userEvent.click(
      within(canvasElement).getByRole('button', { name: 'More actions for Ada Okafor' }),
    )
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Remove from workspace' }))
    const dialog = await screen.findByRole('alertdialog', { name: 'Remove Ada Okafor?' })
    await waitFor(() =>
      expect(within(dialog).getByRole('button', { name: 'Cancel' })).toHaveFocus(),
    )
  },
}

function CreateModalDemo() {
  const [open, setOpen] = useState(false)
  const [shared, setShared] = useState(false)
  return (
    <>
      <Button variant="primary" onClick={() => setOpen(true)}>
        New widget
      </Button>
      <CreateModal
        open={open}
        onClose={() => setOpen(false)}
        typeLabel="Widget"
        namePlaceholder="widget-name"
        validateName={(name) => (name.includes(' ') ? 'No spaces allowed' : null)}
        onSubmit={async () => true}
        showFavorite
        properties={
          <CreateModalSwitch label="Public" checked={shared} onCheckedChange={setShared} />
        }
        advanced={<Input label="Region" placeholder="nearest" />}
      />
    </>
  )
}

export const CreateModalStory: StoryObj = {
  name: 'Create modal',
  render: () => <CreateModalDemo />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'New widget' }))
    await expect(await screen.findByPlaceholderText('widget-name')).toBeVisible()
    // Secondary detail waits behind its own toggle.
    const advanced = screen.getByRole('button', { name: 'Advanced' })
    await expect(advanced).toHaveAttribute('aria-expanded', 'false')
    await userEvent.click(advanced)
    await waitFor(() => expect(screen.getByPlaceholderText('nearest')).toBeVisible())
  },
}

function NewIssueDemo({ failing, size }: { failing: boolean; size?: ModalSize | undefined }) {
  const [open, setOpen] = useState(false)
  const [team, setTeam] = useState('Web')
  const [error, setError] = useState<string>()
  const [made, setMade] = useState('')
  const teams = ['Web', 'Platform', 'Research', 'Design', 'Data', 'Mobile', 'Support', 'Infra']
  return (
    <>
      <Button variant="primary" onClick={() => setOpen(true)}>
        New issue
      </Button>
      {made && <p className="mt-2 text-sm">{made}</p>}
      <CreateModal
        open={open}
        onClose={() => {
          setOpen(false)
          setError(undefined)
        }}
        typeLabel={team}
        typeMenu={teams.map((name) => ({
          label: name,
          checked: name === team,
          onClick: () => setTeam(name),
        }))}
        typeMenuSearch={{ placeholder: 'Search teams', empty: 'No team matches' }}
        namePlaceholder="Issue title"
        footerHint={
          <>
            <Kbd keys="Enter" size="xs" /> creates · <Kbd keys="Mod+Enter" size="xs" /> creates and
            opens
          </>
        }
        error={error}
        size={size}
        onSubmit={async (name, _description, _favorite, { modifier }) => {
          if (failing) {
            setError(`The ${team} team is archived. Pick another team.`)
            return false
          }
          setMade(modifier ? `Created and opened “${name}”` : `Created “${name}”`)
          return true
        }}
      />
    </>
  )
}

/** A hint at the footer's start, which a failed submit's error replaces; a search atop a long
 *  type menu; and ⌘/Ctrl+Enter, which tells the host to open what it made. */
export const CreateModalHints: StoryObj<{ failing: boolean; size: ModalSize }> = {
  name: 'Create modal, hint and error',
  args: { failing: false, size: 'lg' },
  argTypes: {
    failing: { description: 'Story only: the submit fails with an error.' },
    size: { control: 'inline-radio', options: ['sm', 'md', 'lg', 'xl'] },
  },
  render: ({ failing, size }) => <NewIssueDemo failing={failing} size={size} />,
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole('button', { name: 'New issue' }))
    await expect(await screen.findByText(/creates and opens/)).toBeVisible()
  },
}

/** Opening the dialog's own team menu before typing a title leaves the empty title unmarked:
 *  that is still filling the form in. Escape closes the menu and hands focus back to its chip,
 *  with no tooltip there to take the next Escape, which closes the dialog. The title is marked
 *  once a create is tried, or when focus leaves the dialog with it empty. */
export const CreateModalTitleUnmarked: StoryObj = {
  name: 'Create modal, title unmarked while choosing a team',
  render: () => <NewIssueDemo failing={false} />,
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole('button', { name: 'New issue' }))
    const title = await screen.findByPlaceholderText('Issue title')
    await waitFor(() => expect(title).toHaveFocus())
    const chip = () => screen.getByRole('button', { name: /^(Web|Platform)/ })
    // Escape closes the searched menu, back on its chip, and leaves the dialog open.
    await userEvent.click(chip())
    await expect(await screen.findByRole('searchbox', { name: 'Search teams' })).toHaveFocus()
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull())
    await expect(chip()).toHaveFocus()
    await expect(screen.getByRole('dialog')).toBeVisible()
    await expect(title).not.toHaveAttribute('aria-invalid', 'true')
    // Choosing a team leaves it unmarked too.
    await userEvent.click(chip())
    await userEvent.click(await screen.findByRole('menuitemcheckbox', { name: 'Platform' }))
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull())
    await expect(chip()).toHaveTextContent('Platform')
    await expect(title).not.toHaveAttribute('aria-invalid', 'true')
  },
}

/** `xl`, for a long body such as an issue's description in a rich text editor. */
export const CreateModalWide: StoryObj = {
  name: 'Create modal, wide',
  render: () => <NewIssueDemo failing={false} size="xl" />,
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole('button', { name: 'New issue' }))
    const dialog = await screen.findByRole('dialog')
    await waitFor(() => expect(dialog).toBeVisible())
  },
}

function FullIssueDemo() {
  const [open, setOpen] = useState(false)
  const [status, setStatus] = useState<string | undefined>('todo')
  const [priority, setPriority] = useState<string>()
  const [assignee, setAssignee] = useState<string>()
  const [labels, setLabels] = useState<string>()
  const [due, setDue] = useState<string>()
  return (
    <>
      <Button variant="primary" onClick={() => setOpen(true)}>
        New issue
      </Button>
      <CreateModal
        open={open}
        onClose={() => setOpen(false)}
        typeLabel="Core Platform"
        size="xl"
        initialName="Export fails for invoices over 10,000 lines when the customer has a custom tax region"
        namePlaceholder="Issue title"
        descriptionPlaceholder="Add a description…"
        footerHint={
          <>
            <Kbd keys="Enter" size="xs" /> creates · <Kbd keys="Mod+Enter" size="xs" /> creates and
            opens
          </>
        }
        submitLabel="Create issue"
        properties={
          <>
            <CreateModalSelect
              label="Status"
              value={status}
              onValueChange={setStatus}
              items={[
                { value: 'todo', label: 'Todo' },
                { value: 'doing', label: 'In progress' },
              ]}
            />
            <CreateModalSelect
              label="Priority"
              value={priority}
              onValueChange={setPriority}
              items={[
                { value: 'high', label: 'High' },
                { value: 'low', label: 'Low' },
              ]}
            />
            <CreateModalSelect
              label="Assignee"
              icon={<UserIcon />}
              value={assignee}
              onValueChange={setAssignee}
              items={['Ada Okafor', 'Lin Zhou']}
            />
            <CreateModalSelect
              label="Labels"
              icon={<TagIcon />}
              value={labels}
              onValueChange={setLabels}
              items={['bug', 'performance']}
            />
            <CreateModalSelect
              label="Due date"
              icon={<CalendarIcon />}
              value={due}
              onValueChange={setDue}
              items={['Today', 'Next week']}
            />
          </>
        }
        onSubmit={async () => true}
      />
    </>
  )
}

/** A long title wraps rather than scrolling out of view, and the properties wrap under it. At
 *  phone width the dialog sits near the top, clear of the on-screen keyboard, the actions take
 *  the footer's width, and the key hint is left out on a touch screen. */
export const CreateModalFull: StoryObj = {
  name: 'Create modal, new issue',
  render: () => <FullIssueDemo />,
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole('button', { name: 'New issue' }))
    const title = await screen.findByRole('textbox', { name: 'Issue title' })
    await waitFor(() => expect(title).toBeVisible())
  },
}

const clusters = [
  { name: 'alpha', status: 'ready', region: 'us-east-1', nodes: 4 },
  { name: 'gamma', status: 'ready', region: 'eu-west-2', nodes: 12 },
  { name: 'beta', status: 'ready', region: 'us-west-2', nodes: 2 },
]

function TablesDemo({ density }: { density: TableDensity }) {
  const [sort, setSort] = useState<{ key: 'name' | 'nodes'; direction: SortDirection }>({
    key: 'name',
    direction: 'ascending',
  })
  const sorted = [...clusters].sort((a, b) => {
    const order = a[sort.key] < b[sort.key] ? -1 : a[sort.key] > b[sort.key] ? 1 : 0
    return sort.direction === 'descending' ? -order : order
  })
  const sortBy = (key: 'name' | 'nodes') => () =>
    setSort((now) => ({
      key,
      direction: now.key === key && now.direction === 'ascending' ? 'descending' : 'ascending',
    }))
  const directionOf = (key: 'name' | 'nodes'): SortDirection =>
    sort.key === key ? sort.direction : 'none'
  return (
    <div className="flex flex-col gap-6">
      <Table roundedTop density={density}>
        <Table.Header sort={directionOf('name')} onSort={sortBy('name')}>
          Name
        </Table.Header>
        <Table.Header>Status</Table.Header>
        <Table.Header>Region</Table.Header>
        <Table.Header sort={directionOf('nodes')} onSort={sortBy('nodes')} className="text-right">
          Nodes
        </Table.Header>
        {sorted.map((cluster) => (
          <tr key={cluster.name}>
            <Table.Item>{cluster.name}</Table.Item>
            <Table.Item>
              <StatusBadge variant="success">{cluster.status}</StatusBadge>
            </Table.Item>
            <Table.Item>{cluster.region}</Table.Item>
            <Table.Item className="text-right tabular-nums">{cluster.nodes}</Table.Item>
          </tr>
        ))}
      </Table>
      <Table density="compact" rounded>
        <Table.Header>Key</Table.Header>
        <Table.Header>Value</Table.Header>
        <tr>
          <Table.Item>version</Table.Item>
          <Table.Item>0.3.0</Table.Item>
        </tr>
        <tr>
          <Table.Item>channel</Table.Item>
          <Table.Item>stable</Table.Item>
        </tr>
      </Table>
    </div>
  )
}

/** In a box that scrolls, `stickyHeader` keeps the column titles in view
 *  while the rows pass under them. */
export const StickyTableHeader: StoryObj<{ stickyHeader: boolean }> = {
  args: { stickyHeader: true },
  argTypes: { stickyHeader: { control: 'boolean' } },
  render: ({ stickyHeader }) => (
    // Sizes are inline: the package's stylesheet doesn't scan stories.
    <div className="overflow-auto rounded-md border theme-border" style={{ height: '16rem' }}>
      <Table borderless panel={false} stickyHeader={stickyHeader}>
        <Table.Header>Name</Table.Header>
        <Table.Header>Region</Table.Header>
        <Table.Header className="text-right">Nodes</Table.Header>
        {Array.from({ length: 24 }, (_, i) => {
          const cluster = clusters[i % clusters.length] ?? clusters[0]
          const name = `${cluster?.name}-${i + 1}`
          return (
            <tr key={name}>
              <Table.Item>{name}</Table.Item>
              <Table.Item>{cluster?.region}</Table.Item>
              <Table.Item className="text-right tabular-nums">{cluster?.nodes}</Table.Item>
            </tr>
          )
        })}
      </Table>
    </div>
  ),
}

/** Column titles line up with the values under them. A sortable column's title is a
 *  button that says its direction; an unsorted one shows its mark on hover and focus.
 *  `compact` fits a short list of keys and values. */
export const Tables: StoryObj<{ density: TableDensity }> = {
  args: { density: 'comfortable' },
  argTypes: {
    density: { control: 'inline-radio', options: ['comfortable', 'compact', 'dense'] },
  },
  render: (args) => <TablesDemo {...args} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const name = canvas.getByRole('columnheader', { name: 'Name' })
    await expect(name).toHaveAttribute('aria-sort', 'ascending')
    await expect(canvas.getByRole('columnheader', { name: 'Nodes' })).toHaveAttribute(
      'aria-sort',
      'none',
    )
    await expect(canvas.getByRole('columnheader', { name: 'Status' })).not.toHaveAttribute(
      'aria-sort',
    )
    await userEvent.click(within(name).getByRole('button'))
    await expect(name).toHaveAttribute('aria-sort', 'descending')
    await expect(canvas.getAllByRole('row')[1]).toHaveTextContent('gamma')
  },
}

interface TableOptionsArgs {
  density: TableDensity
  caps: boolean
  flush: boolean
  columnDividers: boolean
}

/** A small table inside a card: `dense` type, sentence-case headers for the
 *  whole table, `flush` edges against the card's own padding, fixed column
 *  widths, and column dividers for a grid of figures. */
export const TableOptions: StoryObj<TableOptionsArgs> = {
  args: { density: 'dense', caps: false, flush: true, columnDividers: false },
  argTypes: {
    density: { control: 'inline-radio', options: ['comfortable', 'compact', 'dense'] },
    caps: { description: 'Sets every header in small capitals.' },
    flush: {
      description:
        'Drops the outer side padding of the first and last columns and the header fill, for a table in a padded card.',
    },
    columnDividers: { description: 'Rules a line between columns as well as rows.' },
  },
  render: (args) => (
    <div className="panel max-w-xl p-4">
      <Table
        {...args}
        borderless
        panel={false}
        columns={['40%', '20%', undefined]}
        className="table-fixed"
      >
        <Table.Header>Partition</Table.Header>
        <Table.Header className="text-right">Nodes</Table.Header>
        <Table.Header>State</Table.Header>
        {clusters.map((cluster) => (
          <tr key={cluster.name}>
            <Table.Item>{cluster.name}</Table.Item>
            <Table.Item className="text-right tabular-nums">{cluster.nodes}</Table.Item>
            <Table.Item>{cluster.status}</Table.Item>
          </tr>
        ))}
      </Table>
    </div>
  ),
  play: async ({ canvasElement, args }) => {
    const header = within(canvasElement).getByRole('columnheader', { name: 'Partition' })
    await expect(header.classList.contains('uppercase')).toBe(args.caps)
  },
}

function InputsDemo() {
  const [choice, setChoice] = useState<string | null>('medium')
  const [branch, setBranch] = useState('')
  const [enabled, setEnabled] = useState(false)
  return (
    <div className="flex flex-col gap-6 max-w-sm">
      <Combobox
        aria-label="Instance size"
        items={['small', 'medium', 'large']}
        value={choice}
        onValueChange={setChoice}
      />
      <Autocomplete
        aria-label="Branch"
        items={['main', 'develop']}
        value={branch}
        onValueChange={setBranch}
        placeholder="Type or pick a branch"
      />
      <label className="flex items-center gap-2 text-sm">
        <Switch checked={enabled} onCheckedChange={setEnabled} />
        Notifications
      </label>
    </div>
  )
}

export const Inputs: StoryObj = {
  render: () => <InputsDemo />,
}

function SegmentedDemo({ fill, iconOnly }: { fill: boolean; iconOnly: boolean }) {
  const [range, setRange] = useState<'day' | 'week' | 'month'>('week')
  return (
    <div className="flex w-64 flex-col gap-6">
      <SegmentedControl
        label="Range"
        value={range}
        onValueChange={setRange}
        fill={fill}
        iconOnly={iconOnly}
        options={[
          { value: 'day', label: 'Day', icon: <StatusDot variant="muted" size={6} /> },
          {
            value: 'week',
            label: 'Week',
            icon: <StatusDot variant="success" size={6} />,
            badge: <StatusDot variant="warning" size={6} />,
          },
          { value: 'month', label: 'Month', icon: <StatusDot variant="error" size={6} /> },
        ]}
      />
    </div>
  )
}

// One choice among a few, always one current. The badge says the other side
// is worth a look; with only icons it moves to the corner.
export const Segmented: StoryObj<{ fill: boolean; iconOnly: boolean }> = {
  args: { fill: true, iconOnly: false },
  render: (args) => <SegmentedDemo {...args} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Month' }))
    await expect(canvas.getByRole('button', { name: 'Month' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  },
}

const longName = 'a-very-long-resource-name-that-does-not-fit-in-its-column'

export const Tooltips: StoryObj<{ side: 'top' | 'bottom' | 'left' | 'right' }> = {
  args: { side: 'top' },
  argTypes: { side: { control: 'inline-radio', options: ['top', 'bottom', 'left', 'right'] } },
  render: ({ side }) => (
    <div className="flex flex-col items-start gap-6 p-8 text-sm">
      <div className="flex items-center gap-6">
        <Tooltip content="Saves the draft" side={side}>
          <Button variant="secondary">Save</Button>
        </Tooltip>
        <Tooltip content="Search the list" shortcut="⌘+F" side={side}>
          <Button variant="secondary">Search</Button>
        </Tooltip>
        <Tooltip content="Nothing to undo" side={side} disabled>
          <Button variant="secondary">Disabled tooltip</Button>
        </Tooltip>
      </div>
      <Tooltip content={longName} overflowOnly side={side}>
        <button type="button" className="w-48 truncate text-left">
          {longName}
        </button>
      </Tooltip>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.hover(canvas.getByRole('button', { name: 'Search' }))
    // Base UI keeps tooltips out of the accessibility tree, so find the text.
    // Wait out the hover delay and the fade-in.
    await waitFor(() => expect(screen.getByText('Search the list')).toBeVisible())
  },
}

/** A hint that adds to its anchor's name, such as what a button changes, is also the anchor's
 *  description, so assistive technology reads it whether or not the tooltip is open. */
export const TooltipDescribingItsAnchor: StoryObj = {
  render: () => (
    <div className="flex items-center gap-3 p-8 pt-20 text-sm">
      <span>platform-api</span>
      <Tooltip content="New repositories in this team start from this one." describesAnchor>
        <Button variant="ghost" size="sm">
          Make default
        </Button>
      </Tooltip>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const button = canvas.getByRole('button', { name: 'Make default' })
    await expect(button).toHaveAccessibleDescription(
      'New repositories in this team start from this one.',
    )
  },
}

export const InfoTips: StoryObj = {
  render: () => (
    <div className="flex items-center gap-6 p-8 text-sm">
      <span className="inline-flex items-center gap-1">
        Retries
        <InfoTip text={'How many times a job reruns.\nSee [the docs](https://example.com).'} />
      </span>
      <InfoTip text="The runner stopped responding." className="gap-1">
        <RunStatusIcon status="error" />
        Failed
      </InfoTip>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'More information' }))
    await waitFor(() => expect(screen.getByRole('link', { name: /^the docs/ })).toBeVisible())
  },
}

/** An InfoTip whose text a control already reads as its description hides its ? from assistive
 *  technology and Tab. A Field's `help` sets this up, and opens the tip while the control has
 *  keyboard focus. */
export const InfoTipDescribingAControl: StoryObj = {
  render: () => (
    <div className="flex items-center gap-2 p-8 pt-20 text-sm">
      <label htmlFor="retries">Retries</label>
      <InfoTip text="How many times a job reruns." describesControl />
      <input id="retries" aria-describedby="retries-help" className={fieldBox()} />
      <span id="retries-help" hidden>
        How many times a job reruns.
      </span>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('textbox', { name: 'Retries' })).toHaveAccessibleDescription(
      'How many times a job reruns.',
    )
    await expect(canvas.queryByRole('button', { name: 'More information' })).toBeNull()
  },
}

/** A thing's summary: its mark, name and kind, a row of badges, and its actions. */
export const OverviewStory: StoryObj<{ loading: boolean }> = {
  name: 'Overview',
  args: { loading: false },
  render: ({ loading }) => (
    <Overview
      className="max-w-xl"
      loading={loading}
      iconSize={48}
      icon={<Avatar name="Grace Hopper" size="2xl" />}
      name="gpu-trainer-01"
      type="Cluster"
      actions={<Button size="sm">Restart</Button>}
    >
      <StatusBadge variant="success" dot>
        Running
      </StatusBadge>
    </Overview>
  ),
}

export const OverviewLoading: StoryObj = {
  name: 'Overview loading',
  render: () => <Overview icon={null} name="Resource" loading className="max-w-sm" />,
}

export const Switches: StoryObj<{
  size: 'sm' | 'md'
  disabled: boolean
  invalid: boolean
  stateNames: boolean
  rightToLeft: boolean
}> = {
  args: { size: 'md', disabled: false, invalid: false, stateNames: true, rightToLeft: false },
  argTypes: { size: { control: 'inline-radio', options: ['sm', 'md'] } },
  render: ({ size, disabled, invalid, stateNames, rightToLeft }) => (
    // In a right-to-left page an on switch's thumb sits at the left, the end of the line.
    <div dir={rightToLeft ? 'rtl' : undefined} className="flex flex-col gap-3 text-sm">
      <label className="flex items-center gap-2">
        <Switch size={size} disabled={disabled} aria-invalid={invalid || undefined} />
        Email notifications
      </label>
      <label className="flex items-center gap-2">
        <Switch
          size={size}
          defaultChecked
          disabled={disabled}
          aria-invalid={invalid || undefined}
        />
        Automatic updates
      </label>
      {/* States with names of their own show the current one beside the switch. */}
      <div className="flex items-center gap-2">
        <span id="visibility-label">Visibility</span>
        <Switch
          aria-labelledby="visibility-label"
          size={size}
          disabled={disabled}
          aria-invalid={invalid || undefined}
          onLabel={stateNames ? 'Public' : undefined}
          offLabel={stateNames ? 'Private' : undefined}
        />
      </div>
    </div>
  ),
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    const notifications = canvas.getByRole('switch', { name: 'Email notifications' })
    await userEvent.click(notifications)
    await expect(notifications).toHaveAttribute('aria-checked', 'true')
    if (args.stateNames && !args.disabled) {
      await expect(canvas.getByText('Private')).toBeVisible()
      await userEvent.click(canvas.getByRole('switch', { name: 'Visibility' }))
      await waitFor(() => expect(canvas.getByText('Public')).toBeVisible())
      await expect(canvas.getByText('Private')).not.toBeVisible()
    }
  },
}

/** Switches in a right-to-left page, whose thumbs slide to the left when on. */
export const SwitchesRightToLeft: typeof Switches = {
  ...Switches,
  args: { ...Switches.args, rightToLeft: true },
}

// Described as a Combobox's options are, so the two lists can be compared.
const SIZES = [
  { value: 'small', label: 'Small', description: '2 vCPU, 8 GB' },
  { value: 'medium', label: 'Medium', description: '4 vCPU, 16 GB' },
  { value: 'large', label: 'Large', description: '8 vCPU, 32 GB', disabled: true },
]

function SelectsDemo({
  disabled,
  invalid,
  size,
}: {
  disabled: boolean
  invalid: boolean
  size: FieldBoxSize
}) {
  const [instance, setInstance] = useState<string | null>(null)
  const [regions, setRegions] = useState<string[]>(['us-east'])
  return (
    <div className="flex max-w-xs flex-col gap-4">
      <Select
        aria-label="Instance size"
        items={SIZES}
        value={instance}
        onValueChange={setInstance}
        placeholder="Pick a size"
        disabled={disabled}
        aria-invalid={invalid}
        size={size}
      />
      <Select
        multiple
        aria-label="Regions"
        items={[
          { value: 'us-east', label: 'US East' },
          { value: 'us-west', label: 'US West' },
          { value: 'eu-central', label: 'EU Central' },
        ]}
        value={regions}
        onValueChange={setRegions}
        placeholder="Pick regions"
        disabled={disabled}
        aria-invalid={invalid}
        size={size}
      />
    </div>
  )
}

export const Selects: StoryObj<{ disabled: boolean; invalid: boolean; size: FieldBoxSize }> = {
  args: { disabled: false, invalid: false, size: 'md' },
  argTypes: { size: { control: 'inline-radio', options: ['sm', 'md', 'lg'] } },
  render: (args) => <SelectsDemo {...args} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('combobox', { name: 'Instance size' }))
    await userEvent.click(await screen.findByRole('option', { name: 'Medium' }))
    await expect(canvas.getByRole('combobox', { name: 'Instance size' })).toHaveTextContent(
      'Medium',
    )
  },
}

function SelectInRowDemo() {
  const [group, setGroup] = useState<string | null>('allocation')
  return (
    // A narrow toolbar whose title takes what room is left: the select keeps its own width.
    <div
      className="flex items-center gap-2 rounded-md border theme-border p-2 text-sm"
      style={{ width: 340 }}
    >
      <span className="min-w-0 flex-1 truncate font-medium">
        Usage for the research allocation this month
      </span>
      <Select
        aria-label="Group by"
        width="content"
        size="sm"
        items={[
          { value: 'allocation', label: 'By allocation' },
          { value: 'user', label: 'By user' },
        ]}
        value={group}
        onValueChange={setGroup}
      />
    </div>
  )
}

/** In a row beside text that truncates, a `content` select keeps its width instead of cutting
 *  off its own choice. */
export const SelectInARow: StoryObj = {
  render: () => <SelectInRowDemo />,
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole('combobox', { name: /^Group by/ })).toHaveClass(
      'shrink-0',
    )
  },
}

const MODES = [
  { value: 'ask', label: 'Ask', description: 'Asks before every change' },
  { value: 'auto', label: 'Auto', description: 'Changes files without asking' },
  { value: 'locked', label: 'Locked', description: 'Read only', disabled: true },
]

function SelectTriggerDemo({ disabled }: { disabled: boolean }) {
  const [mode, setMode] = useState<string | null>('ask')
  return (
    <Select
      aria-label="Mode"
      items={MODES}
      value={mode}
      onValueChange={setMode}
      disabled={disabled}
      triggerTooltip="How the agent edits files"
      trigger={
        <button type="button" className={buttonClasses({ variant: 'outline', size: 'sm' })}>
          {MODES.find((m) => m.value === mode)?.label}
        </button>
      }
    />
  )
}

/** A toolbar chip opens the list; options carry a description line. */
export const SelectTrigger: StoryObj<{ disabled: boolean }> = {
  args: { disabled: false },
  render: (args) => <SelectTriggerDemo {...args} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('combobox', { name: 'Mode' }))
    await userEvent.click(await screen.findByRole('option', { name: /Auto/ }))
    await expect(canvas.getByRole('combobox', { name: 'Mode' })).toHaveTextContent('Auto')
  },
}

const THEMES = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'contrast', label: 'High contrast' },
]

function SelectPreviewDemo() {
  const [theme, setTheme] = useState<string | null>('light')
  const [previewing, setPreviewing] = useState<string | undefined>()
  const shown = previewing ?? theme
  return (
    <div className="flex max-w-xs flex-col gap-3 text-sm">
      {/* Above the Select, so the open list doesn't cover it. */}
      <span data-testid="applied">
        {previewing ? 'Previewing' : 'Applied'}: {THEMES.find((t) => t.value === shown)?.label}
      </span>
      <Select
        aria-label="Theme"
        size="sm"
        items={THEMES}
        value={theme}
        onValueChange={setTheme}
        onItemHighlighted={setPreviewing}
      />
    </div>
  )
}

/** Moving through the list previews each theme; closing it goes back to the chosen one. */
export const SelectPreview: StoryObj = {
  render: () => <SelectPreviewDemo />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('combobox', { name: 'Theme' }))
    // Opening highlights the chosen theme; the arrow moves on from there.
    await waitFor(() =>
      expect(canvas.getByTestId('applied')).toHaveTextContent('Previewing: Light'),
    )
    await userEvent.keyboard('{ArrowDown}')
    await waitFor(() => expect(canvas.getByTestId('applied')).toHaveTextContent('Previewing: Dark'))
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(canvas.getByTestId('applied')).toHaveTextContent('Applied: Light'))
  },
}

type NumberFormat = 'plain' | 'grouped' | 'currency' | 'unit'

const NUMBER_FORMATS: Record<NumberFormat, Intl.NumberFormatOptions> = {
  plain: {},
  grouped: { useGrouping: true },
  currency: { style: 'currency', currency: 'USD' },
  unit: { style: 'unit', unit: 'gigabyte' },
}

function NumberInputDemo({
  format,
  steppers,
  disabled,
  invalid,
}: {
  format: NumberFormat
  steppers: boolean
  disabled: boolean
  invalid: boolean
}) {
  const [value, setValue] = useState<number | null>(2500)
  return (
    <div className="flex max-w-xs flex-col gap-2 text-sm">
      <label htmlFor="budget" className="font-medium">
        Budget
      </label>
      <NumberInput
        id="budget"
        value={value}
        onValueChange={setValue}
        min={0}
        step={100}
        format={NUMBER_FORMATS[format]}
        steppers={steppers}
        disabled={disabled}
        aria-invalid={invalid}
      />
      <span data-testid="number-value">{value === null ? 'empty' : value}</span>
    </div>
  )
}

/** A number with Intl formatting, held as a number; steppers move it by `step` within range. */
export const NumberInputs: StoryObj<{
  format: NumberFormat
  steppers: boolean
  disabled: boolean
  invalid: boolean
}> = {
  args: { format: 'grouped', steppers: true, disabled: false, invalid: false },
  argTypes: {
    format: { control: 'inline-radio', options: ['plain', 'grouped', 'currency', 'unit'] },
  },
  render: (args) => <NumberInputDemo {...args} />,
  play: async ({ canvasElement, args }) => {
    if (args.disabled) {
      return
    }
    const canvas = within(canvasElement)
    const input = canvas.getByRole('textbox', { name: 'Budget' })
    await userEvent.clear(input)
    await userEvent.type(input, '1234')
    await waitFor(() => expect(canvas.getByTestId('number-value')).toHaveTextContent('1234'))
  },
}

function DatePickerDemo({
  withTime,
  bounded,
  required,
  disabled,
  invalid,
}: {
  withTime: boolean
  bounded: boolean
  required: boolean
  disabled: boolean
  invalid: boolean
}) {
  const [value, setValue] = useState(withTime ? '2026-03-14T09:30' : '2026-03-14')
  return (
    <div className="flex flex-col gap-2 text-sm">
      <span id="starts-label" className="font-medium">
        Starts
      </span>
      <DatePicker
        aria-labelledby="starts-label"
        value={value}
        onValueChange={setValue}
        withTime={withTime}
        timeStep={900}
        min={bounded ? (withTime ? '2026-03-10T08:00' : '2026-03-10') : undefined}
        max={bounded ? (withTime ? '2026-03-31T18:00' : '2026-03-31') : undefined}
        required={required}
        disabled={disabled}
        aria-invalid={invalid}
      />
      <span data-testid="date-value">{value || 'empty'}</span>
    </div>
  )
}

/** A day from a calendar in the reader's locale; with a time, a time input beside it. The
 *  value reads as a native date or datetime-local input's would. */
export const DatePickers: StoryObj<{
  withTime: boolean
  bounded: boolean
  required: boolean
  disabled: boolean
  invalid: boolean
}> = {
  args: { withTime: true, bounded: true, required: false, disabled: false, invalid: false },
  render: (args) => <DatePickerDemo key={String(args.withTime)} {...args} />,
  play: async ({ canvasElement, args }) => {
    if (args.disabled) {
      return
    }
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Starts' }))
    const grid = await screen.findByRole('grid')
    const day = new Intl.DateTimeFormat(undefined, { dateStyle: 'full' }).format(
      new Date(2026, 2, 20),
    )
    await userEvent.click(within(grid).getByRole('button', { name: day }))
    await waitFor(() =>
      expect(canvas.getByTestId('date-value')).toHaveTextContent(
        args.withTime ? '2026-03-20T09:30' : '2026-03-20',
      ),
    )
  },
}

const GB = 1024 ** 3

/** Readings against levels: info blue below `warnAt` (or `okTone`), amber past it, red past
 *  `errorAt`. */
export const Meters: StoryObj<{
  value: number
  showValue: BarValuePlacement
  okTone: BarTone
}> = {
  args: { value: 62, showValue: 'beside', okTone: 'info' },
  argTypes: {
    value: { control: { type: 'range', min: 0, max: 100 } },
    showValue: { control: 'inline-radio', options: ['beside', 'tooltip', 'end', 'none'] },
    okTone: {
      control: 'inline-radio',
      options: ['info', 'accent', 'success', 'muted'],
      description: 'The tone below the warning level.',
    },
  },
  render: ({ value, showValue, okTone }) => (
    <div className="flex w-72 flex-col gap-6 p-8">
      <Meter
        value={value}
        showValue={showValue}
        okTone={okTone}
        label="Storage"
        detail={`${formatBytes((value / 100) * 50 * GB)} of ${formatBytes(50 * GB)}`}
      />
      <Meter value={85} label="Memory" />
      <Meter value={96} label="Quota" />
      <Meter value={12} tone="error" label="Frozen allocation" />
      <Meter value={6} max={16} format={{}} label="Cores in use" />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getAllByRole('meter')).toHaveLength(5)
    await expect(canvas.getByRole('meter', { name: 'Memory' })).toHaveTextContent('85%')
  },
}

const USAGE = [
  ['scratch', 12.4],
  ['home', 78.25],
  ['projects', 91],
  ['archive', 0.3],
] as const

/** A column of readings with the value after each bar: a fixed track lines the bars up,
 *  the level is spoken with the value, and a small reading still shows a sliver. */
export const MeterColumn: StoryObj = {
  render: () => (
    <div className="flex w-80 flex-col gap-2 p-8 text-sm">
      {USAGE.map(([name, used]) => (
        <div key={name} className="flex items-center justify-between gap-4">
          <span>{name}</span>
          <Meter
            value={used}
            warnAt={75}
            aria-label={`${name} used`}
            showValue="end"
            trackClassName="w-24"
            minFill={2}
            format={{
              style: 'unit',
              unit: 'percent',
              minimumFractionDigits: 1,
              maximumFractionDigits: 1,
            }}
            getAriaValueText={(formatted, v) =>
              v >= 90
                ? `${formatted}, over limit`
                : v >= 75
                  ? `${formatted}, near limit`
                  : formatted
            }
            className="w-40"
          />
        </div>
      ))}
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('meter', { name: 'home used' })).toHaveAttribute(
      'aria-valuetext',
      '78.3%, near limit',
    )
  },
}

const PROGRESS: { label: string; value: number | null; tone: BarTone; status?: string }[] = [
  { label: 'results.csv', value: 42, tone: 'accent' },
  { label: 'model.bin', value: 100, tone: 'success', status: 'Completed' },
  { label: 'archive.tar', value: 64, tone: 'error', status: 'Failed' },
  { label: 'notes.txt', value: 18, tone: 'muted', status: 'Canceled' },
  { label: 'Preparing', value: null, tone: 'accent' },
]

/** Tasks under way, settled ones with a status in place of the percentage. */
export const ProgressBars: StoryObj<{ size: 'sm' | 'md' | 'lg' }> = {
  args: { size: 'md' },
  argTypes: { size: { control: 'inline-radio', options: ['sm', 'md', 'lg'] } },
  render: ({ size }) => (
    <div className="flex w-72 flex-col gap-6 p-8">
      {PROGRESS.map(({ label, value, tone, status }) => (
        <ProgressBar
          key={label}
          value={value}
          tone={tone}
          status={status}
          label={label}
          size={size}
          detail={value === 42 ? '21 MB / 50 MB' : undefined}
        />
      ))}
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('progressbar', { name: 'results.csv' })).toHaveTextContent('42%')
    await expect(canvas.getByRole('progressbar', { name: 'model.bin' })).toHaveTextContent(
      'Completed',
    )
  },
}

/** One bar in stretches, such as done work then started work, with the value after it in
 *  the host's words; compact rows fix the track's width. */
export const ProgressSegments: StoryObj<{ done: number; started: number; total: number }> = {
  args: { done: 3, started: 2, total: 8 },
  argTypes: {
    done: { control: { type: 'number', min: 0 } },
    started: { control: { type: 'number', min: 0 } },
    total: { control: { type: 'number', min: 1 } },
  },
  render: ({ done, started, total }) => (
    <div className="flex w-80 flex-col gap-6 p-8 text-sm">
      <ProgressBar
        value={done}
        max={total}
        tone="success"
        segments={[{ value: started, tone: 'info', subtle: true }]}
        showValue="end"
        aria-label="Cycle progress"
        valueText={(formatted) => `${done} of ${total} done, ${formatted}`}
      />
      <div className="flex items-center justify-between">
        <span>Sprint 12</span>
        <ProgressBar
          value={done}
          max={total}
          tone="success"
          segments={[{ value: started, tone: 'info', subtle: true }]}
          showValue="end"
          trackClassName="w-20"
          aria-label="Sprint 12 progress"
        />
      </div>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('progressbar', { name: 'Cycle progress' })).toHaveAttribute(
      'aria-valuenow',
      '3',
    )
  },
}

const MINUTE = 60_000

interface RelativeTimeArgs {
  format: 'long' | 'compact'
  locale: string
  show: 'relative' | 'absolute'
  exact: 'date' | 'short' | 'medium' | 'seconds' | 'full' | 'none'
  fallback: string
}

const DAY_MINUTES = 60 * 24

/** Times that keep counting while on screen, long or compact, with the exact
 *  time on hover, in UIProvider's `locale` when the host gives one. Compact reads
 *  a date once a week away, with the year only when it isn't this one; `show="absolute"`
 *  turns it round, and a missing time shows the `fallback`. */
export const RelativeTimes: StoryObj<RelativeTimeArgs> = {
  args: { format: 'long', locale: '', show: 'relative', exact: 'seconds', fallback: 'Never' },
  argTypes: {
    format: { control: 'inline-radio', options: ['long', 'compact'] },
    locale: { control: 'select', options: ['', 'de-DE', 'fr-FR', 'ja-JP'] },
    show: { control: 'inline-radio', options: ['relative', 'absolute'] },
    exact: {
      control: 'select',
      options: ['date', 'short', 'medium', 'seconds', 'full', 'none'],
      description: '"none" passes false: no tooltip',
    },
    fallback: { control: 'text' },
  },
  render: ({ format, locale, show, exact, fallback }) => {
    const now = Date.now()
    const rows: [string, number | null][] = [
      ['Seconds', 0.2],
      ['Minutes', 5],
      ['Hours', 90],
      ['Yesterday', 30 * 60],
      ['Days', 3 * DAY_MINUTES],
      ['Over a week', 12 * DAY_MINUTES],
      ['Last year', 400 * DAY_MINUTES],
      ['In the future', -45.5],
      ['Missing', null],
    ]
    const times = (
      <dl
        className="m-0 grid gap-x-6 gap-y-2 p-8 text-sm"
        style={{ gridTemplateColumns: 'max-content 1fr' }}
      >
        {rows.map(([label, minutes]) => (
          <div key={label} className="contents">
            <dt className="text-(--theme-muted-text-color)">{label}</dt>
            <dd className="m-0">
              <RelativeTime
                value={minutes === null ? null : now - minutes * MINUTE}
                format={format}
                show={show}
                exact={exact === 'none' ? false : exact}
                fallback={fallback}
              />
            </dd>
          </div>
        ))}
      </dl>
    )
    return locale ? <UIProvider locale={locale}>{times}</UIProvider> : times
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    if (args.show === 'relative' && !args.locale) {
      await expect(
        canvas.getByText(args.format === 'compact' ? '5m' : '5 minutes ago'),
      ).toBeInTheDocument()
    }
    if (args.fallback) {
      await expect(canvas.getByText(args.fallback)).toBeInTheDocument()
    }
  },
}

/** How long something ran: counting while it has no end, fixed once it has one. */
export const ElapsedTimes: StoryObj<{ running: boolean }> = {
  args: { running: true },
  render: ({ running }) => {
    const now = Date.now()
    return (
      <div className="flex flex-col gap-2 p-8 text-sm tabular-nums">
        <Elapsed start={now - 75_000} running={running} />
        <Elapsed start={now - 3 * 60 * MINUTE} end={now - 60 * MINUTE - 4_000} />
      </div>
    )
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('1h 59m 56s').tagName).toBe('TIME')
    await waitFor(() => expect(canvas.getByText(/^1m 1[5-9]s$/)).toBeInTheDocument())
  },
}

/** Links that leave the page open a new tab and say so to screen readers, unless their own
 *  words already do (`announce={false}`). */
export const ExternalLinks: StoryObj<{ icon: boolean; announce: boolean }> = {
  args: { icon: false, announce: false },
  argTypes: {
    icon: { control: 'boolean', description: 'An arrow after the text.' },
    announce: {
      control: 'boolean',
      description: '"(opens in a new tab)" for screen readers; off where the text says so.',
    },
  },
  render: ({ icon, announce }) => (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-2 p-8 text-sm">
      <ExternalLink href="https://example.com" className="link">
        Documentation
      </ExternalLink>
      <ExternalLink href="https://example.com" className="link" icon>
        Status page
      </ExternalLink>
      <ExternalLink href="https://example.com" className="link" icon={icon} announce={announce}>
        Open the terminal in a new tab
      </ExternalLink>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const link = canvas.getByRole('link', { name: /^Status page/ })
    await expect(link).toHaveAttribute('target', '_blank')
    await expect(link).toHaveAttribute('rel', 'noopener noreferrer')
    await expect(canvas.getByRole('link', { name: /terminal/ })).toHaveAccessibleName(
      'Open the terminal in a new tab',
    )
  },
}
