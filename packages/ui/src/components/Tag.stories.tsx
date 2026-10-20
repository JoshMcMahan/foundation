import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, userEvent, within } from 'storybook/test'
import { Tag, type TagItem, TagList } from './Tag'

const meta: Meta = {
  title: 'UI/Tags',
}
export default meta

interface TagArgs {
  mono: boolean
  caps: boolean
}

const styleArgTypes = {
  mono: { control: 'boolean', description: 'Monospace, for a value read as code.' },
  caps: { control: 'boolean', description: 'Small capitals, for a short code; off by default.' },
} as const

/** The one tag look: a pill with a hairline border and 11px text, with an optional color
 *  dot, a link with `href`, and an × with `onRemove`. */
export const Tags: StoryObj<TagArgs> = {
  args: { mono: false, caps: false },
  argTypes: styleArgTypes,
  render: (style) => (
    <div className="flex flex-wrap items-center gap-2 p-8">
      <Tag {...style}>gpu</Tag>
      <Tag {...style} color="#e5484d">
        bug
      </Tag>
      <Tag {...style} color="#30a46c">
        good first issue
      </Tag>
      <Tag {...style} color="#3e63dd" href="/issues?label=docs">
        docs
      </Tag>
      <Tag {...style} onRemove={() => {}}>
        a100
      </Tag>
      <Tag {...style} mono>
        team=research
      </Tag>
      <Tag {...style} caps>
        us-east-1
      </Tag>
    </div>
  ),
}

const LABELS: TagItem[] = [
  { key: 'bug', label: 'bug', color: '#e5484d' },
  { key: 'perf', label: 'performance', color: '#f76b15' },
  { key: 'docs', label: 'docs', color: '#3e63dd' },
  { key: 'ux', label: 'design', color: '#8e4ec6' },
  { key: 'infra', label: 'infrastructure', color: '#30a46c' },
  { key: 'gpu', label: 'gpu', color: '#12a594' },
  { key: 'triage', label: 'needs triage', color: '#8d8d8d' },
]

/** A thing's tags. `wrap` runs onto more lines; `clip` keeps one line and ends with "+N" for
 *  the rest, a button whose popover lists them and whose name reads them out. Drag the width
 *  to see it refit. */
export const TagLists: StoryObj<
  TagArgs & { overflow: 'wrap' | 'clip'; width: number; max: number }
> = {
  args: { mono: false, caps: false, overflow: 'clip', width: 280, max: 0 },
  argTypes: {
    ...styleArgTypes,
    overflow: { control: 'inline-radio', options: ['wrap', 'clip'] },
    width: { control: { type: 'range', min: 80, max: 640, step: 10 } },
    max: { control: { type: 'number', min: 0 }, description: 'At most this many; 0 for no cap.' },
  },
  render: ({ overflow, width, max, ...style }) => (
    <div className="space-y-4 p-8">
      <div
        className="rounded-md border border-dashed border-(--theme-border) p-2"
        style={{ width }}
      >
        <TagList tags={LABELS} overflow={overflow} max={max || undefined} {...style} />
      </div>
      <div
        className="rounded-md border border-dashed border-(--theme-border) p-2"
        style={{ width }}
      >
        <TagList
          tags={['gpu', 'a100', 'spot', 'us-east-1', 'research', 'long-running']}
          overflow={overflow}
          max={max || undefined}
          {...style}
        />
      </div>
    </div>
  ),
}

/** Wrapped onto more lines. */
export const TagListWrapped: typeof TagLists = {
  ...TagLists,
  args: { ...TagLists.args, overflow: 'wrap' },
}

/** The "+N" chip opened: the tags that didn't fit, in a popover. */
export const TagListMore: typeof TagLists = {
  ...TagLists,
  play: async ({ canvasElement }) => {
    const [more] = within(canvasElement).getAllByRole('button', { name: /more:/ })
    if (!more) {
      throw new Error('no +N chip')
    }
    await userEvent.click(more)
    await expect(await within(document.body).findByRole('dialog')).toBeVisible()
  },
}

function Removable() {
  const [tags, setTags] = useState(['gpu', 'a100', 'spot', 'research'])
  return (
    <TagList
      tags={tags}
      onRemove={(key) => setTags((current) => current.filter((tag) => tag !== key))}
    />
  )
}

/** Each tag with an ×, named "Remove gpu" and so on. */
export const RemovableTags: StoryObj = {
  render: () => (
    <div className="p-8">
      <Removable />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Remove spot' }))
    await expect(canvas.queryByText('spot')).toBeNull()
  },
}
