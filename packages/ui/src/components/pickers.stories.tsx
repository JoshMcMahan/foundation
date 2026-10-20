import type { Meta, StoryObj } from '@storybook/react-vite'
import { useEffect, useState } from 'react'
import { expect, screen, userEvent, waitFor, within } from 'storybook/test'
import { CalendarIcon, ChevronDownIcon, PendingIcon, RunningIcon } from '../icons'
import { Avatar } from './Avatar'
import { buttonClasses } from './buttonClasses'
import { Checkbox } from './Checkbox'
import { Combobox, type ComboboxItem } from './Combobox'
import { DatePicker } from './DatePicker'
import { Field } from './Field'
import { fieldBox } from './fieldBox'
import { Textarea, TitleInput } from './Input'
import { ListboxGroup, ListboxOption, ListboxPanel, useListboxNavigation } from './Listbox'
import { Select, type SelectItem } from './Select'
import { StatusDot } from './StatusBadge'
import { Tooltip } from './Tooltip'

const meta: Meta = {
  title: 'UI/Pickers',
}
export default meta

const chip =
  'inline-flex h-7 max-w-full cursor-pointer items-center gap-1.5 rounded-md border border-(--theme-border) bg-(--theme-panel-bg) px-2 text-xs text-(--theme-app) hover:bg-(--theme-hover) data-popup-open:bg-(--theme-hover)'

// --- Select ------------------------------------------------------------------

const ROLES: SelectItem<string>[] = [
  { value: 'viewer', label: 'Viewer' },
  { value: 'editor', label: 'Editor' },
  { value: 'admin', label: 'Administrator' },
]

const SORTS: SelectItem<string>[] = [
  { value: 'updated', label: 'Last updated' },
  { value: 'created', label: 'Created' },
  { value: 'name', label: 'Name' },
]

type WidthArg = 'default' | 'fill' | 'content'

function SelectWidthsDemo({ width }: { width: WidthArg }) {
  const [role, setRole] = useState('editor')
  const [sort, setSort] = useState('updated')
  const [zone, setZone] = useState('east')
  const chosen = width === 'default' ? undefined : width
  return (
    <div className="flex max-w-lg flex-col gap-6 text-sm">
      <p className="m-0 flex flex-wrap items-center gap-2">
        Invite them as
        <Select
          aria-label="Role"
          items={ROLES}
          value={role}
          onValueChange={setRole}
          width={chosen}
        />
        to this project.
      </p>
      <div className="flex items-center justify-between gap-2 rounded-lg border border-(--theme-border) px-3 py-2">
        <span className="font-medium">Runs</span>
        <Select
          aria-label="Sort by"
          size="sm"
          items={SORTS}
          value={sort}
          onValueChange={setSort}
          width={chosen}
          align="end"
        />
      </div>
      <Field label="Zone" description="Where the cluster's nodes start.">
        <Select
          items={[
            { value: 'east', label: 'US East' },
            { value: 'west', label: 'US West' },
          ]}
          value={zone}
          onValueChange={setZone}
          width={chosen}
        />
      </Field>
    </div>
  )
}

/** Alone, beside text or in a toolbar, a Select is as wide as its longest label, and keeps that
 *  width as the choice changes; in a Field it fills its row as a form's fields do. */
export const SelectWidths: StoryObj<{ width: WidthArg }> = {
  args: { width: 'default' },
  argTypes: { width: { control: 'inline-radio', options: ['default', 'fill', 'content'] } },
  render: (args) => <SelectWidthsDemo {...args} />,
}

function SelectDisabledReasonDemo() {
  return (
    <div className="flex max-w-xs flex-col gap-4">
      <Field label="Key type">
        <Select
          items={[
            { value: 'ed25519', label: 'Ed25519' },
            { value: 'rsa', label: 'RSA 4096' },
          ]}
          defaultValue="ed25519"
          disabled
          disabledReason="Set for the whole organization by its owners"
        />
      </Field>
      <Field label="Region">
        <Select
          items={[{ value: 'east', label: 'US East' }]}
          defaultValue="east"
          disabled
          placeholder="Pick one"
        />
      </Field>
    </div>
  )
}

