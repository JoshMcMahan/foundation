import type { Decorator, Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, screen, userEvent, waitFor, within } from 'storybook/test'
import { cx } from '../cx'
import { ExpressionIcon } from '../icons'
import { Checkbox, CheckboxGroup } from './Checkbox'
import { ColorInput } from './ColorInput'
import { Autocomplete, Combobox } from './Combobox'
import { DatePicker } from './DatePicker'
import { ErrorText, Field, type FieldLayout, FieldOption, FieldValue } from './Field'
import { type FieldBoxSize, fieldBox } from './fieldBox'
import { IconButton } from './IconButton'
import { Input, Textarea } from './Input'
import { NumberInput } from './NumberInput'
import { OneTimeCodeInput } from './OneTimeCodeInput'
import { Radio, RadioGroup } from './Radio'
import { SearchInput } from './SearchInput'
import { SegmentedControl } from './SegmentedControl'
import { Select } from './Select'
import { Slider } from './Slider'
import { Switch } from './Switch'

const meta: Meta = {
  title: 'UI/Fields',
}
export default meta

const zones = [
  { value: 'east', label: 'East' },
  { value: 'west', label: 'West' },
  { value: 'north', label: 'North' },
]

interface BoxArgs {
  size: FieldBoxSize
  invalid: boolean
  disabled: boolean
}

function Boxes({ size, invalid, disabled }: BoxArgs) {
  const [date, setDate] = useState('')
  const [query, setQuery] = useState('')
  const [color, setColor] = useState('#1f6feb')
  return (
    <div className="flex max-w-sm flex-col gap-3">
      <input
        aria-label="Plain"
        placeholder="A native input with fieldBox()"
        aria-invalid={invalid || undefined}
        disabled={disabled}
        className={fieldBox({ size })}
      />
      <Input
        aria-label="Name"
        placeholder="Name"
        size={size}
        aria-invalid={invalid || undefined}
        disabled={disabled}
      />
      <SearchInput
        label="Search"
        value={query}
        onValueChange={setQuery}
        size={size}
        aria-invalid={invalid || undefined}
        disabled={disabled}
      />
      <Select<string>
        aria-label="Zone"
        placeholder="Zone"
        items={zones}
        size={size}
        aria-invalid={invalid}
        disabled={disabled}
      />
      <Combobox<string>
        aria-label="Zones"
        placeholder="Zones"
        items={zones}
        multiple
        defaultValue={['east']}
        size={size}
        aria-invalid={invalid}
        disabled={disabled}
      />
      <NumberInput
        aria-label="Workers"
        defaultValue={4}
        min={1}
        size={size}
        steppers
        aria-invalid={invalid}
        disabled={disabled}
      />
      <Autocomplete
        aria-label="Region"
        placeholder="Region"
        items={zones.map((zone) => zone.value)}
        size={size}
        aria-invalid={invalid}
        disabled={disabled}
      />
      <DatePicker
        aria-label="Start"
        value={date}
        onValueChange={setDate}
        withTime
        size={size}
        aria-invalid={invalid}
        disabled={disabled}
      />
      <ColorInput
        aria-label="Highlight"
        value={color}
        onValueChange={setColor}
        size={size}
        aria-invalid={invalid}
        disabled={disabled}
      />
      <Textarea
        aria-label="Notes"
        placeholder="Notes"
        size={size}
        aria-invalid={invalid || undefined}
        disabled={disabled}
        rows={2}
      />
    </div>
  )
}

/** Every box a value is typed or picked in shares one recipe: size, focus ring, invalid and disabled. */
export const Box: StoryObj<BoxArgs> = {
  args: { size: 'md', invalid: false, disabled: false },
  argTypes: { size: { control: 'inline-radio', options: ['sm', 'md'] } },
  render: (args) => <Boxes {...args} />,
}

export const BoxInvalid: StoryObj<BoxArgs> = {
  ...Box,
  args: { size: 'md', invalid: true, disabled: false },
}

export const BoxDisabled: StoryObj<BoxArgs> = {
  ...Box,
  args: { size: 'sm', invalid: false, disabled: true },
}

