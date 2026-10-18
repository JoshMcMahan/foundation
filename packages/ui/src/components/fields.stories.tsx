import type { Decorator, Meta, StoryObj } from '@storybook/react-vite'
import { useLayoutEffect, useRef, useState } from 'react'
import { expect, screen, userEvent, waitFor, within } from 'storybook/test'
import { cx } from '../cx'
import { ExpressionIcon, UndoIcon } from '../icons'
import { overlaps } from '../test/stacking'
import { applyTheme, generateTheme, THEME_TOKENS } from '../theme'
import { Checkbox, CheckboxGroup } from './Checkbox'
import { ColorInput } from './ColorInput'
import { Autocomplete, Combobox } from './Combobox'
import { DatePicker } from './DatePicker'
import { ErrorText, Field, type FieldLayout, FieldOption, FieldValue } from './Field'
import { type FieldBoxSize, fieldBox } from './fieldBox'
import { IconButton } from './IconButton'
import { Input, Textarea } from './Input'
import { Modal } from './Modal'
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

/** On a phone a 208px label column would leave the control a sliver, so an inline field stacks
 *  its label above the control, as `stacked` does. */
export const FrameInlineOnPhone: StoryObj<FrameArgs> = {
  ...FrameInline,
  globals: { viewport: { value: 'mobile1', isRotated: false } },
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

// Room above the first field for its help, which opens over the ? when it is hovered, as a
// page's header would leave it.
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

/** Tabbing to the control opens its help beside it, where it covers neither the control nor the
 *  field above it. Escape or leaving the field closes it; a click into the control doesn't open
 *  it. */
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

function HelpForm() {
  return (
    <div className="flex w-full max-w-md flex-col gap-4">
      <Field label="Cluster" required help={'The name other people see.\nIt cannot change later.'}>
        <Input defaultValue="training-a" />
      </Field>
      <Field label="Zone" help="The nearest zone is the fastest to reach.">
        <Select<string> placeholder="Zone" items={zones} />
      </Field>
      <Field label="Workers" help="How many machines run the job at once.">
        <Input defaultValue="4" inputMode="numeric" />
      </Field>
    </div>
  )
}

/** Tabbing down a form opens each field's help beside its control, so the field above, and
 *  the help itself, stay in view. */
export const HelpInStackedForm: StoryObj = {
  render: () => <HelpForm />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.tab()
    await userEvent.tab()
    const zone = canvas.getByRole('combobox', { name: 'Zone' })
    await expect(zone).toHaveFocus()
    const tip = await waitFor(() => {
      const open = screen.getByRole('dialog')
      expect(open).toHaveTextContent(/nearest zone/)
      return open
    })
    const above = canvas.getByRole('textbox', { name: /Cluster/ })
    await expect(overlaps(tip.getBoundingClientRect(), above.getBoundingClientRect())).toBe(false)
    await expect(overlaps(tip.getBoundingClientRect(), zone.getBoundingClientRect())).toBe(false)
  },
}

/** The first field in a dialog: its help opens beside it, never over the dialog's title. */
export const HelpOnFirstFieldInDialog: StoryObj = {
  render: () => (
    <Modal open onClose={() => {}} title="Create a cluster">
      <HelpForm />
    </Modal>
  ),
  play: async () => {
    const title = await screen.findByRole('heading', { name: 'Create a cluster' })
    const cluster = screen.getByRole('textbox', { name: /Cluster/ })
    // Focus that follows a key, as Tab's does, rather than the dialog's own as it opens.
    cluster.blur()
    await userEvent.keyboard('{Shift}')
    cluster.focus()
    await expect(cluster).toHaveFocus()
    const tip = await waitFor(() => {
      // The help's own popup, not the dialog around the field, whose hidden description holds
      // the same words.
      const open = screen
        .getAllByRole('dialog')
        .find((d) => !d.contains(title) && /other people/.test(d.textContent ?? ''))
      expect(open).toBeDefined()
      return open as HTMLElement
    })
    await expect(overlaps(tip.getBoundingClientRect(), title.getBoundingClientRect())).toBe(false)
  },
}

/** On a phone there is no room beside the control, so the help opens under it, over the field
 *  Tab reaches next, rather than over the field or title above. */