/** Disabled with a reason, the field stays in the Tab order and says why on hover or focus, and
 *  a screen reader hears the reason after its name. Without one, it is skipped as before. */
export const SelectDisabledReason: StoryObj = {
  render: () => <SelectDisabledReasonDemo />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const trigger = canvas.getByRole('combobox', { name: 'Key type' })
    await expect(trigger).toHaveAccessibleDescription(
      'Set for the whole organization by its owners',
    )
    await userEvent.tab()
    await expect(trigger).toHaveFocus()
  },
}

const TEAMS: SelectItem<string>[] = [
  { value: 'plat', label: 'Platform', hint: 'PLT', description: 'Runs the shared services' },
  { value: 'web', label: 'Web', hint: 'WEB' },
  { value: 'docs', label: 'Documentation', hint: 'DOC' },
]

function SelectHintsDemo() {
  const [team, setTeam] = useState('plat')
  return (
    <div className="flex justify-end">
      <Select
        aria-label="Team"
        size="sm"
        items={TEAMS}
        value={team}
        onValueChange={setTeam}
        align="end"
      />
    </div>
  )
}

/** A row's hint, such as a team's key, sits at its end before the check, and is read after the
 *  label. At the right of a toolbar, the list lines up with the field's end. */
export const SelectHints: StoryObj = {
  render: () => <SelectHintsDemo />,
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole('combobox', { name: 'Team' }))
    await expect(await screen.findByRole('option', { name: 'Platform PLT' })).toBeVisible()
  },
}

// --- Combobox pickers --------------------------------------------------------

// A dot centered in an icon's box, so labels line up with the icons' rows.
function Dot({ variant }: { variant: 'warning' | 'success' }) {
  return (
    <span className="flex size-3.5 items-center justify-center">
      <StatusDot variant={variant} />
    </span>
  )
}

const STATUSES: ComboboxItem[] = [
  { value: 'todo', label: 'To do', icon: <PendingIcon className="size-3.5" />, hint: '1' },
  {
    value: 'doing',
    label: 'In progress',
    icon: <RunningIcon className="size-3.5 text-(--theme-info-text)" />,
    hint: '2',
  },
  { value: 'review', label: 'In review', icon: <Dot variant="warning" />, hint: '3' },
  { value: 'done', label: 'Done', icon: <Dot variant="success" />, hint: '4' },
]

const PEOPLE = ['Ada Lovelace', 'Grace Hopper', 'Katherine Johnson', 'Margaret Hamilton'].map(
  (name): ComboboxItem => ({
    value: name.toLowerCase().replace(' ', '.'),
    label: name,
    icon: <Avatar name={name} size="sm" decorative />,
  }),
)

const INITIAL_LABELS: ComboboxItem[] = ['bug', 'design', 'performance'].map((l) => ({
  value: l,
  label: l,
}))

function PickerChipsDemo({ align }: { align: 'start' | 'end' }) {
  const [status, setStatus] = useState<string | null>('doing')
  const [assignee, setAssignee] = useState<string | null>(null)
  const [labels, setLabels] = useState<string[]>(['bug'])
  const [labelItems, setLabelItems] = useState(INITIAL_LABELS)
  const [open, setOpen] = useState<'status' | 'assignee' | 'labels' | null>(null)
  // Keys open each picker, as a page's shortcuts would; one is open at a time.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.metaKey || event.ctrlKey) {
        return
      }
      const which = ({ s: 'status', a: 'assignee', l: 'labels' } as const)[event.key]
      if (which) {
        event.preventDefault()
        setOpen(which)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])
  const opens = (which: 'status' | 'assignee' | 'labels') => ({
    open: open === which,
    onOpenChange: (next: boolean) => setOpen(next ? which : null),
    align,
  })
  const statusItem = STATUSES.find((s) => s.value === status)
  const person = PEOPLE.find((p) => p.value === assignee)
  return (
    <div className={`flex flex-col gap-3 ${align === 'end' ? 'items-end' : 'items-start'}`}>
      <p className="m-0 text-xs text-(--theme-muted-text-color)">
        Press S, A or L to open a picker; type, then Enter.
      </p>
      <div className="flex flex-wrap gap-2">
        <Combobox
          aria-label="Status"
          placeholder="Change status…"
          items={STATUSES}
          value={status}
          onValueChange={setStatus}
          {...opens('status')}
          trigger={
            <button type="button" className={chip}>
              {statusItem?.icon}
              {statusItem?.label ?? 'Status'}
            </button>
          }
        />
        <Combobox
          aria-label="Assignee"
          placeholder="Assign to…"
          items={PEOPLE}
          value={assignee}
          onValueChange={setAssignee}
          {...opens('assignee')}
          trigger={
            <button type="button" className={chip}>
              {person ? (
                <>
                  <Avatar name={person.label} size="sm" decorative />
                  {person.label}
                </>
              ) : (
                <span className="text-(--theme-muted-text-color)">Unassigned</span>
              )}
            </button>
          }
        />
        <Combobox
          multiple
          aria-label="Labels"
          placeholder="Add labels…"
          items={labelItems}
          value={labels}
          onValueChange={setLabels}
          onCreate={(text) => {
            const value = text.toLowerCase()
            setLabelItems((items) => [...items, { value, label: value }])
            setLabels((current) => [...current, value])
          }}
          {...opens('labels')}
          trigger={
            <button type="button" className={chip}>
              {labels.length ? labels.join(', ') : 'Labels'}
            </button>
          }
        />
      </div>
    </div>
  )
}

