import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, userEvent, within } from 'storybook/test'
import { AddIcon } from '../icons'
import { Button, MethodButton } from './Button'
import { type ButtonSize, type ButtonVariant, buttonClasses } from './buttonClasses'
import { Card, CardHeader } from './Card'
import { IconButton } from './IconButton'
import { Input, Textarea } from './Input'
import { LetterBadge } from './LetterBadge'
import { Pagination } from './Pagination'
import { RadioGroup } from './Radio'
import { SearchInput } from './SearchInput'
import { SegmentedControl } from './SegmentedControl'
import { SettingModeOption } from './SettingModeOption'
import { SettingRow, SettingsCard, SettingsHeading } from './SettingsCard'
import Sort, { type TDirection } from './Sort'
import { Switch } from './Switch'

const meta: Meta = {
  title: 'UI/Controls',
}
export default meta

const VARIANTS: ButtonVariant[] = ['primary', 'secondary', 'outline', 'ghost', 'danger']
const SIZES: ButtonSize[] = ['xs', 'sm', 'md']

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
            <a href="#docs" className={buttonClasses({ variant: 'ghost', size: 'sm' })}>
              Read the docs
            </a>
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
export const Cards: StoryObj<{ size: 'sm' | 'md' | 'lg'; elevated: boolean }> = {
  args: { size: 'md', elevated: false },
  argTypes: { size: { control: 'inline-radio', options: ['sm', 'md', 'lg'] } },
  render: (args) => (
    <Card {...args}>
      <CardHeader title="Connect a cluster" description="Bring an existing cluster online" />
      <p className="text-sm text-(--theme-muted-text-color)">
        Body content sits on the card surface.
      </p>
    </Card>
  ),
}

/** Rendered as a link or button, the whole card presses: it lifts on hover and shows focus. */
export const CardsPressable: StoryObj = {
  render: () => (
    <div className="flex flex-col gap-4">
      <Card size="sm" render={<a href="#cloud" />}>
        <CardHeader align="left" title="In the cloud" description="Start new machines for it" />
      </Card>
      <Card size="sm" render={<button type="button" />}>
        <CardHeader
          align="left"
          title="On my own hardware"
          description="Connect machines you run"
        />
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

type RunFilter = 'all' | 'running' | 'failed'

function SearchSortDemo({ size }: { size: 'sm' | 'md' }) {
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<RunFilter>('all')
  const [sorted, setSorted] = useState<'name' | ''>('name')
  const [direction, setDirection] = useState<TDirection>('ascending')
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
        <span className="text-sm">
          Name
          <Sort
            currentlySorted={sorted || null}
            name="name"
            currentDirection={direction}
            setCurrentDirection={setDirection}
            setCurrentlySorted={setSorted}
          />
        </span>
      </div>
      <span data-testid="shown" className="text-xs text-(--theme-muted-text-color)">
        {query ? `Matching “${query}”` : 'Every run'}, {status}
      </span>
    </div>
  )
}

/** A search box narrows the rows, a segmented control picks a status, and a column sorts. */
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

function SettingsDemo() {
  const [enabled, setEnabled] = useState(true)
  const [mode, setMode] = useState('auto')
  return (
    <div>
      <SettingsCard title="Notifications" description="How we reach you">
        <SettingsHeading>Email</SettingsHeading>
        <SettingRow label="Run completion" helpText="Email when a workflow run finishes">
          <Switch aria-label="Run completion" checked={enabled} onCheckedChange={setEnabled} />
        </SettingRow>
      </SettingsCard>
      <SettingsCard title="Digest">
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

export const Settings: StoryObj = {
  render: () => <SettingsDemo />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByText('Daily'))
    await expect(canvas.getByRole('radio', { name: /Daily/ })).toBeChecked()
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