export const HelpOnPhone: StoryObj = {
  ...HelpInStackedForm,
  globals: { viewport: { value: 'mobile1', isRotated: false } },
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

interface ControlFirstArgs {
  layout: FieldLayout
  size: FieldBoxSize
  /** Off shows the label-first frame a checkbox had before, label then ? then box. */
  controlFirst: boolean
  help: string
  /** Text after the switch's label and outside its name, such as the name of its state. */
  hint: string
  description: string
  error: string
  disabled: boolean
  /** A label long enough to wrap, which the control stays on the first line of. */
  longLabel: boolean
}

/** A checkbox or a switch reads control first: the control, its label and ?, then the
 *  description and error under the label, lined up with its text. A click on the label sets
 *  the control. Inline, it sits in the control column under an empty label column. */
export const ControlFirst: StoryObj<ControlFirstArgs> = {
  args: {
    layout: 'stacked',
    size: 'md',
    controlFirst: true,
    help: 'Finished runs move to the archive after 30 days.',
    hint: '',
    description: 'Archived runs keep their logs.',
    error: '',
    disabled: false,
    longLabel: false,
  },
  argTypes: {
    layout: { control: 'inline-radio', options: ['stacked', 'inline'] },
    size: { control: 'inline-radio', options: ['sm', 'md'] },
  },
  decorators: [roomAbove],
  render: ({ layout, size, controlFirst, help, hint, description, error, disabled, longLabel }) => (
    <div className={cx('flex flex-col gap-4', longLabel ? 'max-w-sm' : 'max-w-lg')}>
      <Field label="Cluster" layout={layout} size={size} disabled={disabled}>
        <Input defaultValue="training-a" size={size} disabled={disabled} />
      </Field>
      <Field
        label={
          longLabel
            ? 'Archive finished runs automatically, along with their outputs and logs, once they are a month old'
            : 'Archive finished runs'
        }
        controlFirst={controlFirst}
        help={help || undefined}
        description={description || undefined}
        error={error || undefined}
        disabled={disabled}
        layout={layout}
        size={size}
      >
        <Checkbox defaultChecked disabled={disabled} />
      </Field>
      <Field
        label="Monitoring"
        controlFirst={controlFirst}
        help={help ? 'Collects usage every minute.' : undefined}
        hint={
          hint ? (
            <span className="font-normal text-(--theme-muted-text-color)">{hint}</span>
          ) : undefined
        }
        disabled={disabled}
        layout={layout}
        size={size}
      >
        <Switch size={size} defaultChecked disabled={disabled} />
      </Field>
      <Field
        label="Email me when a run fails"
        controlFirst={controlFirst}
        disabled={disabled}
        layout={layout}
        size={size}
      >
        <Checkbox disabled={disabled} />
      </Field>
    </div>
  ),
}

/** A click on the label sets the control, as a click on the control would. */
export const ControlFirstLabelToggles: StoryObj<ControlFirstArgs> = {
  ...ControlFirst,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const box = canvas.getByRole('checkbox', { name: /Archive finished runs/ })
    await expect(box).toHaveAttribute('aria-checked', 'true')
    await expect(box).toHaveAccessibleDescription(/keep their logs.*after 30 days/)
    await userEvent.click(canvas.getByText('Archive finished runs'))
    await expect(box).toHaveAttribute('aria-checked', 'false')
    const monitoring = canvas.getByRole('switch', { name: 'Monitoring' })
    await userEvent.click(canvas.getByText('Monitoring'))
    await expect(monitoring).toHaveAttribute('aria-checked', 'false')
  },
}

/** Side by side, as a settings form: the label column stays empty, and the control and its
 *  label sit in the control column, on the line of the labels beside it. */
export const ControlFirstInline: StoryObj<ControlFirstArgs> = {
  ...ControlFirst,
  args: { ...ControlFirst.args, layout: 'inline' } as ControlFirstArgs,
}

/** Before: a checkbox in a label-first frame reads label, ?, then box. */
export const ControlFirstOff: StoryObj<ControlFirstArgs> = {
  ...ControlFirst,
  args: { ...ControlFirst.args, controlFirst: false } as ControlFirstArgs,
}

/** A hint, here the name of the switch's state, follows the label and its ? on the label's
 *  baseline, outside the switch's name. */
export const ControlFirstWithHint: StoryObj<ControlFirstArgs> = {
  ...ControlFirst,
  args: { ...ControlFirst.args, hint: 'Every minute' } as ControlFirstArgs,
}

export const ControlFirstWithoutHelp: StoryObj<ControlFirstArgs> = {
  ...ControlFirst,
  args: { ...ControlFirst.args, help: '', description: '' } as ControlFirstArgs,
}

/** A long label wraps beside the control, which stays on its first line; the ? follows the
 *  last word. */
export const ControlFirstLongLabel: StoryObj<ControlFirstArgs> = {
  ...ControlFirst,
  args: { ...ControlFirst.args, longLabel: true } as ControlFirstArgs,
}