/** Chips that open a searchable list: it opens on the chosen row, typing keeps the first match
 *  highlighted, so Enter picks at once. Keys open them through `open`, a row's hint holds its
 *  shortcut, and the labels picker creates a label that doesn't exist yet. */
export const PickerChips: StoryObj<{ align: 'start' | 'end' }> = {
  args: { align: 'start' },
  argTypes: { align: { control: 'inline-radio', options: ['start', 'end'] } },
  render: (args) => <PickerChipsDemo {...args} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('combobox', { name: 'Status' }))
    await waitFor(() =>
      expect(screen.getByRole('option', { name: /In progress/ })).toHaveAttribute(
        'data-highlighted',
      ),
    )
    await waitFor(() => expect(screen.getByPlaceholderText('Change status…')).toHaveFocus())
    await userEvent.keyboard('rev{Enter}')
    await expect(canvas.getByRole('combobox', { name: 'Status' })).toHaveTextContent('In review')
  },
}

function PickerListWidthDemo() {
  const [size, setSize] = useState<string | null>('m')
  const [path, setPath] = useState<string | null>(null)
  return (
    <div className="flex flex-wrap gap-2">
      <Combobox
        aria-label="Size"
        placeholder="Size…"
        items={['XS', 'S', 'M', 'L'].map((s) => ({ value: s.toLowerCase(), label: s }))}
        value={size}
        onValueChange={setSize}
        trigger={
          <button type="button" className={chip}>
            {size?.toUpperCase()}
          </button>
        }
      />
      <Combobox
        aria-label="Workflow"
        placeholder="Workflow…"
        items={[
          'workflows/nightly-regression-across-every-supported-platform.yaml',
          'workflows/build.yaml',
          'workflows/release-candidate-signing-and-publishing.yaml',
        ].map((p) => ({ value: p, label: p }))}
        value={path}
        onValueChange={setPath}
        trigger={
          <button type="button" className={chip}>
            {path ?? 'Workflow'}
          </button>
        }
      />
    </div>
  )
}

/** A chip's list is as wide as its longest row, from a 14rem floor, so a small chip still opens
 *  a list to read, up to a 28rem cap past which rows truncate. */
export const PickerListWidth: StoryObj = {
  render: () => <PickerListWidthDemo />,
}

function TagEntryDemo({ withList }: { withList: boolean }) {
  const [tags, setTags] = useState<string[]>(['climate'])
  return (
    <div className="max-w-sm">
      <Field label="Tags" description="Up to 6. Comma or Enter adds one.">
        <Combobox
          multiple
          creatable
          items={withList ? ['oceans', 'forestry', 'energy'] : []}
          value={tags}
          onValueChange={setTags}
          placeholder="Add a tag"
          maxItems={6}
          maxLength={30}
          separators={[',']}
          addOnBlur
          createValue={(typed) => typed.trim().toLowerCase() || undefined}
          suggested={['wind', 'solar', 'hydro', 'carbon']}
        />
      </Field>
    </div>
  )
}