interface FrameArgs {
  layout: FieldLayout
  size: FieldBoxSize
  required: boolean
  disabled: boolean
  error: string
  description: string
  help: string
  /** Shows a hint beside the label, here the field's key. */
  hint: boolean
}

/** One frame names, describes and flags any control: the label, its hint, a description and an error. */
export const Frame: StoryObj<FrameArgs> = {
  args: {
    layout: 'stacked',
    size: 'md',
    required: true,
    disabled: false,
    error: '',
    description: 'Letters, numbers and dashes.',
    help: '',
    hint: true,
  },
  argTypes: {
    layout: { control: 'inline-radio', options: ['stacked', 'inline'] },
    size: { control: 'inline-radio', options: ['sm', 'md'] },
  },
  // The controls sit straight in their Fields, which name, describe and mark them.
  render: ({ layout, size, required, disabled, error, description, help, hint }) => (
    <div className="flex max-w-lg flex-col gap-4">
      <Field
        label="Cluster"
        hint={hint && <code className="text-xs theme-muted-text">cluster</code>}
        help={help || undefined}
        description={description || undefined}
        error={error || undefined}
        required={required}
        disabled={disabled}
        layout={layout}
        size={size}
      >
        <Input disabled={disabled} size={size} />
      </Field>
      <Field label="Zone" required={required} disabled={disabled} layout={layout} size={size}>
        <Select<string> placeholder="Zone" items={zones} disabled={disabled} size={size} />
      </Field>
      <Field label="Monitoring" disabled={disabled} layout={layout} size={size}>
        <Switch size={size} disabled={disabled} defaultChecked />
      </Field>
      <Field
        label="Precision"
        group
        required={required}
        disabled={disabled}
        layout={layout}
        size={size}
      >
        {(control) => (
          <RadioGroup
            {...control}
            defaultValue="fp16"
            className={cx('flex gap-x-5', size === 'sm' ? 'py-1.5 text-xs' : 'py-2 text-sm')}
          >
            <FieldOption className="flex items-center gap-2">
              <Radio value="fp16" />
              Half
            </FieldOption>
            <FieldOption className="flex items-center gap-2">
              <Radio value="fp32" />
              Single
            </FieldOption>
          </RadioGroup>
        )}
      </Field>
    </div>
  ),
}

export const FrameInline: StoryObj<FrameArgs> = {
  ...Frame,
  args: { ...Frame.args, layout: 'inline' } as FrameArgs,
}

/** At `sm` the label is a small, muted caption that keeps to the height of `sm` controls. */
export const FrameSmall: StoryObj<FrameArgs> = {
  ...Frame,
  args: { ...Frame.args, size: 'sm' } as FrameArgs,
  play: async ({ canvasElement }) => {
    const label = within(canvasElement).getByText('Cluster')
    await expect(getComputedStyle(label).fontSize).toBe('12px')
  },
}

export const FrameSmallInline: StoryObj<FrameArgs> = {
  ...Frame,
  args: { ...Frame.args, size: 'sm', layout: 'inline' } as FrameArgs,
}

export const FrameWithError: StoryObj<FrameArgs> = {
  ...Frame,
  args: { ...Frame.args, error: 'A cluster with this name already exists.' } as FrameArgs,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const box = canvas.getByRole('textbox', { name: /Cluster/ })
    await expect(box).toHaveAttribute('aria-invalid', 'true')
    await expect(box).toHaveAccessibleDescription(/already exists/)
  },
}

function FrameWithActionsDemo() {
  const [typed, setTyped] = useState(false)
  const [mode, setMode] = useState<'name' | 'target'>('name')
  return (
    <div className="flex max-w-lg flex-col gap-4">
      <Field
        label="Runs on"
        description={typed ? 'An expression the run reads.' : 'Where the job runs.'}
        group
        actions={
          <IconButton
            icon={<ExpressionIcon />}
            label={typed ? 'Stop using an expression' : 'Use an expression instead'}
            size="sm"
            variant="ghost"
            onClick={() => setTyped(!typed)}
          />
        }
      >
        {typed ? (
          <input aria-label="Runs on" className={fieldBox()} defaultValue="${{ inputs.target }}" />
        ) : (
          <SegmentedControl
            options={[
              { value: 'name', label: 'By name' },
              { value: 'target', label: 'By target' },
            ]}
            value={mode}
            onValueChange={setMode}
          />
        )}
      </Field>
    </div>
  )
}