export const ControlFirstLongLabelInline: StoryObj<ControlFirstArgs> = {
  ...ControlFirst,
  args: { ...ControlFirst.args, longLabel: true, layout: 'inline' } as ControlFirstArgs,
}

export const ControlFirstWithError: StoryObj<ControlFirstArgs> = {
  ...ControlFirst,
  args: {
    ...ControlFirst.args,
    error: 'Archiving is off for this workspace.',
  } as ControlFirstArgs,
  play: async ({ canvasElement }) => {
    const box = within(canvasElement).getByRole('checkbox', { name: /Archive finished runs/ })
    await expect(box).toHaveAttribute('aria-invalid', 'true')
    await expect(box).toHaveAccessibleDescription(/Archiving is off/)
  },
}

export const ControlFirstDisabled: StoryObj<ControlFirstArgs> = {
  ...ControlFirst,
  args: { ...ControlFirst.args, disabled: true } as ControlFirstArgs,
}

export const ControlFirstSmallInline: StoryObj<ControlFirstArgs> = {
  ...ControlFirst,
  args: { ...ControlFirst.args, size: 'sm', layout: 'inline' } as ControlFirstArgs,
}

/** Tabbing to the checkbox opens its help beside the row, over nothing the row needs. */
export const ControlFirstHelpOnKeyboardFocus: StoryObj<ControlFirstArgs> = {
  ...ControlFirst,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.tab()
    await userEvent.tab()
    await expect(canvas.getByRole('checkbox', { name: /Archive finished runs/ })).toHaveFocus()
    await waitFor(() => expect(screen.getByRole('dialog')).toHaveTextContent(/after 30 days/))
  },
}

interface SwitchCenteringArgs {
  layout: FieldLayout
  size: FieldBoxSize
}

/** The center of a line box, from the first or a later rectangle of an element's text, which is
 *  as far from the line's top as from its bottom. */
function lineOf(element: Element, index = 0) {
  const range = document.createRange()
  range.selectNodeContents(element)
  const rect = range.getClientRects()[index]
  if (!rect) {
    throw new Error(`no line ${index} in ${element.textContent}`)
  }
  const height = Number.parseFloat(getComputedStyle(element).lineHeight)
  const center = rect.top + rect.height / 2
  return { top: center - height / 2, bottom: center + height / 2 }
}

/** Where a control's middle sits, and the middle of the text lines it should center on: the
 *  label's first line, its first two lines, or the label's line and the description's first. */
function centers(canvasElement: HTMLElement, role: 'switch' | 'checkbox', name: string | RegExp) {
  const control = within(canvasElement).getByRole(role, { name })
  const labelledBy = control.getAttribute('aria-labelledby')
  const label = labelledBy ? document.getElementById(labelledBy) : null
  const describedBy = control.getAttribute('aria-describedby')?.split(' ') ?? []
  const descriptionId = describedBy.find((id) => id.endsWith('description'))
  const description = descriptionId ? document.getElementById(descriptionId) : null
  if (!label) {
    throw new Error(`no label for ${name}`)
  }
  const box = control.getBoundingClientRect()
  const middle = (a: { top: number }, b: { bottom: number }) => (a.top + b.bottom) / 2
  const first = lineOf(label)
  return {
    control: box.top + box.height / 2,
    firstLine: middle(first, first),
    twoLabelLines: () => middle(first, lineOf(label, 1)),
    labelAndDescription: () => {
      if (!description) {
        throw new Error(`no description for ${name}`)
      }
      return middle(first, lineOf(description))
    },
  }
}

/** A switch centers on its text's first two lines: the label alone, the label and a one-line
 *  description, a label that wraps, and a description of several lines, where it stays on the
 *  label and the description's first line. A checkbox keeps to its label's first line. */