/** Free tag entry: comma and Enter add, pasted text splits on commas, leaving the field keeps
 *  what was half typed, and each tag is trimmed and lowercased. With nothing to pick from it
 *  shows no list button; suggested tags sit under the field. */
export const TagEntry: StoryObj<{ withList: boolean }> = {
  args: { withList: false },
  render: (args) => <TagEntryDemo {...args} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.type(canvas.getByRole('combobox', { name: 'Tags' }), 'Rivers,')
    await expect(canvas.getByRole('button', { name: 'Remove rivers' })).toBeInTheDocument()
    await userEvent.click(canvas.getByRole('button', { name: 'Add “wind”' }))
    await expect(canvas.getByRole('button', { name: 'Remove wind' })).toBeInTheDocument()
  },
}

// --- DatePicker --------------------------------------------------------------

const thisYear = new Date().getFullYear()

function DateChipDemo() {
  const [due, setDue] = useState(`${thisYear}-10-30`)
  const [starts, setStarts] = useState(`${thisYear}-03-14`)
  const [ends, setEnds] = useState(`${thisYear + 1}-01-15`)
  const day = due ? new Date(`${due}T00:00`) : undefined
  const overdue = day !== undefined && day < new Date(new Date().toDateString())
  return (
    <div className="flex max-w-sm flex-col gap-4">
      <DatePicker
        aria-label="Due date"
        value={due}
        onValueChange={setDue}
        triggerTooltip="Due date"
        trigger={
          <button
            type="button"
            className={`${chip} w-fit ${overdue ? 'text-(--theme-error-text)' : ''}`}
          >
            <CalendarIcon aria-hidden="true" className="size-3.5" />
            {day
              ? `Due ${new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(day)}`
              : 'Due date'}
          </button>
        }
      />
      <div className="grid grid-cols-2 gap-3">
        <Field label="Starts">
          <DatePicker value={starts} onValueChange={setStarts} max={ends} />
        </Field>
        <Field label="Ends">
          <DatePicker value={ends} onValueChange={setEnds} min={starts} />
        </Field>
      </div>
    </div>
  )
}

/** A chip of the host's own opens the calendar and says the date its own way. A field's date
 *  leaves out the year while it is this year. The popup takes a typed date, yyyy-mm-dd or the
 *  locale's own, which moves the calendar to it; Enter picks it. */
export const DateChip: StoryObj = {
  render: () => <DateChipDemo />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Ends' }))
    const box = await screen.findByRole('textbox', { name: 'Type a date' })
    await waitFor(() => expect(box).toHaveFocus())
    await userEvent.clear(box)
    await userEvent.type(box, `${thisYear + 1}-02-03{Enter}`)
    await waitFor(() => expect(screen.queryByRole('grid')).not.toBeInTheDocument())
  },
}

// --- Textarea and TitleInput -------------------------------------------------

function ComposerDemo() {
  const [text, setText] = useState('')
  return (
    <div className="flex max-w-md flex-col gap-6">
      <Field label="Notes" description="Grows as you type, up to six lines.">
        <Textarea
          rows={2}
          autosize={{ maxRows: 6 }}
          defaultValue="Nightly runs move to the new pool next week."
        />
      </Field>
      <div className={`${fieldBox({ multiline: true, within: true, padded: false })} flex-col`}>
        <Textarea
          aria-label="Comment"
          bare
          autosize={{ maxRows: 8 }}
          rows={2}
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="Leave a comment"
          className="px-3 pt-2"
        />
        <div className="flex justify-end gap-2 px-2 pb-2">
          <button type="button" className={buttonClasses({ variant: 'ghost', size: 'sm' })}>
            Cancel
          </button>
          <button
            type="button"
            disabled={!text.trim()}
            className={buttonClasses({ variant: 'primary', size: 'sm' })}
          >
            Comment
          </button>
        </div>
      </div>
      <Field label="Private key" description="PEM, as the certificate authority issued it.">
        <Textarea
          secret
          rows={4}
          wrap="off"
          defaultValue={
            '-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASC\n-----END PRIVATE KEY-----'
          }
        />
      </Field>
    </div>
  )
}