/** Buttons at the end of the label's row act on the field, here switching its control to a
 *  typed expression; a group's legend names the segmented control inside. */
export const FrameWithActions: StoryObj = {
  render: () => <FrameWithActionsDemo />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('group', { name: 'Runs on' })).toBeInTheDocument()
    await userEvent.click(canvas.getByRole('button', { name: 'Use an expression instead' }))
    await expect(canvas.getByRole('textbox', { name: 'Runs on' })).toBeInTheDocument()
  },
}

// Room above the first field for its help, which opens over the label, as a page's header
// would leave it.
const roomAbove: Decorator = (Story) => (
  <div style={{ paddingTop: 64 }}>
    <Story />
  </div>
)

/** Help behind the ? beside the label. The control reads it as its description, so the ? is
 *  hidden from assistive technology and Tab passes over it. Hovering the ? opens it. */
export const FrameWithHelp: StoryObj<FrameArgs> = {
  ...Frame,
  args: {
    ...Frame.args,
    description: '',
    help: 'The name other people see.\nIt cannot change later.',
    // Only the help beside the label, so nothing else there draws the eye from it.
    hint: false,
  } as FrameArgs,
  decorators: [roomAbove],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const box = canvas.getByRole('textbox', { name: /Cluster/ })
    await expect(box).toHaveAccessibleDescription(/cannot change later/)
    await expect(canvas.queryByRole('button', { name: /More info/ })).toBeNull()
  },
}

/** Tabbing to the control opens its help over the label, where it covers neither the control
 *  nor the field after it. Escape or leaving the field closes it; a click into the control
 *  doesn't open it. */
export const FrameWithHelpOnKeyboardFocus: StoryObj<FrameArgs> = {
  ...FrameWithHelp,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.tab()
    const box = canvas.getByRole('textbox', { name: /Cluster/ })
    await expect(box).toHaveFocus()
    await waitFor(() => expect(screen.getByRole('dialog')).toHaveTextContent(/cannot change later/))
  },
}

/** A link in the help keeps the ? in the Tab order, as the keyboard's way to the link. */
export const FrameWithHelpLink: StoryObj<FrameArgs> = {
  ...Frame,
  args: {
    ...Frame.args,
    layout: 'inline',
    help: 'Names the cluster in [the dashboard](https://example.com).\nIt cannot change later.',
    hint: false,
  } as FrameArgs,
  decorators: [roomAbove],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.tab()
    await expect(canvas.getByRole('button', { name: /More info/ })).toHaveFocus()
  },
}

export const FrameDisabled: StoryObj<FrameArgs> = {
  ...Frame,
  args: { ...Frame.args, disabled: true } as FrameArgs,
}

/** A secret's box shows what was typed only while its eye is pressed. */
export const Secret: StoryObj = {
  render: () => <Input label="Token" type="password" defaultValue="s3cret" className="max-w-sm" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const box = canvas.getByLabelText('Token')
    await expect(box).toHaveAttribute('type', 'password')
    await userEvent.click(canvas.getByRole('button', { name: 'Show value' }))
    await expect(box).toHaveAttribute('type', 'text')
  },
}

