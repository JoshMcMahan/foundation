import type { Meta, StoryObj } from '@storybook/react-vite'
import type { ReactNode } from 'react'
import { expect, within } from 'storybook/test'
import { type BadgeSize, type BadgeVariant, StatusBadge } from './StatusBadge'

/** `StatusBadge` is a flag: what's notable about this one. A small soft pill right after a name,
 *  for a fixed fact worth noticing: neutral by default, accent for something new to you, warning
 *  when it warns, and never success or error, which are statuses. Not a status, which is a
 *  `StatusLabel`, and not a label someone gave it, which is a `Tag`. See
 *  [Which one](?path=/story/ui-badges--which-one). */
const meta: Meta = {
  title: 'UI/Badges/Flag',
  tags: ['autodocs'],
}
export default meta

const BADGE_VARIANTS: BadgeVariant[] = [
  'default',
  'success',
  'warning',
  'error',
  'info',
  'muted',
  'accent',
]

// A name as a list's row shows it, with its flags after it.
function Named({
  name,
  mono = false,
  children,
}: {
  name: string
  mono?: boolean
  children: ReactNode
}) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className={mono ? 'font-mono font-medium' : 'font-medium'}>{name}</span>
      {children}
    </div>
  )
}

/** A flag right after a name: neutral (`muted`) by default, such as Inline, Your version and Read
 *  only; `accent` for something new to you, such as New and Preview; `warning` when it warns,
 *  such as Ends soon. Never `success` or `error`, which are statuses. See
 *  [Which one](?path=/story/ui-badges--which-one). */
export const Flags: StoryObj<{ size: BadgeSize }> = {
  args: { size: 'sm' },
  argTypes: { size: { control: 'inline-radio', options: ['sm', 'md'] } },
  render: ({ size }) => (
    <div className="flex flex-col gap-3">
      <Named name="variant-calling-44" mono>
        <StatusBadge variant="muted" size={size}>
          Inline
        </StatusBadge>
      </Named>
      <Named name="v2.14.0">
        <StatusBadge variant="accent" emphasis="solid" size={size}>
          New
        </StatusBadge>
        <StatusBadge variant="muted" size={size}>
          Your version
        </StatusBadge>
      </Named>
      <Named name="Cost reports">
        <StatusBadge variant="accent" size={size}>
          Preview
        </StatusBadge>
      </Named>
      <Named name="Q4 allocation">
        <StatusBadge variant="warning" size={size}>
          Ends soon
        </StatusBadge>
      </Named>
      <Named name="/mnt/shared">
        <StatusBadge variant="muted" size={size}>
          Read only
        </StatusBadge>
      </Named>
    </div>
  ),
}

/** Every tone at every emphasis. A flag is `soft` by default, and `solid` is for the one thing
 *  that must catch the eye, such as New. A flag uses only `muted`, `accent` and `warning`;
 *  `success` and `error` are a status's colors, shown here for a count or a host's own mark. */
export const Emphases: StoryObj = {
  render: () => (
    <div className="flex flex-col gap-3">
      {(['soft', 'solid', 'outline'] as const).map((emphasis) => (
        <div key={emphasis} className="flex flex-wrap items-center gap-2">
          <span className="text-xs theme-muted-text" style={{ width: 64 }}>
            {emphasis}
          </span>
          {BADGE_VARIANTS.map((variant) => (
            <StatusBadge key={variant} variant={variant} emphasis={emphasis} size="md">
              {variant}
            </StatusBadge>
          ))}
        </div>
      ))}
    </div>
  ),
}

/** A flag in caps; one that links to what it names; one cut off inside a narrow cell. */
export const FlagUses: StoryObj = {
  render: () => (
    <div className="flex flex-col gap-4 text-sm">
      <div className="flex items-center gap-2">
        <StatusBadge caps variant="muted">
          All users
        </StatusBadge>
        <StatusBadge caps variant="accent">
          Beta
        </StatusBadge>
        <StatusBadge emphasis="outline" variant="muted" size="md" className="line-through">
          Superseded
        </StatusBadge>
      </div>
      <div className="flex items-center gap-2">
        <StatusBadge
          variant="muted"
          size="md"
          render={<a href="#changelog" />}
          className="font-mono"
        >
          v2.4.0
        </StatusBadge>
        <StatusBadge emphasis="outline">Latest</StatusBadge>
      </div>
      <div className="flex flex-col gap-1">
        <span className="text-xs theme-muted-text">A long flag truncates, here in 112px</span>
        <div className="flex w-28">
          <StatusBadge variant="warning" truncate>
            Quota nearly used up
          </StatusBadge>
        </div>
      </div>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('link', { name: 'v2.4.0' })).toBeVisible()
  },
}