/** A textarea that grows with its text; one with no box of its own in a composer frame that
 *  takes its focus ring; and a secret one, masked until its eye shows it. */
export const Textareas: StoryObj = {
  render: () => <ComposerDemo />,
}

function TitleInputDemo({ readOnly }: { readOnly: boolean }) {
  const [title, setTitle] = useState('Runs queue forever when no runner can take them')
  const [doc, setDoc] = useState('Onboarding checklist')
  return (
    <div className="flex max-w-xl flex-col gap-6">
      <TitleInput aria-label="Title" value={title} onCommit={setTitle} readOnly={readOnly} />
      <div className="rounded-xl border border-(--theme-border) p-4">
        <TitleInput
          aria-label="Document title"
          size="lg"
          value={doc}
          onCommit={setDoc}
          readOnly={readOnly}
        />
        <p className="m-0 mt-1 text-sm text-(--theme-muted-text-color)">Saved: {doc}</p>
      </div>
    </div>
  )
}

/** A title edited where it reads: one line that wraps and grows. Enter saves, Escape puts the
 *  saved title back, and leaving the field saves. */
export const TitleInputs: StoryObj<{ readOnly: boolean }> = {
  args: { readOnly: false },
  render: (args) => <TitleInputDemo {...args} />,
  play: async ({ canvasElement, args }) => {
    if (args.readOnly) {
      return
    }
    const canvas = within(canvasElement)
    const box = canvas.getByRole('textbox', { name: 'Document title' })
    await userEvent.clear(box)
    await userEvent.type(box, 'Team onboarding{Enter}')
    await expect(canvas.getByText('Saved: Team onboarding')).toBeInTheDocument()
  },
}

// --- Checkbox ----------------------------------------------------------------

const PERMISSIONS = ['View', 'Run', 'Edit', 'Delete']
const GRANTS: Record<string, { own: string[]; implied: string[] }> = {
  Viewers: { own: ['View'], implied: [] },
  Operators: { own: ['Run'], implied: ['View'] },
  Owners: { own: ['Delete'], implied: ['View', 'Run', 'Edit'] },
}

/** A tick something else grants, such as a role that includes it, is read-only: grey, at full
 *  strength, apart from a disabled box, and focusable so its tooltip says what grants it. */