function CheckboxesDemo() {
  const [picked, setPicked] = useState(['east'])
  const all = picked.length === zones.length
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-4">
        <Checkbox aria-label="Unchecked" />
        <Checkbox aria-label="Checked" defaultChecked />
        <Checkbox aria-label="Some" indeterminate />
        <Checkbox aria-label="Disabled" disabled />
        <Checkbox aria-label="Disabled and checked" disabled defaultChecked />
        <Checkbox aria-label="Invalid" aria-invalid />
      </div>
      <Field label="Zones" group>
        <CheckboxGroup value={picked} onValueChange={setPicked} className="flex flex-col gap-1.5">
          <FieldOption className="flex items-center gap-2">
            <Checkbox
              checked={all}
              indeterminate={picked.length > 0 && !all}
              onCheckedChange={(on) => setPicked(on ? zones.map((zone) => zone.value) : [])}
            />
            All zones
          </FieldOption>
          {zones.map((zone) => (
            <FieldOption key={zone.value} className="flex items-center gap-2 pl-5">
              <Checkbox value={zone.value} />
              {zone.label}
            </FieldOption>
          ))}
        </CheckboxGroup>
      </Field>
    </div>
  )
}

/** One checkbox: checked, mixed, disabled and invalid, alone or as a group with a parent. */
export const Checkboxes: StoryObj = {
  render: () => <CheckboxesDemo />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const west = canvas.getByRole('checkbox', { name: 'West' })
    await userEvent.click(west)
    await expect(west).toBeChecked()
    await expect(canvas.getByRole('checkbox', { name: 'All zones' })).toHaveAttribute(
      'aria-checked',
      'mixed',
    )
  },
}

function SlidersDemo() {
  const [workers, setWorkers] = useState(8)
  const [share, setShare] = useState(0.4)
  return (
    <div className="flex max-w-sm flex-col gap-4">
      <Field label="Workers" layout="stacked">
        {(control) => (
          <div className="flex items-center gap-3">
            <NumberInput
              {...control}
              value={workers}
              min={1}
              max={64}
              onValueChange={(next) => setWorkers(next ?? 1)}
              className="w-28 shrink-0"
            />
            <Slider
              aria-label="Workers"
              value={workers}
              min={1}
              max={64}
              onValueChange={setWorkers}
            />
          </div>
        )}
      </Field>
      <Slider
        aria-label="Share"
        value={share}
        min={0}
        max={1}
        step={0.05}
        format={{ style: 'percent' }}
        onValueChange={setShare}
      />
      <Slider aria-label="Locked" value={3} min={0} max={10} onValueChange={() => {}} disabled />
    </div>
  )
}

/** One slider, often beside the number box that sets the same value. */
export const Sliders: StoryObj = {
  render: () => <SlidersDemo />,
}

function PlaceholdersDemo() {
  const [date, setDate] = useState('')
  const [picked, setPicked] = useState('2026-10-14')
  const heading = 'text-xs font-medium text-(--theme-muted-text-color)'
  return (
    <div className="flex max-w-2xl gap-6">
      <div className="flex flex-1 flex-col gap-3">
        <span className={heading}>Empty</span>
        <Input aria-label="Cluster name" placeholder="my-cluster" />
        <Select<string> aria-label="Zone" placeholder="Pick a zone" items={zones} />
        <Autocomplete aria-label="Region" placeholder="Pick a region" items={['east', 'west']} />
        <DatePicker aria-label="Start" value={date} onValueChange={setDate} />
        <Textarea aria-label="Notes" placeholder="What this cluster is for" rows={2} />
      </div>
      <div className="flex flex-1 flex-col gap-3">
        <span className={heading}>Filled</span>
        <Input aria-label="Cluster name, filled" defaultValue="my-cluster" />
        <Select<string> aria-label="Zone, filled" items={zones} defaultValue="east" />
        <Autocomplete aria-label="Region, filled" items={['east', 'west']} defaultValue="east" />
        <DatePicker aria-label="Start, filled" value={picked} onValueChange={setPicked} />
        <Textarea aria-label="Notes, filled" defaultValue="What this cluster is for" rows={2} />
      </div>
    </div>
  )
}

/** A placeholder is a hint, lighter than a typed value beside it, yet still readable: it takes
 *  the theme's placeholder color, which the theme solves to 3:1 on every surface it sits on. */
export const Placeholders: StoryObj = {
  render: () => <PlaceholdersDemo />,
}

interface DenseArgs {
  size: FieldBoxSize
}

