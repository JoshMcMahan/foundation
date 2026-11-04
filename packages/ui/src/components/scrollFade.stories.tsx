import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, waitFor, within } from 'storybook/test'
import { cx } from '../cx'
import { fadeMask, useHiddenEnds } from './scrollFade'
import { Tag } from './Tag'

interface Args {
  width: number
  reach: string
}

const meta: Meta<Args> = {
  title: 'UI/Scroll fade',
  args: { width: 320, reach: '1.25rem' },
  argTypes: {
    width: {
      control: { type: 'range', min: 160, max: 960, step: 20 },
      description: 'The row’s width. A row wide enough to hold every chip shows whole.',
    },
    reach: { control: 'text', description: 'How far the fade reaches in from each edge.' },
  },
}
export default meta

const LABELS = [
  'gpu',
  'region: us-east',
  'spot',
  'high-memory',
  'team: research',
  'preemptible',
  'arm64',
  'nightly',
  'cost-center: 4120',
]

/** A row that scrolls sideways when its chips run past its width. */
function ChipRow({ width, reach, label }: Args & { label: string }) {
  const { ref, ends, onScroll } = useHiddenEnds()
  return (
    <div style={{ width }} className="max-w-full">
      <section
        ref={ref}
        onScroll={onScroll}
        aria-label={label}
        // Focusable so the arrow keys can scroll it, as a row that hides chips needs.
        tabIndex={ends.start || ends.end ? 0 : undefined}
        style={fadeMask(ends, reach)}
        className={cx(
          'flex gap-1.5 overflow-x-auto py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
          // The fade runs toward the line's end, which is the left in a right-to-left line.
          'rtl:[--fade-end:left]',
        )}
      >
        {LABELS.map((text) => (
          <Tag key={text} mono>
            {text}
          </Tag>
        ))}
      </section>
    </div>
  )
}

/** A machine's labels in one line. The row fades at the end that hides chips, and at both
 *  ends once scrolled partway; one wide enough for them all shows no fade. */
export const ChipsInARow: StoryObj<Args> = {
  render: (args) => <ChipRow {...args} label="Labels" />,
  play: async ({ canvasElement }) => {
    const row = within(canvasElement).getByRole('region', { name: 'Labels' })
    // Nothing hidden at the start, so only the end fades.
    await waitFor(() =>
      expect(row.style.maskImage).toMatch(/^linear-gradient\(to var\(--fade-end, right\), #000,/),
    )
    row.scrollLeft = 40
    row.dispatchEvent(new Event('scroll'))
    await waitFor(() => expect(row.style.maskImage).toMatch(/transparent, #000 1\.25rem/))
  },
}

/** The same row wide enough for every chip: no end hides anything, so no mask is set. */
export const FitsWithoutFade: StoryObj<Args> = {
  args: { width: 960 },
  render: (args) => <ChipRow {...args} label="Labels" />,
  play: async ({ canvasElement }) => {
    const row = within(canvasElement).getByRole('region', { name: 'Labels' })
    await waitFor(() => expect(row.style.maskImage).toBe(''))
  },
}

/** In a right-to-left line the row starts at the right, so the fade is on the left, where the
 *  chips run on. */
export const RightToLeft: StoryObj<Args> = {
  render: (args) => (
    <div dir="rtl">
      <ChipRow {...args} label="Labels" />
    </div>
  ),
}