export const CheckboxReadOnly: StoryObj = {
  render: () => (
    <div className="flex flex-col gap-4 text-sm">
      <table className="border-collapse">
        <thead>
          <tr>
            <th className="px-3 py-1.5 text-left font-medium">Group</th>
            {PERMISSIONS.map((p) => (
              <th key={p} className="px-3 py-1.5 font-medium">
                {p}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Object.entries(GRANTS).map(([group, { own, implied }]) => (
            <tr key={group} className="border-t border-(--theme-border)">
              <td className="px-3 py-2">{group}</td>
              {PERMISSIONS.map((p) => (
                <td key={p} className="px-3 py-2">
                  <span className="flex justify-center">
                    {implied.includes(p) ? (
                      <Tooltip content={`Included in ${own[0]}`}>
                        <Checkbox aria-label={`${group}: ${p}, included`} readOnly checked />
                      </Tooltip>
                    ) : (
                      <Checkbox aria-label={`${group}: ${p}`} defaultChecked={own.includes(p)} />
                    )}
                  </span>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <label className="flex items-center gap-2 whitespace-nowrap">
          <Checkbox defaultChecked /> On
        </label>
        <label className="flex items-center gap-2 whitespace-nowrap">
          <Checkbox readOnly checked /> Read-only
        </label>
        <label className="flex items-center gap-2 whitespace-nowrap">
          <Checkbox readOnly indeterminate /> Read-only, some
        </label>
        <label className="flex items-center gap-2 whitespace-nowrap">
          <Checkbox disabled defaultChecked /> Disabled
        </label>
      </div>
    </div>
  ),
}

// --- Listbox -----------------------------------------------------------------

interface Block {
  name: string
  description: string
  hint: string
  group: string
}

const BLOCKS: Block[] = [
  { name: 'Heading', description: 'A section title', hint: '#', group: 'Text' },
  { name: 'Bulleted list', description: 'Points in any order', hint: '-', group: 'Text' },
  { name: 'Quote', description: 'Words from someone else', hint: '>', group: 'Text' },
  { name: 'Code', description: 'A block of code', hint: '```', group: 'Insert' },
  { name: 'Table', description: 'Rows and columns', hint: '', group: 'Insert' },
  { name: 'Divider', description: 'A rule across the page', hint: '---', group: 'Insert' },
]

function ListboxDemo() {
  const [text, setText] = useState('/')
  const [dismissed, setDismissed] = useState(false)
  const query = /\/(\w*)$/.exec(text)?.[1]
  const matches =
    query === undefined
      ? []
      : BLOCKS.filter((b) => b.name.toLowerCase().includes(query.toLowerCase()))
  const open = matches.length > 0 && !dismissed
  const list = useListboxNavigation({
    items: matches,
    open,
    onChoose: (block) => setText(text.replace(/\/\w*$/, `[${block.name}] `)),
    onDismiss: () => setDismissed(true),
  })
  const groups = [...new Set(matches.map((b) => b.group))]
  return (
    <div className="relative max-w-md">
      <textarea
        aria-label="Body"
        {...list.hostProps}
        value={text}
        onChange={(event) => {
          setText(event.target.value)
          setDismissed(false)
          list.setActive(0)
        }}
        onKeyDown={(event) => {
          list.handleKey(event)
        }}
        rows={3}
        className={fieldBox({ multiline: true })}
      />
      {open && (
        <ListboxPanel
          listProps={list.listProps}
          aria-label="Blocks"
          className="absolute top-full left-0 mt-1 w-72"
          footer="↑↓ move · Enter or Tab inserts · Esc closes"
        >
          {groups.map((group) => (
            <ListboxGroup key={group} label={group}>
              {matches.map((block, index) =>
                block.group === group ? (
                  <ListboxOption
                    key={block.name}
                    option={list.optionProps(index)}
                    label={block.name}
                    description={block.description}
                    hint={block.hint}
                  />
                ) : null,
              )}
            </ListboxGroup>
          ))}
        </ListboxPanel>
      )}
    </div>
  )
}

/** A list a text box keeps focus over, as an editor's slash menu: arrows and Ctrl-N/P move
 *  the highlight, which a screen reader follows, Enter or Tab chooses and Escape closes. */
export const ListboxMenu: StoryObj = {
  render: () => <ListboxDemo />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const box = canvas.getByRole('textbox', { name: 'Body' })
    await userEvent.click(box)
    await userEvent.keyboard('{ArrowDown}')
    await expect(box).toHaveAttribute(
      'aria-activedescendant',
      canvas.getByRole('option', { name: /Bulleted list/ }).id,
    )
  },
}

function AnchoredListboxDemo() {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  const [picked, setPicked] = useState<string | null>(null)
  const list = useListboxNavigation({
    items: PEOPLE,
    onChoose: (person) => {
      setPicked(person.label)
      setAnchor(null)
    },
    onDismiss: () => setAnchor(null),
    open: anchor !== null,
  })
  return (
    <div className="flex flex-col items-start gap-2 text-sm">
      <button
        type="button"
        className={buttonClasses({ variant: 'outline', size: 'sm' })}
        onKeyDown={(event) => list.handleKey(event)}
        onClick={(event) => setAnchor(anchor ? null : event.currentTarget)}
        {...list.hostProps}
      >
        Mention someone
        <ChevronDownIcon aria-hidden="true" className="size-3" />
      </button>
      <span>Mentioned: {picked ?? 'nobody yet'}</span>
      {anchor && (
        <ListboxPanel
          at={anchor}
          listProps={list.listProps}
          aria-label="People"
          onDismiss={() => setAnchor(null)}
        >
          {PEOPLE.map((person, index) => (
            <ListboxOption
              key={String(person.value)}
              option={list.optionProps(index)}
              icon={person.icon}
              label={person.label}
            />
          ))}
        </ListboxPanel>
      )}
    </div>
  )
}

/** With `at`, the panel opens over the page at an element or a point, such as an editor's caret,
 *  inside a modal dialog too, while focus stays where it was. */
export const ListboxAnchored: StoryObj = {
  render: () => <AnchoredListboxDemo />,
}