function DenseDemo({ size }: DenseArgs) {
  const [query, setQuery] = useState('')
  const [date, setDate] = useState('')
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border border-(--theme-border) p-2">
      <SearchInput
        label="Filter runs"
        value={query}
        onValueChange={setQuery}
        size={size}
        className="w-48"
      />
      <Select<string>
        aria-label="Zone"
        placeholder="Zone"
        items={zones}
        size={size}
        className="w-28"
      />
      <Combobox<string>
        aria-label="Owner"
        placeholder="Owner"
        items={zones}
        size={size}
        className="w-36"
      />
      <DatePicker
        aria-label="Since"
        value={date}
        onValueChange={setDate}
        size={size}
        className="w-40"
      />
      <NumberInput aria-label="Limit" defaultValue={50} size={size} className="w-20" />
      <Input aria-label="Tag" placeholder="Tag" size={size} className="w-28" />
    </div>
  )
}

/** Every field control takes `size`, so a toolbar or a table cell keeps to `sm` with the rest of
 *  the kit; a width in `className` wins over the box's own `w-full`. */
export const Dense: StoryObj<DenseArgs> = {
  args: { size: 'sm' },
  argTypes: { size: { control: 'inline-radio', options: ['sm', 'md'] } },
  render: (args) => <DenseDemo {...args} />,
}

/** A compact control with a caption beside it: an inline, `compact`, `sm` Field. The caption
 *  names the control as any label does. */
export const Captions: StoryObj = {
  render: () => (
    <div className="flex flex-wrap items-center gap-4 rounded-md border border-(--theme-border) p-2">
      <Field label="Allocation" layout="inline" compact size="sm" className="w-auto">
        {(control) => (
          <Select<string>
            {...control}
            items={zones}
            defaultValue="east"
            size="sm"
            className="w-28 rounded-full"
          />
        )}
      </Field>
      <Field label="Limit" layout="inline" compact size="sm" className="w-auto">
        {(control) => <NumberInput {...control} defaultValue={50} size="sm" className="w-20" />}
      </Field>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('combobox', { name: 'Allocation' })).toHaveTextContent('East')
    await expect(canvas.getByRole('textbox', { name: 'Limit' })).toHaveValue('50')
  },
}

interface ReadOnlyArgs {
  layout: FieldLayout
  size: FieldBoxSize
}

function ReadOnlyDemo({ layout, size }: ReadOnlyArgs) {
  const [workers, setWorkers] = useState<number | null>(4)
  const [gpus, setGpus] = useState<number | null>(2)
  return (
    <div className="flex max-w-lg flex-col gap-4">
      <Field label="Workers" layout={layout} size={size}>
        {(control) => (
          <NumberInput
            {...control}
            value={workers}
            onValueChange={setWorkers}
            min={1}
            size={size}
          />
        )}
      </Field>
      <Field label="GPUs per worker" layout={layout} size={size}>
        {(control) => (
          <NumberInput {...control} value={gpus} onValueChange={setGpus} min={0} size={size} />
        )}
      </Field>
      <Field
        label="Allocation"
        description="Workers times GPUs per worker."
        layout={layout}
        size={size}
      >
        <FieldValue size={size} className="tabular-nums">
          {(workers ?? 0) * (gpus ?? 0)} GPUs
        </FieldValue>
      </Field>
    </div>
  )
}

const readOnly: StoryObj<ReadOnlyArgs> = {
  argTypes: {
    layout: { control: 'inline-radio', options: ['stacked', 'inline'] },
    size: { control: 'inline-radio', options: ['sm', 'md'] },
  },
  render: (args) => <ReadOnlyDemo {...args} />,
}

/** A value shown in a form but not edited, such as one worked out from the fields above it: the
 *  same label, as an `<output>` that reads out as it changes. */
export const ReadOnly: StoryObj<ReadOnlyArgs> = {
  ...readOnly,
  args: { layout: 'stacked', size: 'md' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('status', { name: 'Allocation' })).toHaveTextContent('8 GPUs')
    await userEvent.click(canvas.getAllByRole('button', { name: 'Increase' })[0] as HTMLElement)
    await expect(canvas.getByRole('status', { name: 'Allocation' })).toHaveTextContent('10 GPUs')
  },
}

