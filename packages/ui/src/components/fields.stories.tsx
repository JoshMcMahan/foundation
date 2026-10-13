import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, userEvent, within } from 'storybook/test'
import { ExpressionIcon } from '../icons'
import { Checkbox, CheckboxGroup } from './Checkbox'
import { Autocomplete } from './Combobox'
import { DatePicker } from './DatePicker'
import { Field, type FieldLayout, FieldOption } from './Field'
import { fieldBox } from './fieldBox'
import { IconButton } from './IconButton'
import { Input, Textarea } from './Input'
import { NumberInput } from './NumberInput'
import { Radio, RadioGroup } from './Radio'
import { SegmentedControl } from './SegmentedControl'
import { Select } from './Select'
import { Slider } from './Slider'

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
  size: 'sm' | 'md'
  invalid: boolean
  disabled: boolean
}

function Boxes({ size, invalid, disabled }: BoxArgs) {
  const [date, setDate] = useState('')
  return (
    <div className="flex max-w-sm flex-col gap-3">
      <input
        aria-label="Plain"
        placeholder="A native input with fieldBox()"
        aria-invalid={invalid || undefined}
        disabled={disabled}
        className={fieldBox({ size })}
      />
      <Select<string>
        aria-label="Zone"
        placeholder="Zone"
        items={zones}
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
        aria-invalid={invalid}
        disabled={disabled}
      />
      <DatePicker
        aria-label="Start"
        value={date}
        onValueChange={setDate}
        aria-invalid={invalid}
        disabled={disabled}
      />
      <Textarea
        aria-label="Notes"
        placeholder="Notes"
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
  required: boolean
  disabled: boolean
  error: string
  description: string
}

/** One frame names, describes and flags any control: the label, its hint, a description and an error. */
export const Frame: StoryObj<FrameArgs> = {
  args: {
    layout: 'stacked',
    required: true,
    disabled: false,
    error: '',
    description: 'Letters, numbers and dashes.',
  },
  argTypes: { layout: { control: 'inline-radio', options: ['stacked', 'inline'] } },
  render: ({ layout, required, disabled, error, description }) => (
    <div className="flex max-w-lg flex-col gap-4">
      <Field
        label="Cluster"
        hint={<code className="text-xs theme-muted-text">cluster</code>}
        description={description || undefined}
        error={error || undefined}
        required={required}
        disabled={disabled}
        layout={layout}
      >
        {(control) => <input {...control} disabled={disabled} className={fieldBox()} />}
      </Field>
      <Field label="Zone" required={required} disabled={disabled} layout={layout}>
        {(control) => (
          <Select<string> {...control} placeholder="Zone" items={zones} disabled={disabled} />
        )}
      </Field>
      <Field label="Precision" group required={required} disabled={disabled} layout={layout}>
        {(control) => (
          <RadioGroup {...control} defaultValue="fp16" className="flex gap-x-5 py-2 text-sm">
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
