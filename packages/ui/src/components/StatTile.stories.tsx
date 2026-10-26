import type { Meta, StoryObj } from '@storybook/react-vite'
import type { CSSProperties } from 'react'
import { expect, within } from 'storybook/test'
import { StatTile, type StatTileBar, StatTileGroup } from './StatTile'
import type { BadgeVariant } from './StatusBadge'

/** `StatTile` is a count and what it counts, at the top of a page: a large value, a label under
 *  it, a status lamp level with the label and a bar under it, each optional. With `href` or
 *  `onClick` the whole tile is a link or a button. `StatTileGroup` lines tiles up edge to edge
 *  with the content and folds them to two columns where the row is narrow, such as on a phone,
 *  with no tile alone in half a row. */
const meta: Meta = {
  title: 'UI/Stat tile',
  tags: ['autodocs'],
  // Each story sets its own 16px gutter, as a page's content has.
  parameters: { layout: 'fullscreen' },
}
export default meta

const page: CSSProperties = { padding: 16 }
const single: CSSProperties = { ...page, width: 240 }
const phone: CSSProperties = { ...page, maxWidth: 390, boxSizing: 'border-box' }

const nodesBar: StatTileBar = {
  value: 52,
  max: 102,
  tone: 'success',
  segments: [
    { value: 11, tone: 'info' },
    { value: 4, tone: 'error' },
  ],
  'aria-label': '52 nodes in use, 11 partly in use, 4 down, 35 idle, of 102',
}

/** The tiles a cluster's queues page shows: the reader's jobs, those running, pending and failed,
 *  and its nodes with a bar of how they're used, across the width on a phone. */
function QueueTiles({ href = false }: { href?: boolean }) {
  const link = (status: string) => (href ? `/jobs?status=${status}` : undefined)
  return (
    <StatTileGroup>
      <StatTile value={128} label="Your jobs" href={link('all')} />
      <StatTile
        value={3}
        label="Running"
        lamp={{ variant: 'info', pulse: true }}
        href={link('running')}
      />
      <StatTile value={17} label="Pending" lamp={{ off: true }} href={link('pending')} />
      <StatTile value={2} label="Failed" lamp={{ variant: 'error' }} href={link('failed')} />
      <StatTile
        value={35}
        suffix="/ 102 free"
        label="Nodes"
        spoken="35 of 102 nodes free"
        bar={nodesBar}
        wide
      />
    </StatTileGroup>
  )
}

interface PlaygroundArgs {
  value: number
  suffix: string
  label: string
  lamp: BadgeVariant | 'none' | 'off'
  pulse: boolean
  bar: boolean
  link: boolean
  loading: boolean
  compact: boolean
}

/** One tile, with a control for each thing a host sets. */
export const Playground: StoryObj<PlaygroundArgs> = {
  args: {
    value: 3,
    suffix: '',
    label: 'Running',
    lamp: 'info',
    pulse: true,
    bar: false,
    link: false,
    loading: false,
    compact: false,
  },
  argTypes: {
    lamp: {
      control: 'select',
      options: ['none', 'off', 'default', 'info', 'success', 'warning', 'error', 'muted'],
    },
  },
  render: ({ value, suffix, label, lamp, pulse, bar, link, loading, compact }) => (
    <div style={single}>
      <StatTile
        value={value}
        suffix={suffix || undefined}
        label={label}
        lamp={
          lamp === 'none' ? undefined : lamp === 'off' ? { off: true } : { variant: lamp, pulse }
        }
        bar={bar ? nodesBar : undefined}
        href={link ? '/jobs' : undefined}
        loading={loading}
        format={compact ? { notation: 'compact' } : undefined}
      />
    </div>
  ),
}

/** A count and its label, and a value with a quieter suffix. */
export const Plain: StoryObj = {
  render: () => (
    <div style={{ ...page, display: 'flex', gap: 12, width: 520 }}>
      <div style={{ flex: 1 }}>
        <StatTile value={128} label="Your jobs" />
      </div>
      <div style={{ flex: 1 }}>
        <StatTile value={35} suffix="/ 102 free" label="Nodes" />
      </div>
    </div>
  ),
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText('128 Your jobs')).toBeInTheDocument()
  },
}

/** A lamp level with the label, by what the state means: work under way is blue and pings (only
 *  while the count is above zero), something waiting its turn or off is the unlit ring, a failure
 *  is red and work done is green. Amber is for a state that needs a look, not for waiting. */