export const ControlFirstSwitchCentering: StoryObj<SwitchCenteringArgs> = {
  args: { layout: 'stacked', size: 'md' },
  argTypes: {
    layout: { control: 'inline-radio', options: ['stacked', 'inline'] },
    size: { control: 'inline-radio', options: ['sm', 'md'] },
  },
  render: ({ layout, size }) => (
    <div className={cx('flex flex-col gap-4', layout === 'inline' ? 'max-w-2xl' : 'max-w-sm')}>
      <Field label="Monitoring" controlFirst layout={layout} size={size}>
        <Switch size={size} defaultChecked />
      </Field>
      <Field
        label="Keep scratch files"
        description="Kept files count toward the project quota."
        controlFirst
        layout={layout}
        size={size}
      >
        <Switch size={size} />
      </Field>
      <Field
        label="Archive finished runs automatically, with their outputs and logs, after a month"
        controlFirst
        layout={layout}
        size={size}
      >
        <Switch size={size} defaultChecked />
      </Field>
      <Field
        label="Cache images"
        description="Nodes keep the images their runs pull, so the next run on the node starts sooner. A cached image counts toward the node's disk, and the oldest ones are removed when it fills."
        controlFirst
        layout={layout}
        size={size}
      >
        <Switch size={size} defaultChecked />
      </Field>
      <Field
        label="I agree to the terms of use"
        description="The terms cover every run in this workspace."
        controlFirst
        layout={layout}
        size={size}
      >
        <Checkbox />
      </Field>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const near = async (actual: number, expected: number) =>
      expect(Math.abs(actual - expected)).toBeLessThanOrEqual(1)
    const alone = centers(canvasElement, 'switch', 'Monitoring')
    await near(alone.control, alone.firstLine)
    const described = centers(canvasElement, 'switch', 'Keep scratch files')
    const onTwo = described.labelAndDescription()
    await near(described.control, onTwo)
    const wrapped = centers(canvasElement, 'switch', /Archive finished runs/)
    await near(wrapped.control, wrapped.twoLabelLines())
    // Under several lines it stays where it is beside a one-line description, measured from the
    // top of its own row.
    const long = centers(canvasElement, 'switch', 'Cache images')
    await near(long.control, long.labelAndDescription())
    await near(long.control - long.firstLine, described.control - described.firstLine)
    const checkbox = centers(canvasElement, 'checkbox', 'I agree to the terms of use')
    await near(checkbox.control, checkbox.firstLine)
  },
}

/** The same at the small size, whose label and description lines are both 16px. */
export const ControlFirstSwitchCenteringSmall: StoryObj<SwitchCenteringArgs> = {
  ...ControlFirstSwitchCentering,
  args: { layout: 'stacked', size: 'sm' },
}

/** Inline, in the control column under an empty label column. */
export const ControlFirstSwitchCenteringInline: StoryObj<SwitchCenteringArgs> = {
  ...ControlFirstSwitchCentering,
  args: { layout: 'inline', size: 'md' },
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

function EdgesColumn({ title, className }: { title: string; className?: string }) {
  const [level, setLevel] = useState(40)
  const row = 'flex items-center gap-3'
  const name = 'w-16 text-xs text-(--theme-muted-text-color)'
  return (
    <div className={cx('flex w-72 flex-col gap-3 rounded-lg p-4', className)}>
      <span className="text-xs font-medium text-(--theme-muted-text-color)">{title}</span>
      <div className={row}>
        <span className={name}>Checkbox</span>
        <Checkbox aria-label={`${title}: off`} />
        <Checkbox aria-label={`${title}: on`} defaultChecked />
        <Checkbox aria-label={`${title}: off, disabled`} disabled />
        <Checkbox aria-label={`${title}: on, disabled`} disabled defaultChecked />
      </div>
      <RadioGroup aria-label={`${title}: radios`} defaultValue="on" className={row}>
        <span className={name}>Radio</span>
        <Radio value="off" aria-label="Off" />
        <Radio value="on" aria-label="On" />
        <Radio value="off-disabled" aria-label="Off, disabled" disabled />
      </RadioGroup>
      <div className={row}>
        <span className={name}>Switch</span>
        <Switch aria-label={`${title}: switch off`} />
        <Switch aria-label={`${title}: switch on`} defaultChecked />
        <Switch aria-label={`${title}: switch disabled`} disabled />
      </div>
      <Input aria-label={`${title}: name`} placeholder="Name" />
      <Select<string> aria-label={`${title}: zone`} placeholder="Zone" items={zones} />
      <Slider
        aria-label={`${title}: level`}
        value={level}
        min={0}
        max={100}
        onValueChange={setLevel}
      />
    </div>
  )
}

interface EdgesArgs {
  /** An accent to try in place of the theme's, such as one too pale to show on the page. */
  accent: string
}

function EdgesDemo({ accent }: EdgesArgs) {
  const ref = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) {
      return
    }
    for (const token of THEME_TOKENS) {
      el.style.removeProperty(token)
    }
    if (!accent) {
      return
    }
    // The page's own base, with only the accent swapped; white where no theme is applied.
    const base = getComputedStyle(document.documentElement).getPropertyValue('--theme-app-bg')
    applyTheme(el, generateTheme({ interface: { base: base.trim() || '#ffffff', accent } }))
  }, [accent])
  return (
    <div ref={ref} className="flex flex-wrap gap-4 bg-(--theme-app-bg) p-2 text-(--theme-app)">
      <EdgesColumn title="On the page" />
      <EdgesColumn title="On a panel" className="bg-(--theme-panel-bg) shadow-sm" />
      <EdgesColumn title="On a muted panel" className="bg-(--theme-muted-panel-bg)" />
    </div>
  )
}

