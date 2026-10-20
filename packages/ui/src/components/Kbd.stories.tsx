import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, within } from 'storybook/test'
import { SearchIcon } from '../icons'
import { IconButton } from './IconButton'
import { ariaKeyShortcuts, Kbd, type KbdSize, type KbdVariant, type KeyPlatform } from './Kbd'
import { UIProvider } from './Provider'
import { Tooltip } from './Tooltip'

const meta: Meta = {
  title: 'UI/Kbd',
}
export default meta

interface KbdArgs {
  keys: string
  variant: KbdVariant
  size: KbdSize
  platform: KeyPlatform
}

/** Keys to press as keycaps: a muted fill, a hairline border and monospace text. `Mod` is
 *  Command on an Apple keyboard and Control elsewhere; off Apple the keys of a combination
 *  are joined with a plus, as that platform writes them. */
export const Keycaps: StoryObj<KbdArgs> = {
  args: { keys: 'Mod+K', variant: 'keycap', size: 'sm', platform: 'other' },
  argTypes: {
    keys: { control: 'text', description: 'A combination joined by +, such as Mod+Shift+P.' },
    variant: {
      control: 'inline-radio',
      options: ['keycap', 'plain'],
      description: '`plain` is muted text, for a menu row.',
    },
    size: {
      control: 'inline-radio',
      options: ['xs', 'sm'],
      description: '`xs` for a hint inside a row or a field.',
    },
    platform: { control: 'inline-radio', options: ['apple', 'other'] },
  },
  render: (args) => (
    <div className="flex flex-col gap-4 p-8 text-sm text-(--theme-app)">
      <div className="flex items-center gap-3">
        <Kbd {...args} />
        <span className="theme-muted-text">{args.keys}</span>
      </div>
      {/* Inline: the package's stylesheet doesn't scan stories. */}
      <dl
        className="grid items-center gap-x-4 gap-y-2"
        style={{ gridTemplateColumns: '10rem 1fr' }}
      >
        <dt>
          <Kbd keys="Mod+Shift+P" platform={args.platform} size={args.size} />
        </dt>
        <dd className="theme-muted-text">Open the command palette</dd>
        <dt>
          <Kbd keys="Shift+Enter" platform={args.platform} size={args.size} />
        </dt>
        <dd className="theme-muted-text">New line</dd>
        <dt>
          <Kbd keys="Escape" platform={args.platform} size={args.size} />
        </dt>
        <dd className="theme-muted-text">Close</dd>
        <dt>
          <Kbd keys={['↑', '↓']} platform={args.platform} size={args.size} />
        </dt>
        <dd className="theme-muted-text">Move between results</dd>
        <dt>
          <Kbd keys={['[', ']']} platform={args.platform} size={args.size} />
        </dt>
        <dd className="theme-muted-text">Previous or next area</dd>
        <dt>
          <Kbd keys={['1–9']} platform={args.platform} size={args.size} />
        </dt>
        <dd className="theme-muted-text">Jump to a tab</dd>
      </dl>
    </div>
  ),
}

/** The same keys for an Apple keyboard: its symbols, with no plus. */
export const AppleKeyboard: StoryObj<KbdArgs> = {
  ...Keycaps,
  args: { ...Keycaps.args, platform: 'apple' },
}

/** In place: a search field's hint, a menu row's plain shortcut, and a tooltip's keys. The
 *  control the key presses says so to assistive technology with `aria-keyshortcuts`. */
export const InPlace: StoryObj<{ platform: KeyPlatform }> = {
  args: { platform: 'apple' },
  argTypes: { platform: { control: 'inline-radio', options: ['apple', 'other'] } },
  render: ({ platform }) => (
    <div className="flex flex-col items-start gap-6 p-8 text-sm text-(--theme-app)">
      <button
        type="button"
        aria-keyshortcuts={ariaKeyShortcuts('Mod+K', platform)}
        style={{ width: 256 }}
        className="flex h-8 items-center gap-2 rounded-md border border-(--theme-border) bg-(--theme-panel-bg) px-2.5 text-left text-(--theme-muted-text-color)"
      >
        <SearchIcon className="size-4" />
        <span className="flex-1">Search</span>
        <Kbd keys="Mod+K" size="xs" platform={platform} />
      </button>
      <div
        style={{ width: 256 }}
        className="rounded-lg border border-(--theme-border) bg-(--theme-app-bg) p-1 shadow-(--theme-shadow-lg)"
      >
        <div className="flex items-center rounded-md px-2 py-1.5">
          <span className="flex-1">Copy link</span>
          <Kbd keys="Mod+Shift+C" variant="plain" platform={platform} />
        </div>
        <div className="flex items-center rounded-md bg-(--theme-hover) px-2 py-1.5">
          <span className="flex-1">Assign to me</span>
          <Kbd keys="I" variant="plain" platform={platform} />
        </div>
      </div>
      <Tooltip content="Search" shortcut="Mod+F" side="bottom">
        <button type="button" className="link">
          Hover for a tooltip with keys
        </button>
      </Tooltip>
    </div>
  ),
}

/** Key names come from the host's strings, here German: Control is "Strg". */
export const LocalizedKeyNames: StoryObj = {
  render: () => (
    <UIProvider strings={{ keys: { ctrl: 'Strg', shift: 'Umschalt', enter: 'Eingabe' } }}>
      <div className="flex items-center gap-4 p-8">
        <Kbd keys="Mod+Shift+Enter" platform="other" />
        <IconButton icon={<SearchIcon />} label="Suchen" shortcut="f" variant="outline" />
      </div>
    </UIProvider>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Strg')).toBeInTheDocument()
    await expect(canvas.getByRole('button', { name: 'Suchen' })).toHaveAttribute(
      'aria-keyshortcuts',
      'F',
    )
  },
}