export const Lamps: StoryObj = {
  render: () => (
    <div style={{ ...page, display: 'grid', gridTemplateColumns: 'repeat(3, 160px)', gap: 12 }}>
      <StatTile value={3} label="Running" lamp={{ variant: 'info', pulse: true }} />
      <StatTile value={0} label="Running" lamp={{ variant: 'info', pulse: true }} />
      <StatTile value={17} label="Pending" lamp={{ off: true }} />
      <StatTile value={2} label="Failed" lamp={{ variant: 'error' }} />
      <StatTile value={96} label="Completed" lamp={{ variant: 'success' }} />
      <StatTile value={35} label="Idle" lamp={{ off: true }} />
    </div>
  ),
}

/** A bar under the label, in stretches: nodes in use, partly in use, then down, on a track whose
 *  empty rest is the idle ones. */
export const Bar: StoryObj = {
  render: () => (
    <div style={{ ...page, width: 280 }}>
      <StatTile
        value={35}
        suffix="/ 102 free"
        label="Nodes"
        spoken="35 of 102 nodes free"
        bar={nodesBar}
      />
    </div>
  ),
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole('progressbar')).toBeInTheDocument()
  },
}

/** Tiles that lead to the list they count: links, which lift on hover and show focus. Tab to one
 *  to see its ring. */
export const Links: StoryObj = {
  render: () => (
    <div style={page}>
      <QueueTiles href />
    </div>
  ),
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole('link', { name: '3 Running' })).toHaveAttribute(
      'href',
      '/jobs?status=running',
    )
  },
}

/** A group across a page's content, edge to edge with it, in one row. */
export const Group: StoryObj = {
  render: () => (
    <div style={page}>
      <QueueTiles />
    </div>
  ),
}

/** The same group in a phone's width: two rows of two counts, and the nodes tile across the row
 *  under them. An odd count of tiles stretches the last across its row, so none sits alone in
 *  half of it. */
export const GroupOnPhone: StoryObj = {
  name: 'Group on a phone',
  render: () => (
    <div style={{ ...phone, display: 'flex', flexDirection: 'column', gap: 24 }}>
      <QueueTiles />
      <StatTileGroup>
        <StatTile value={128} label="Your jobs" />
        <StatTile value={3} label="Running" lamp={{ variant: 'info', pulse: true }} />
        <StatTile value={2} label="Failed" lamp={{ variant: 'error' }} />
      </StatTileGroup>
    </div>
  ),
}

/** A long label wraps, its lamp level with the first line; a long value or suffix truncates. */
export const LongLabels: StoryObj = {
  render: () => (
    <div style={phone}>
      <StatTileGroup>
        <StatTile value={4} label="Waiting for capacity on the shared queue" lamp={{ off: true }} />
        <StatTile value={12} label="Completed with warnings in the last day" />
        <StatTile
          value={35}
          suffix="/ 102 free across every partition"
          label="Nodes"
          bar={nodesBar}
          wide
        />
      </StatTileGroup>
    </div>
  ),
}

/** Large numbers, grouped in the app's locale, and in compact notation where room is short. */
export const LargeNumbers: StoryObj = {
  render: () => (
    <div style={page}>
      <StatTileGroup>
        <StatTile value={1_284_093} label="Jobs this year" />
        <StatTile value={1_284_093} label="Jobs this year" format={{ notation: 'compact' }} />
        <StatTile value={48_211} label="Running" lamp={{ variant: 'info', pulse: true }} />
        <StatTile value={9_876_543} label="Core hours" locale="de-DE" />
      </StatTileGroup>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getAllByText('1,284,093 Jobs this year')).toHaveLength(1)
    await expect(canvas.getByText('9.876.543 Core hours')).toBeInTheDocument()
  },
}

/** While the counts load, each value is sketched and its label shows. */
export const Loading: StoryObj = {
  render: () => (
    <div style={page}>
      <StatTileGroup>
        <StatTile value={0} label="Your jobs" loading />
        <StatTile value={0} label="Running" lamp={{ variant: 'info', pulse: true }} loading />
        <StatTile value={0} label="Pending" lamp={{ off: true }} loading />
        <StatTile value={0} label="Failed" lamp={{ variant: 'error' }} loading />
      </StatTileGroup>
    </div>
  ),
}
