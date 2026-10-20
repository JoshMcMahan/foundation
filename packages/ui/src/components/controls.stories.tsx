import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, userEvent, within } from 'storybook/test'
import { AddIcon, KeyIcon, MailIcon, SaveIcon, ShieldIcon } from '../icons'
import { Button, MethodButton } from './Button'
import type { ButtonSize, ButtonVariant } from './buttonClasses'
import { Card, CardHeader, type CardPadding } from './Card'
import { IconButton } from './IconButton'
import { Input, Textarea } from './Input'
import { LetterBadge } from './LetterBadge'
import { Pagination } from './Pagination'
import { RadioGroup } from './Radio'
import { SearchInput } from './SearchInput'
import { SegmentedControl } from './SegmentedControl'
import { SettingModeOption } from './SettingModeOption'
import { SettingRow, SettingsCard, SettingsHeading } from './SettingsCard'
import { Switch } from './Switch'

const meta: Meta = {
  title: 'UI/Controls',
}
export default meta

const VARIANTS: ButtonVariant[] = ['primary', 'secondary', 'outline', 'ghost', 'danger']
const SIZES: ButtonSize[] = ['xs', 'sm', 'md', 'lg']

/** The one button look: each variant at each size, its icon-only square, and
 *  the states every button shares. */
export const Buttons: StoryObj = {
  render: () => {
    const Demo = () => {
      const [pressed, setPressed] = useState(true)
      return (
        <div className="flex flex-col gap-6 p-8 text-sm">
          <table className="border-separate border-spacing-x-4 border-spacing-y-2">
            <tbody>
              {VARIANTS.map((variant) => (
                <tr key={variant}>
                  <th scope="row" className="pr-2 text-left font-medium theme-muted-text">
                    {variant}
                  </th>
                  {SIZES.map((size) => (
                    <td key={size}>
                      <Button variant={variant} size={size} icon={<AddIcon />}>
                        Create
                      </Button>
                    </td>
                  ))}
                  {SIZES.map((size) => (
                    <td key={`${size}-icon`}>
                      <IconButton variant={variant} size={size} label="Add" icon={<AddIcon />} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex flex-wrap items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              aria-pressed={pressed}
              onClick={() => setPressed((on) => !on)}
            >
              Show hidden
            </Button>
            <Button variant="primary" size="sm" loading>
              Saving
            </Button>
            <Button variant="primary" size="sm" disabled>
              Unavailable
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled
              focusableWhenDisabled
              aria-label="Delete, which needs write access"
            >
              Delete
            </Button>
            <Button variant="ghost" size="sm" href="#docs">
              Read the docs
            </Button>
          </div>
          <div className="max-w-sm">
            <MethodButton
              label="Single sign-on"
              description="Use your organization identity provider"
              href="/sso"
            />
          </div>
        </div>
      )
    }
    return <Demo />
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const toggle = canvas.getByRole('button', { name: 'Show hidden' })
    await expect(toggle).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(toggle)
    await expect(toggle).toHaveAttribute('aria-pressed', 'false')
    await expect(canvas.getByRole('button', { name: 'Saving' })).toHaveAttribute(
      'aria-busy',
      'true',
    )
    await expect(canvas.getByRole('link', { name: 'Read the docs' })).toBeInTheDocument()
    await expect(canvas.getAllByRole('button', { name: 'Add' })).toHaveLength(15)
  },
}

function SaveDemo() {
  const [saving, setSaving] = useState(false)
  const save = () => {
    setSaving(true)
    setTimeout(() => setSaving(false), 1500)
  }
  return (
    <div className="p-8">
      <Button variant="primary" icon={<SaveIcon />} loading={saving} onClick={save}>
        {saving ? 'Saving' : 'Save'}
      </Button>
    </div>
  )
}

/** A button that turns busy keeps keyboard focus while it works, so the reader
 *  isn't sent back to the top of the page, and can't be pressed again. */
export const ButtonKeepsFocusWhileBusy: StoryObj = {
  render: () => <SaveDemo />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Save' }))
    const busy = canvas.getByRole('button', { name: 'Saving' })
    await expect(busy).toHaveAttribute('aria-busy', 'true')
    await expect(busy).toHaveFocus()
  },
}

/** Ways to go on, such as sign-in methods, spaced by their container: one
 *  loading and one unavailable. The icon reads in the accent's text color, so it
 *  stays legible on the dark theme's light accent. */
export const MethodButtons: StoryObj = {
  render: () => (
    <div className="max-w-sm space-y-3 p-8">
      <MethodButton
        icon={<ShieldIcon />}
        label="Single sign-on"
        description="Use your organization identity provider"
        href="/sso"
      />
      <MethodButton
        icon={<MailIcon />}
        label="Email link"
        description="Sent to your inbox"
        loading
      />
      <MethodButton
        icon={<KeyIcon />}
        label="Security key"
        description="Not set up on this account"
        disabled
      />
    </div>
  ),
}

interface ButtonLinkArgs {
  href: string
  variant: ButtonVariant
  disabled: boolean
  reloadDocument: boolean
  target: '' | '_blank'
}

/** `href` makes a Button or an IconButton a link in the same look: a plain click routes through
 *  the host's link, a modified or middle click opens a tab, and hovering shows the URL. Disabled,
 *  it is a link with no href, still focusable for its tooltip. */
export const ButtonLinks: StoryObj<ButtonLinkArgs> = {
  args: {
    href: '/runs/42?tab=logs#step-3',
    variant: 'primary',
    disabled: false,
    reloadDocument: false,
    target: '',
  },
  argTypes: {
    href: { control: 'text', description: 'Where it goes, search and hash included.' },
    variant: { control: 'inline-radio', options: VARIANTS },
    reloadDocument: {
      control: 'boolean',
      description: 'Loads the page instead of routing, for a path the router does not serve.',
    },
    target: { control: 'inline-radio', options: ['', '_blank'] },
  },
  render: ({ href, variant, disabled, reloadDocument, target }) => {
    const link = { href, disabled, reloadDocument, target: target || undefined }
    return (
      <div className="flex items-center gap-3 p-8">
        <Button variant={variant} icon={<AddIcon />} {...link}>
          Open run
        </Button>
        <IconButton variant={variant} label="Open run" icon={<AddIcon />} {...link} />
      </div>
    )
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    const links = canvas.getAllByRole('link', { name: 'Open run' })
    await expect(links).toHaveLength(2)
    for (const link of links) {
      if (args.disabled) {
        await expect(link).toHaveAttribute('aria-disabled', 'true')
        await expect(link).not.toHaveAttribute('href')
      } else {
        await expect(link).toHaveAttribute('href', args.href)
      }
    }
  },
}

/** A disabled link button: no href, `aria-disabled`, dimmed like a disabled button. */
export const ButtonLinksDisabled: StoryObj<ButtonLinkArgs> = {
  ...ButtonLinks,
  args: { ...ButtonLinks.args, disabled: true },
}

export const Inputs: StoryObj = {
  render: () => (
    <div className="flex flex-col gap-3 max-w-sm">
      <Input label="Cluster name" placeholder="gpu-cluster" />
      <Input
        label="Job name"
        hint={<code className="text-xs theme-muted-text">name</code>}
        description="Letters, numbers, dashes and underscores."
        defaultValue="build"
      />
      <Input type="password" placeholder="Password" />
      <Input error="Name is already taken" defaultValue="gpu" />
      <Textarea placeholder="Description" rows={3} />
      <Textarea label="Notes" description="Shown to everyone who runs the workflow." rows={3} />
    </div>
  ),
}

/** A raised surface for one task, at three sizes; `elevated` for one standing alone on a page. */
export const Cards: StoryObj<{
  size: 'sm' | 'md' | 'lg'
  elevated: boolean
  headingLevel: 1 | 2 | 3
}> = {
  args: { size: 'md', elevated: false, headingLevel: 1 },
  argTypes: {
    size: { control: 'inline-radio', options: ['sm', 'md', 'lg'] },
    headingLevel: {
      control: 'inline-radio',
      options: [1, 2, 3],
      description: "The title's level: 1 for a card that is the page.",
    },
  },
  render: ({ headingLevel, ...args }) => (
    <Card {...args}>
      <CardHeader
        headingLevel={headingLevel}
        title="Connect a cluster"
        description="Bring an existing cluster online"
      />
      <div className="flex flex-col gap-4">
        <Input label="Cluster name" placeholder="gpu-west" />
        <Input label="Address" placeholder="https://cluster.example.com" />
        <Button variant="primary" className="w-full">
          Connect
        </Button>
      </div>
    </Card>
  ),
}

/** With `href` a link, or rendered as a button, the whole card presses: it lifts on hover and shows focus. */
export const CardsPressable: StoryObj = {
  render: () => (
    <div className="flex flex-col gap-4">
      <Card size="sm" href="#cloud">
        <CardHeader title="In the cloud" description="Start new machines for it" />
      </Card>
      <Card size="sm" render={<button type="button" />}>
        <CardHeader title="On my own hardware" description="Connect machines you run" />
      </Card>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.tab()
    await expect(canvas.getByRole('link', { name: /In the cloud/ })).toHaveFocus()
    await userEvent.tab()
    await expect(canvas.getByRole('button', { name: /On my own hardware/ })).toHaveFocus()
  },
}

const MEMBERS = [
  ['Ada Park', 'Admin'],
  ['Lee Chen', 'Member'],
  ['Sam Ortiz', 'Member'],
]

/** In-page cards: `size="fill"` is a flat panel as wide as its column. A list of rows is
 *  divided with no padding; a highlighted card stands apart; a card around a field tints
 *  its border while the field has focus. */
export const CardsInPage: StoryObj<{
  padding: CardPadding
  highlight: boolean
  focusWithin: boolean
}> = {
  args: { padding: 'md', highlight: false, focusWithin: false },
  argTypes: {
    padding: { control: 'inline-radio', options: ['none', 'sm', 'md', 'lg'] },
    highlight: { description: 'An accent border, setting the card apart.' },
    focusWithin: { description: 'Tints the border while a field inside has focus.' },
  },
  render: (args) => (
    <div className="flex max-w-xl flex-col gap-4">
      <Card size="fill" {...args}>
        <p className="text-sm">Usage resets on the first of each month.</p>
      </Card>
      <Card size="fill" padding="none" divided interactive={false} render={<ul />}>
        {MEMBERS.map(([name, role]) => (
          <li key={name} className="flex items-center justify-between px-4 py-3 text-sm">
            <span>{name}</span>
            <span className="theme-muted-text">{role}</span>
          </li>
        ))}
      </Card>
      <Card size="fill" highlight render={<article />} interactive={false}>
        <p className="text-sm">A thread shared with you stands apart from the others.</p>
      </Card>
      <Card size="fill" padding="sm" focusWithin>
        <textarea
          aria-label="Comment"
          placeholder="Leave a comment"
          rows={2}
          className="w-full resize-none bg-transparent text-sm outline-none"
        />
      </Card>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('list')).not.toHaveClass('cursor-pointer')
  },
}

type RunFilter = 'all' | 'running' | 'failed'

function SearchSortDemo({ size }: { size: 'sm' | 'md' }) {
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<RunFilter>('all')
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <SearchInput
          label="Filter runs"
          value={query}
          onValueChange={setQuery}
          size={size}
          className="w-56"
        />
        <SegmentedControl
          label="Status"
          options={[
            { value: 'all', label: 'All' },
            { value: 'running', label: 'Running' },
            { value: 'failed', label: 'Failed' },
          ]}
          value={status}
          onValueChange={setStatus}
        />
      </div>
      <span data-testid="shown" className="text-xs text-(--theme-muted-text-color)">
        {query ? `Matching “${query}”` : 'Every run'}, {status}
      </span>
    </div>
  )
}

/** A search box narrows the rows, and a segmented control picks a status. Columns sort
 *  from their headers: see `UI/Primitives/Tables`. */
export const SearchAndSort: StoryObj<{ size: 'sm' | 'md' }> = {
  args: { size: 'md' },
  argTypes: { size: { control: 'inline-radio', options: ['sm', 'md'] } },
  render: (args) => <SearchSortDemo {...args} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const search = canvas.getByRole('searchbox', { name: 'Filter runs' })
    await userEvent.type(search, 'nightly')
    await expect(canvas.getByTestId('shown')).toHaveTextContent('Matching “nightly”')
    await userEvent.click(canvas.getByRole('button', { name: 'Clear search' }))
    await expect(search).toHaveValue('')
    await userEvent.type(search, 'x{Escape}')
    await expect(search).toHaveValue('')
    await userEvent.click(canvas.getByRole('button', { name: 'Failed' }))
    await expect(canvas.getByTestId('shown')).toHaveTextContent('failed')
  },
}

function PaginationDemo({ known, sizes }: { known: boolean; sizes: boolean }) {
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(50)
  return (
    <Pagination
      className="max-w-2xl border-t border-(--theme-border)"
      page={page}
      pageSize={pageSize}
      {...(known ? { total: 420 } : { hasNext: page < 4, summary: `Runs from page ${page + 1}` })}
      onPageChange={setPage}
      {...(sizes ? { onPageSizeChange: setPageSize } : {})}
    />
  )
}

/** Where a page sits in the list, with previous and next. Without a total, a
 *  list that only knows whether more follow says what the page covers itself. */
export const PaginationStory: StoryObj<{ known: boolean; sizes: boolean }> = {
  name: 'Pagination',
  args: { known: true, sizes: true },
  argTypes: {
    known: { description: 'The list knows its total.' },
    sizes: { description: 'Offers page sizes.' },
  },
  render: (args) => <PaginationDemo {...args} />,
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Next' }))
    if (args.known) {
      const position = canvas.getByText('101–150 of 420')
      // With room to spare, the position shows in full.
      await expect(position.scrollWidth).toBeLessThanOrEqual(position.clientWidth)
    }
  },
}

/** Pages the address names: previous and next are links. */
export const PaginationLinks: StoryObj = {
  render: () => (
    <Pagination page={2} pageSize={20} total={200} pageHref={(page) => `?page=${page + 1}`} />
  ),
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole('link', { name: 'Next' })).toHaveAttribute(
      'href',
      '?page=4',
    )
  },
}