export const ReadOnlyInline: StoryObj<ReadOnlyArgs> = {
  ...readOnly,
  args: { layout: 'inline', size: 'md' },
}

interface ColorArgs {
  size: FieldBoxSize
  disabled: boolean
  error: string
}

function ColorDemo({ size, disabled, error }: ColorArgs) {
  const [color, setColor] = useState('#1f6feb')
  return (
    <div className="flex max-w-xs flex-col gap-2">
      <ColorInput
        label="Brand color"
        description="The accent of buttons and links."
        value={color}
        onValueChange={setColor}
        size={size}
        disabled={disabled}
        error={error || undefined}
      />
    </div>
  )
}

/** A color as a swatch that opens the system picker beside its hex. A half-typed hex stays,
 *  marked, until it parses. */
export const Color: StoryObj<ColorArgs> = {
  args: { size: 'md', disabled: false, error: '' },
  argTypes: { size: { control: 'inline-radio', options: ['sm', 'md'] } },
  render: (args) => <ColorDemo {...args} />,
}

export const ColorTyping: StoryObj<ColorArgs> = {
  ...Color,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const box = canvas.getByRole('textbox', { name: 'Brand color' })
    await userEvent.clear(box)
    await userEvent.type(box, '#12')
    await expect(box).toHaveAttribute('aria-invalid', 'true')
    await expect(canvas.getByRole('alert')).toHaveTextContent('Enter a hex color')
  },
}

interface CodeArgs {
  length: number
  size: FieldBoxSize
  disabled: boolean
  autoFocus: boolean
  error: string
}

const oneTimeCode: StoryObj<CodeArgs> = {
  args: { length: 6, size: 'md', disabled: false, error: '', autoFocus: false },
  argTypes: {
    length: { control: { type: 'number', min: 4, max: 8 } },
    size: { control: 'inline-radio', options: ['sm', 'md'] },
  },
  render: ({ length, size, disabled, error, autoFocus }) => (
    <Field
      label="Verification code"
      description="From your authenticator app."
      error={error || undefined}
      disabled={disabled}
    >
      {(control) => (
        <OneTimeCodeInput
          {...control}
          length={length}
          size={size}
          disabled={disabled}
          autoFocus={autoFocus}
        />
      )}
    </Field>
  ),
}

/** A one-time code typed a character to a box. It fills from code autofill and from a paste of
 *  the whole code, and Backspace steps back across the boxes. */
export const OneTimeCode: StoryObj<CodeArgs> = {
  ...oneTimeCode,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const [first] = canvas.getAllByRole('textbox')
    await userEvent.click(first as HTMLElement)
    await userEvent.paste('123456')
    await expect(canvas.getByRole('textbox', { name: 'Character 6 of 6' })).toHaveValue('6')
  },
}

export const OneTimeCodeInvalid: StoryObj<CodeArgs> = {
  ...oneTimeCode,
  args: { ...oneTimeCode.args, error: 'That code has expired. Request a new one.' } as CodeArgs,
}

function ErrorBesideDemo() {
  const [name, setName] = useState('main')
  const taken = name === 'main'
  return (
    <div className="flex max-w-sm flex-col gap-1">
      <div className="flex items-center gap-2">
        <Input
          aria-label="Branch"
          size="sm"
          value={name}
          onChange={(e) => setName(e.target.value)}
          aria-invalid={taken || undefined}
          aria-describedby={taken ? 'branch-error' : undefined}
          className="w-40"
        />
        <span className="text-xs text-(--theme-muted-text-color)">in a table cell</span>
      </div>
      <ErrorText id="branch-error">{taken && 'A branch with this name already exists.'}</ErrorText>
    </div>
  )
}

/** A Field's error look for a control that isn't in a Field, such as a cell of a table. */
export const ErrorBeside: StoryObj = {
  render: () => <ErrorBesideDemo />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('textbox', { name: 'Branch' })).toHaveAccessibleDescription(
      'A branch with this name already exists.',
    )
  },
}