/** The edge or track of a checkbox, radio, switch or slider holds WCAG 1.4.11's 3:1 against the
 *  surfaces it sits on, in each state, so an empty box or an off switch still shows where it is.
 *  A checked control's edge holds it too, even under an accent too pale to show on the page. A
 *  text field's edge rests quieter until pointed at; see `FormEdges`. */
export const ControlEdges: StoryObj<EdgesArgs> = {
  args: { accent: '' },
  argTypes: {
    accent: {
      control: 'select',
      options: ['', '#fafafa', '#ffeb3b', '#c4a7e7'],
      labels: {
        '': 'The theme’s',
        '#fafafa': 'Near white',
        '#ffeb3b': 'Yellow',
        '#c4a7e7': 'Lavender',
      },
    },
  },
  render: (args) => <EdgesDemo {...args} />,
}

/** Under an accent too pale to show on a light page, a checked control keeps its edge. */
export const ControlEdgesPaleAccent: StoryObj<EdgesArgs> = {
  ...ControlEdges,
  args: { accent: '#fafafa' },
}

interface FormEdgesArgs {
  /** The theme's contrast, from 0 to 100, on the page's own base and accent. */
  contrast: number
}

function FormEdgesDemo({ contrast }: FormEdgesArgs) {
  const ref = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) {
      return
    }
    const page = getComputedStyle(document.documentElement)
    const base = page.getPropertyValue('--theme-app-bg').trim() || '#ffffff'
    const accent = page.getPropertyValue('--theme-accent').trim() || '#0d6efd'
    applyTheme(el, generateTheme({ interface: { base, accent, contrast } }))
  }, [contrast])
  const form = (
    <div className="flex w-80 flex-col gap-4">
      <Field label="Name" description="Letters, numbers and dashes.">
        <Input placeholder="my-cluster" />
      </Field>
      <Field label="Owner">
        <Input defaultValue="Ada Lovelace" />
      </Field>
      <Field label="Zone">
        <Select<string> placeholder="Zone" items={zones} />
      </Field>
      <Field label="Notes">
        <Textarea placeholder="What it is for" rows={3} />
      </Field>
      <Field label="Zones" group>
        <CheckboxGroup defaultValue={['east']} className="flex gap-4">
          {zones.map((zone) => (
            <FieldOption key={zone.value} className="flex items-center gap-2 text-sm">
              <Checkbox value={zone.value} />
              {zone.label}
            </FieldOption>
          ))}
        </CheckboxGroup>
      </Field>
      <Field label="Monitoring">
        <Switch />
      </Field>
      <Field label="Alerts">
        <Switch defaultChecked />
      </Field>
    </div>
  )
  return (
    <div ref={ref} className="flex flex-wrap gap-4 bg-(--theme-app-bg) p-2 text-(--theme-app)">
      <div className="p-4">{form}</div>
      <div className="rounded-lg bg-(--theme-panel-bg) p-4 shadow-sm">{form}</div>
    </div>
  )
}

/** A form of fields rests on a quieter edge than a checkbox or an off switch: a field is also
 *  found by its label, size and text, while a checkbox's edge is all that shows it. Pointing at
 *  a field raises its edge to the control's 3:1, and at contrast 100 the resting edge reaches
 *  3:1 too. */
export const FormEdges: StoryObj<FormEdgesArgs> = {
  args: { contrast: 30 },
  argTypes: { contrast: { control: { type: 'range', min: 0, max: 100, step: 10 } } },
  render: (args) => <FormEdgesDemo {...args} />,
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
  actions: boolean
}

function ColorDemo({ size, disabled, error, actions }: ColorArgs) {
  const [color, setColor] = useState('#1f6feb')
  return (
    <div className="flex max-w-xs flex-col gap-2">
      <ColorInput
        label="Brand color"
        description="The accent of buttons and links."
        actions={
          actions && (
            <IconButton
              icon={<UndoIcon />}
              label="Reset to default"
              disabled={disabled}
              onClick={() => setColor('#1f6feb')}
            />
          )
        }
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
  args: { size: 'md', disabled: false, error: '', actions: false },
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