function SettingsDemo({ headingLevel = 2 }: { headingLevel?: 2 | 3 }) {
  const [enabled, setEnabled] = useState(true)
  const [mode, setMode] = useState('auto')
  return (
    <div>
      <SettingsCard
        title="Notifications"
        description="How we reach you"
        headingLevel={headingLevel}
      >
        <SettingsHeading>Email</SettingsHeading>
        <SettingRow label="Run completion" helpText="Email when a workflow run finishes">
          <Switch aria-label="Run completion" checked={enabled} onCheckedChange={setEnabled} />
        </SettingRow>
      </SettingsCard>
      <SettingsCard title="Digest" headingLevel={headingLevel}>
        <RadioGroup aria-label="Digest cadence" value={mode} onValueChange={setMode}>
          <SettingModeOption
            value="auto"
            label="Automatic"
            description="Send a digest when enough has happened"
          />
          <SettingModeOption value="daily" label="Daily" description="One digest every morning" />
          <SettingModeOption
            value="off"
            label="Off"
            description="Only the run completion emails"
            disabled={!enabled}
          />
        </RadioGroup>
      </SettingsCard>
    </div>
  )
}

export const Settings: StoryObj<{ headingLevel: 2 | 3 }> = {
  args: { headingLevel: 2 },
  argTypes: {
    headingLevel: {
      control: 'inline-radio',
      options: [2, 3],
      description: "The cards' title level; a SettingsHeading sits one below.",
    },
  },
  render: (args) => <SettingsDemo {...args} />,
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('heading', { name: 'Notifications' })).toHaveProperty(
      'tagName',
      `H${args.headingLevel}`,
    )
    await expect(canvas.getByRole('heading', { name: 'Email' })).toHaveProperty(
      'tagName',
      `H${args.headingLevel + 1}`,
    )
    await userEvent.click(canvas.getByText('Daily'))
    const daily = canvas.getByRole('radio', { name: 'Daily' })
    await expect(daily).toBeChecked()
    await expect(daily).toHaveAccessibleDescription('One digest every morning')
  },
}

export const BadgesAndIconButtons: StoryObj = {
  render: () => (
    <div className="flex items-center gap-3">
      <LetterBadge text="M" />
      <LetterBadge text="Q" />
      <IconButton label="Refresh" icon={<span>↻</span>} />
    </div>
  ),
}
