import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, within } from 'storybook/test'
import * as brandIcons from './brandIcons'
import type { IconType } from './icons'
import * as icons from './icons'

interface GalleryArgs {
  /** The text size the icons take theirs from, in pixels. */
  size: number
  strokeWidth: number
}

const meta: Meta<GalleryArgs> = {
  title: 'UI/Icons',
  args: { size: 20, strokeWidth: 1.5 },
  argTypes: {
    size: { control: { type: 'range', min: 12, max: 48, step: 2 } },
    strokeWidth: { control: { type: 'range', min: 1, max: 2.5, step: 0.25 } },
  },
}
export default meta

const named = (module: Record<string, unknown>) =>
  Object.entries(module)
    .filter((entry): entry is [string, IconType] => entry[0].endsWith('Icon'))
    .sort(([a], [b]) => a.localeCompare(b))

function Gallery({ entries, size, strokeWidth }: GalleryArgs & { entries: [string, IconType][] }) {
  return (
    <ul
      className="grid gap-2 text-(--theme-app)"
      style={{ fontSize: size, gridTemplateColumns: 'repeat(auto-fill, minmax(9rem, 1fr))' }}
    >
      {entries.map(([name, Icon]) => (
        <li
          key={name}
          className="flex flex-col items-center gap-2 rounded-md border border-(--theme-border) p-3"
        >
          <Icon strokeWidth={strokeWidth} />
          <code className="text-center text-xs text-(--theme-muted-text-color)">{name}</code>
        </li>
      ))}
    </ul>
  )
}

/** Every interface icon at the text's size and color. `strokeWidth` is fixed
 *  for the app; the control is here to compare weights. */
export const Interface: StoryObj<GalleryArgs> = {
  render: (args) => <Gallery entries={named(icons)} {...args} />,
  play: async ({ canvasElement }) => {
    const cells = within(canvasElement).getAllByRole('listitem')
    await expect(cells).toHaveLength(named(icons).length)
    for (const cell of cells) {
      const svg = cell.querySelector('svg')
      await expect(svg, cell.textContent ?? '').not.toBeNull()
      // Decoration: an icon without a name is hidden from assistive technology.
      await expect(svg).toHaveAttribute('aria-hidden', 'true')
    }
  },
}

/** Logos of other companies' products, from `@parallelworks/ui/brand-icons`. */
export const Brands: StoryObj<GalleryArgs> = {
  render: (args) => <Gallery entries={named(brandIcons)} {...args} />,
  play: async ({ canvasElement }) => {
    const cells = within(canvasElement).getAllByRole('listitem')
    await expect(cells).toHaveLength(named(brandIcons).length)
    for (const cell of cells) {
      await expect(cell.querySelector('svg path'), cell.textContent ?? '').not.toBeNull()
    }
  },
}

/** An icon with a `title` is named for assistive technology; one beside text
 *  that already says what it means stays hidden. */
export const Named: StoryObj<GalleryArgs> = {
  render: ({ size }) => (
    <div className="flex items-center gap-4 text-(--theme-app)" style={{ fontSize: size }}>
      <icons.UsersIcon title="Shared with you" />
      <brandIcons.GitHubIcon title="Hosted on GitHub" />
      <span className="flex items-center gap-1 text-sm">
        <icons.TrashIcon /> Delete
      </span>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('img', { name: 'Shared with you' })).toBeInTheDocument()
    await expect(canvas.getByRole('img', { name: 'Hosted on GitHub' })).toBeInTheDocument()
    await expect(canvas.getAllByRole('img')).toHaveLength(2)
  },
}
