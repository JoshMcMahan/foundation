// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import * as parser from '@parallelworks/workflow-parser'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

// The dialog calls useWorkflowEngine(), which throws outside a UIProvider carrying one.
vi.mock('../components/Provider', async (importOriginal) =>
  (await import('../test/engine')).mockEngineHooks(importOriginal),
)

vi.mock('@parallelworks/workflow-parser', async () => ({
  ...(await vi.importActual<typeof import('@parallelworks/workflow-parser')>(
    '@parallelworks/workflow-parser',
  )),
  parseStringsOfObj: vi.fn(({ obj }: { obj: unknown }) => obj),
  parseStringsOfObjReady: true,
  callWhenParserInitialized: vi.fn((cb: (ready: boolean) => void) => {
    cb(true)
    return () => {}
  }),
  initializeParseStringsOfObj: vi.fn(() => Promise.resolve()),
}))

// Monaco can't run in jsdom; a textarea stands in, labelled by the model path.
vi.mock('../editor/Monaco', () => ({
  default: ({
    value,
    onChange,
    path,
  }: {
    value?: string
    onChange?: (value: string) => void
    path?: string
  }) => <textarea aria-label={path} value={value} onChange={(e) => onChange?.(e.target.value)} />,
}))
vi.mock('../components/Dropdown', () => import('../test/DropdownStandIn'))

import { suggestionsOf } from '../test/DropdownStandIn'
import { INPUTS_EDITOR_STRINGS } from './editorStrings'
import { InputDialog, inputTypes, offeredInputKeys } from './InputDialog'

afterEach(cleanup)

describe('InputDialog', () => {
  function open(
    definition: Record<string, unknown>,
    options: {
      isNew?: boolean
      siblings?: string[]
      inputs?: Record<string, unknown>
    } = {},
  ) {
    const onSave = vi.fn()
    render(
      <InputDialog
        name="field"
        definition={definition}
        isNew={options.isNew ?? false}
        siblings={options.siblings ?? []}
        allowStep
        inputs={options.inputs}
        onSave={onSave}
        onClose={() => {}}
      />,
    )
    return onSave
  }

  // Like the job and step dialogs: a section starts open only when it holds something.
  it('opens only the sections that hold something', () => {
    const openSections = () =>
      [...document.querySelectorAll('details')]
        .filter((section) => section.open)
        .map((section) => section.querySelector('summary')?.textContent)
    open({ type: 'string' })
    expect(openSections()).toEqual([])
    cleanup()
    open({ type: 'string', label: 'Dataset', optional: true })
    expect(openSections()).toEqual(['Field', 'Behavior'])
    cleanup()
    // A dropdown can't do without its options, so its settings start open.
    open({ type: 'dropdown', options: ['a'] })
    expect(openSections()).toEqual(['Settings'])
    cleanup()
    open({ type: 'string' }, { isNew: true })
    expect(openSections()).toEqual(['Field'])
    // Nothing folds or unfolds on its own later, except to show a problem that blocks Save.
    fireEvent.change(screen.getByLabelText('Type'), {
      target: { value: 'zone' },
    })
    expect(openSections()).toEqual(['Field', 'Settings'])
  })

  it('takes an expression in number and duration settings', () => {
    let onSave = open({ type: 'number' })
    fireEvent.change(screen.getByLabelText('Minimum'), {
      target: { value: '${{ inputs.low }}' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(onSave).toHaveBeenCalledWith(
      'field',
      { type: 'number', min: '${{ inputs.low }}' },
      expect.anything(),
      [],
    )
    cleanup()
    onSave = open({ type: 'duration' })
    fireEvent.change(screen.getByLabelText('Default'), {
      target: { value: '${{ inputs.limit }}' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(onSave).toHaveBeenCalledWith(
      'field',
      { type: 'duration', default: '${{ inputs.limit }}' },
      expect.anything(),
      [],
    )
  })

  it('switches options and a hidden flag to expressions from the form', () => {
    const onSave = open({ type: 'dropdown', options: ['a'] })
    const toggles = () => screen.getAllByRole('button', { name: 'Use an expression instead' })
    // The options' switch comes first, then the flags in Behavior.
    fireEvent.click(toggles()[0] as HTMLElement)
    fireEvent.change(screen.getByLabelText('Options'), {
      target: { value: '${{ inputs.choices }}' },
    })
    const hidden = screen.getByText('Hidden', { selector: 'span' }).parentElement?.parentElement
      ?.parentElement as HTMLElement
    fireEvent.click(within(hidden).getByRole('button', { name: 'Use an expression instead' }))
    fireEvent.change(screen.getByLabelText('Hidden'), {
      target: { value: '${{ inputs.simple }}' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(onSave).toHaveBeenCalledWith(
      'field',
      {
        type: 'dropdown',
        options: '${{ inputs.choices }}',
        hidden: '${{ inputs.simple }}',
      },
      expect.anything(),
      [],
    )
  })

  it('links options so ticking one ticks others', () => {
    const onSave = open({
      type: 'checkbox-group',
      options: ['logs', 'checkpoints', 'all'],
    })
    const row = screen.getByText('all also ticks').parentElement as HTMLElement
    fireEvent.click(within(row).getByRole('button', { name: 'logs' }))
    fireEvent.click(within(row).getByRole('button', { name: 'checkpoints' }))
    expect(within(row).getByRole('button', { name: 'logs' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(onSave).toHaveBeenCalledWith(
      'field',
      expect.objectContaining({ implies: { all: ['logs', 'checkpoints'] } }),
      expect.anything(),
      [],
    )
  })

  it('describes every setting of the type', () => {
    open({ type: 'number' })
    const help = INPUTS_EDITOR_STRINGS.help
    for (const text of [
      help.name,
      help.label,
      help.description,
      help.tooltip,
      help.default,
      help.minNumber,
      help.maxNumber,
      help.step,
      help.slider,
      help.optional,
      help.hidden,
      help.disabled,
      help.ignore,
      INPUTS_EDITOR_STRINGS.typeHelp.number,
    ]) {
      expect(screen.getByText(text)).toBeInTheDocument()
    }
  })

  it('keeps untouched values exactly and saves only what changed', () => {
    const onSave = open({ type: 'number', default: 5, label: 'Count' })
    fireEvent.change(screen.getByLabelText('Minimum'), {
      target: { value: '1' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(onSave).toHaveBeenCalledWith(
      'field',
      { type: 'number', label: 'Count', default: 5, min: 1 },
      { set: { min: 1 }, unset: [] },
      [],
    )
  })

  it('drops settings the new type does not take', () => {
    const onSave = open({ type: 'string', placeholder: 'Name', label: 'X' })
    fireEvent.change(screen.getByLabelText('Type'), {
      target: { value: 'number' },
    })
    expect(screen.getByText(INPUTS_EDITOR_STRINGS.typeChangeNote)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(onSave).toHaveBeenCalledWith(
      'field',
      { type: 'number', label: 'X' },
      { set: { type: 'number' }, unset: ['placeholder'] },
      [],
    )
  })

  it('edits dropdown options as value and label rows', () => {
    const onSave = open({
      type: 'dropdown',
      options: [{ value: 'a', label: 'A' }, 'b'],
    })
    // The input's own Label comes first, then each option's.
    const labels = screen.getAllByLabelText('Label')
    fireEvent.change(labels.at(-1) as HTMLElement, { target: { value: 'B' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(onSave).toHaveBeenCalledWith(
      'field',
      {
        type: 'dropdown',
        options: [
          { value: 'a', label: 'A' },
          { value: 'b', label: 'B' },
        ],
      },
      {
        set: {
          options: [
            { value: 'a', label: 'A' },
            { value: 'b', label: 'B' },
          ],
        },
        unset: [],
      },
      [],
    )
  })

  it('requires what the schema requires before a new input saves', () => {
    const onSave = open({ type: 'header', text: '' }, { isNew: true })
    const save = screen.getByRole('button', { name: 'Save' })
    expect(save).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Text'), {
      target: { value: 'Cluster' },
    })
    fireEvent.click(save)
    expect(onSave).toHaveBeenCalledWith(
      'field',
      { type: 'header', text: 'Cluster' },
      { set: { type: 'header', text: 'Cluster' }, unset: [] },
      [],
    )
  })

  it('refuses a name already used next to it', () => {
    open({ type: 'string' }, { siblings: ['taken'] })
    fireEvent.change(screen.getByLabelText('Name'), {
      target: { value: 'taken' },
    })
    expect(screen.getByText(INPUTS_EDITOR_STRINGS.inputExists)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
  })

  it('keeps a dropdown to one of the schema’s two variants', () => {
    const onSave = open(
      {
        type: 'dropdown',
        options: [{ value: 'a', label: 'A' }],
        placeholder: 'Pick',
      },
      { inputs: { k: { type: 'dropdown', options: ['x'] } } },
    )
    expect(screen.getByLabelText('Hint text')).toBeInTheDocument()
    expect(screen.queryByLabelText('Options depend on')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Per value of another input' }))
    fireEvent.change(screen.getByLabelText('Options'), {
      target: { value: '{"x": ["a"]}' },
    })
    expect(screen.queryByLabelText('Hint text')).toBeNull()
    const save = screen.getByRole('button', { name: 'Save' })
    expect(save).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Options depend on'), {
      target: { value: '${{ inputs.k }}' },
    })
    fireEvent.click(save)
    expect(onSave).toHaveBeenCalledWith(
      'field',
      {
        type: 'dropdown',
        options: { x: ['a'] },
        'option-key': '${{ inputs.k }}',
      },
      {
        set: { options: { x: ['a'] }, 'option-key': '${{ inputs.k }}' },
        unset: ['placeholder'],
      },
      [],
    )
  })

  it('takes any list of values as a multi-select default', () => {
    const onSave = open({
      type: 'multi-dropdown',
      options: [
        { value: 'a', label: 'A' },
        { value: 'b', label: 'B' },
      ],
    })
    const add = screen.getByRole('button', { name: 'Add value' })
    fireEvent.click(add)
    fireEvent.click(add)
    const [first, second] = screen.getAllByRole('combobox', { name: /, item \d+$/ })
    fireEvent.change(first as HTMLElement, { target: { value: 'b' } })
    fireEvent.change(second as HTMLElement, {
      target: { value: 'clusters/mycluster' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(onSave).toHaveBeenCalledWith(
      'field',
      expect.objectContaining({
        default: ['b', 'clusters/mycluster'],
      }),
      { set: { default: ['b', 'clusters/mycluster'] }, unset: [] },
      [],
    )
  })

  it('turns a cluster default into a list once several can be picked', () => {
    const onSave = open({
      type: 'compute-clusters',
      default: 'clusters/one',
    })
    fireEvent.click(screen.getByRole('checkbox', { name: 'Multiple choices' }))
    const add = screen.getByRole('button', { name: 'Add value' })
    fireEvent.click(add)
    const rows = screen.getAllByRole('combobox', { name: /, item \d+$/ })
    expect(rows[0]).toHaveValue('clusters/one')
    fireEvent.change(rows[1] as HTMLElement, {
      target: { value: 'clusters/two' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(onSave).toHaveBeenCalledWith(
      'field',
      expect.objectContaining({
        multi: true,
        default: ['clusters/one', 'clusters/two'],
      }),
      {
        set: {
          default: ['clusters/one', 'clusters/two'],
          multi: true,
        },
        unset: [],
      },
      [],
    )
  })

  it('flattens a group unless a field would clash with an input beside it', () => {
    const onSave = open(
      { type: 'group', items: { size: { type: 'number' } } },
      { siblings: ['size'] },
    )
    fireEvent.click(screen.getByRole('checkbox', { name: 'Leave out the group name' }))
    expect(screen.getByText(INPUTS_EDITOR_STRINGS.flattenClash('size'))).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
    cleanup()
    const clean = open({ type: 'group', items: { size: { type: 'number' } } })
    fireEvent.click(screen.getByRole('checkbox', { name: 'Leave out the group name' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(clean).toHaveBeenCalledWith(
      'field',
      { type: 'group', flatten: true, items: { size: { type: 'number' } } },
      { set: { flatten: true }, unset: [] },
      [],
    )
    expect(onSave).not.toHaveBeenCalled()
  })

  it('reads and writes a duration as HH:MM:SS, stored in seconds', () => {
    const onSave = open({ type: 'duration', default: 3600 })
    expect(screen.getByLabelText('Default')).toHaveValue('01:00:00')
    fireEvent.change(screen.getByLabelText('Minimum'), {
      target: { value: '90m' },
    })
    expect(screen.getByText(INPUTS_EDITOR_STRINGS.invalidDurationText)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Minimum'), {
      target: { value: '00:01:30' },
    })
    expect(screen.queryByLabelText('Checkbox text')).toBeNull()
    fireEvent.click(screen.getByRole('checkbox', { name: 'Checkbox to turn it off' }))
    fireEvent.change(screen.getByLabelText('Checkbox text'), {
      target: { value: 'Unlimited' },
    })
    expect(screen.getByText(INPUTS_EDITOR_STRINGS.disableNeedsBoth)).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Value when ticked'), {
      target: { value: '0' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(onSave).toHaveBeenCalledWith(
      'field',
      {
        type: 'duration',
        default: 3600,
        min: 90,
        disableLabel: 'Unlimited',
        disableValue: 0,
      },
      {
        set: { min: 90, disableLabel: 'Unlimited', disableValue: 0 },
        unset: [],
      },
      [],
    )
  })

  it('keeps legacy layout hints when editing a field without offering them as controls', () => {
    const onSave = open({ type: 'string', label: 'Before', width: '50%', 'anchor-below': true })
    expect(screen.queryByLabelText('Width')).not.toBeInTheDocument()
    expect(
      screen.queryByRole('checkbox', { name: 'Below the input before it' }),
    ).not.toBeInTheDocument()
    fireEvent.change(screen.getByDisplayValue('Before'), { target: { value: 'After' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(onSave).toHaveBeenCalledWith(
      'field',
      { type: 'string', label: 'After', width: '50%', 'anchor-below': true },
      { set: { label: 'After' }, unset: [] },
      [],
    )
    for (const type of inputTypes()) {
      expect(offeredInputKeys(parser, type)).not.toContain('width')
      expect(offeredInputKeys(parser, type)).not.toContain('anchor-below')
    }
  })

  it('makes a wizard step a repeatable page from its dialog', () => {
    const onSave = open({ type: 'step', title: 'Host', options: {} })
    fireEvent.click(screen.getByRole('checkbox', { name: 'Repeatable page' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(onSave).toHaveBeenCalledWith(
      'field',
      { type: 'step', title: 'Host', options: {}, multi: true },
      { set: { multi: true }, unset: [] },
      [],
    )
  })

  it('gives a repeatable page a title per copy and its fewest and most copies from its dialog', () => {
    const onSave = open({ type: 'step', title: 'Host', multi: true, options: {} })
    // The description's comes first, in the Field section.
    const [, titlePerCopy] = screen.getAllByRole('checkbox', { name: 'One per copy' })
    fireEvent.click(titlePerCopy as HTMLElement)
    fireEvent.change(screen.getByLabelText('Minimum'), { target: { value: '1' } })
    fireEvent.change(screen.getByLabelText('Maximum'), { target: { value: '3' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(onSave).toHaveBeenCalledWith(
      'field',
      { type: 'step', title: ['Host'], multi: true, min: 1, max: 3, options: {} },
      { set: { title: ['Host'], min: 1, max: 3 }, unset: [] },
      [],
    )
  })

  it('shows a page’s description, and saves the one typed', () => {
    const onSave = open({ type: 'step', title: 'Host', description: 'Pick a site', options: {} })
    const description = screen.getByDisplayValue('Pick a site')
    fireEvent.change(description, { target: { value: 'Pick a region' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(onSave).toHaveBeenCalledWith(
      'field',
      { type: 'step', title: 'Host', description: 'Pick a region', options: {} },
      { set: { description: 'Pick a region' }, unset: [] },
      [],
    )
  })

  it('offers radio options as default values and picks the layout by name', () => {
    const onSave = open({
      type: 'radio',
      options: ['fp16', 'fp32'],
      optionLabelPosition: 'side',
    })
    const input = screen.getByLabelText('Default')
    expect(suggestionsOf(input).map((option) => option.value)).toEqual(['fp16', 'fp32'])
    // A layout the schema doesn't know picks neither.
    for (const name of ['Side by side', 'One per line']) {
      expect(screen.getByRole('button', { name })).toHaveAttribute('aria-pressed', 'false')
    }
    fireEvent.click(screen.getByRole('button', { name: 'One per line' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(onSave).toHaveBeenCalledWith(
      'field',
      expect.objectContaining({ optionLabelPosition: 'top' }),
      expect.anything(),
      [],
    )
  })

  it('gives each checkbox a description', () => {
    const onSave = open({ type: 'checkbox-group', options: ['logs'] })
    const optionDescription = screen
      .getAllByLabelText('Description')
      .find((element) => element.tagName === 'INPUT') as HTMLElement
    fireEvent.change(optionDescription, {
      target: { value: 'stdout and stderr' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(onSave).toHaveBeenCalledWith(
      'field',
      expect.objectContaining({
        options: [{ value: 'logs', description: 'stdout and stderr' }],
      }),
      expect.anything(),
      [],
    )
  })

  it('keeps a list’s default rows as written until they are edited', () => {
    const onSave = open({
      type: 'list',
      label: 'Hosts',
      template: { host: { type: 'string' } },
      default: [{ host: 'a' }],
    })
    fireEvent.change(screen.getByLabelText('Label'), {
      target: { value: 'Servers' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(onSave).toHaveBeenCalledWith(
      'field',
      expect.objectContaining({ default: [{ host: 'a' }] }),
      { set: { label: 'Servers' }, unset: [] },
      [],
    )
  })

  it('needs min, max and step once the slider is on', () => {
    open({ type: 'number' })
    fireEvent.click(screen.getByRole('checkbox', { name: 'Slider' }))
    const save = screen.getByRole('button', { name: 'Save' })
    expect(save).toBeDisabled()
    for (const [label, value] of [
      ['Minimum', '1'],
      ['Maximum', '9'],
      ['Step size', '1'],
    ] as const) {
      fireEvent.change(screen.getByLabelText(label), { target: { value } })
    }
    expect(save).toBeEnabled()
  })

  it('keeps a multi-line tooltip on several lines', () => {
    open({ type: 'string', tooltip: 'first\nsecond' })
    const tooltip = screen.getByLabelText('Tooltip')
    expect(tooltip.tagName).toBe('TEXTAREA')
    expect(tooltip).toHaveValue('first\nsecond')
  })

  it('edits a list’s template fields in a nested dialog', () => {
    const onSave = open({
      type: 'list',
      template: { host: { type: 'string' } },
    })
    fireEvent.click(screen.getByText('Add field'))
    const dialogs = screen.getAllByRole('dialog')
    const nested = dialogs[dialogs.length - 1] as HTMLElement
    fireEvent.change(within(nested).getByLabelText('Name'), {
      target: { value: 'port' },
    })
    fireEvent.change(within(nested).getByLabelText('Type'), {
      target: { value: 'number' },
    })
    fireEvent.click(within(nested).getByRole('button', { name: 'Save' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(onSave).toHaveBeenCalledWith(
      'field',
      {
        type: 'list',
        template: { host: { type: 'string' }, port: { type: 'number' } },
      },
      {
        set: {
          template: { host: { type: 'string' }, port: { type: 'number' } },
        },
        unset: [],
      },
      [],
    )
  })
})

describe('InputDialog in two views', () => {
  function openViews(definition: Record<string, unknown>, inputs?: Record<string, unknown>) {
    const onSave = vi.fn()
    const onYaml = vi.fn()
    render(
      <InputDialog
        name="field"
        definition={definition}
        isNew={false}
        siblings={[]}
        allowStep
        inputs={inputs}
        onSave={onSave}
        onClose={() => {}}
        yaml={{ onSave: onYaml }}
        view="form"
      />,
    )
    return { onSave, onYaml }
  }
  const yamlText = async () =>
    ((await screen.findByLabelText('file:///workflow-input.yaml')) as HTMLTextAreaElement).value
  const toYaml = () => fireEvent.click(screen.getByRole('button', { name: 'YAML' }))
  const toForm = () => fireEvent.click(screen.getByRole('button', { name: 'Form' }))

  it('carries a setting the form cleared into the YAML', async () => {
    openViews({ type: 'string', label: 'Dataset', hidden: true })
    fireEvent.change(screen.getByLabelText('Label'), { target: { value: '' } })
    toYaml()
    expect(await yamlText()).not.toContain('Dataset')
  })

  it('keeps a rename across a trip to the YAML and back', () => {
    const { onSave } = openViews({ type: 'string' })
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'renamed' } })
    toYaml()
    toForm()
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(onSave).toHaveBeenCalledWith('renamed', { type: 'string' }, expect.anything(), [])
  })

  it('drops the old type’s settings after a trip to the YAML and back', () => {
    const { onSave } = openViews({ type: 'string', placeholder: 'Name' })
    fireEvent.change(screen.getByLabelText('Type'), { target: { value: 'number' } })
    toYaml()
    toForm()
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(onSave).toHaveBeenCalledWith(
      'field',
      { type: 'number' },
      { set: { type: 'number' }, unset: ['placeholder'] },
      [],
    )
  })

  it('drops a setting the type changed in the YAML no longer takes, once saved from the form', async () => {
    const onSave = vi.fn()
    render(
      <InputDialog
        name="field"
        definition={{ type: 'string', placeholder: 'Name' }}
        isNew={false}
        siblings={[]}
        allowStep
        onSave={onSave}
        onClose={() => {}}
        yaml={{ onSave: () => {} }}
        view="yaml"
      />,
    )
    fireEvent.change(await screen.findByLabelText('file:///workflow-input.yaml'), {
      target: { value: 'type: number\nplaceholder: Name\n' },
    })
    toForm()
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(onSave).toHaveBeenCalledWith(
      'field',
      { type: 'number' },
      { set: { type: 'number' }, unset: ['placeholder'] },
      [],
    )
  })

  it('saves the inputs it made for a setting with the YAML', () => {
    const { onYaml } = openViews({ type: 'slurm-accounts' }, {})
    fireEvent.click(screen.getByRole('button', { name: 'New Cluster input…' }))
    const dialogs = screen.getAllByRole('dialog')
    fireEvent.click(
      within(dialogs[dialogs.length - 1] as HTMLElement).getByRole('button', { name: 'Save' }),
    )
    toYaml()
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(onYaml).toHaveBeenCalledWith('field', expect.stringContaining('inputs.cluster'), [
      expect.objectContaining({ name: 'cluster' }),
    ])
  })

  it('refuses, in the YAML, the name of an input it made for a setting', () => {
    openViews({ type: 'slurm-accounts' }, {})
    fireEvent.click(screen.getByRole('button', { name: 'New Cluster input…' }))
    const dialogs = screen.getAllByRole('dialog')
    fireEvent.click(
      within(dialogs[dialogs.length - 1] as HTMLElement).getByRole('button', { name: 'Save' }),
    )
    toYaml()
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'cluster' } })
    expect(screen.getByText(INPUTS_EDITOR_STRINGS.inputExists)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
  })

  it('carries a group’s fields into the template of a list the YAML made of it', async () => {
    const onSave = vi.fn()
    render(
      <InputDialog
        name="field"
        definition={{ type: 'group', items: { host: { type: 'string' } } }}
        isNew={false}
        siblings={[]}
        allowStep
        onSave={onSave}
        onClose={() => {}}
        yaml={{ onSave: () => {} }}
        view="yaml"
      />,
    )
    fireEvent.change(await screen.findByLabelText('file:///workflow-input.yaml'), {
      target: { value: 'type: list\nitems:\n  host:\n    type: string\n' },
    })
    toForm()
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(onSave).toHaveBeenCalledWith(
      'field',
      { type: 'list', template: { host: { type: 'string' } } },
      expect.anything(),
      [],
    )
  })

  it('keeps a container’s fields when the YAML changes only its type', async () => {
    const onSave = vi.fn()
    render(
      <InputDialog
        name="field"
        definition={{ type: 'group', items: { host: { type: 'string' } } }}
        isNew={false}
        siblings={[]}
        allowStep
        onSave={onSave}
        onClose={() => {}}
        yaml={{ onSave: () => {} }}
        view="yaml"
      />,
    )
    fireEvent.change(await screen.findByLabelText('file:///workflow-input.yaml'), {
      target: { value: 'type: step\ntitle: Hosts\nitems:\n  host:\n    type: string\n' },
    })
    toForm()
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(onSave).toHaveBeenCalledWith(
      'field',
      { type: 'step', title: 'Hosts', options: { host: { type: 'string' } } },
      expect.anything(),
      [],
    )
  })
})

describe('InputDialog keeps what it does not show', () => {
  function open(definition: Record<string, unknown>) {
    const onSave = vi.fn()
    render(
      <InputDialog
        name="field"
        definition={definition}
        isNew={false}
        siblings={[]}
        allowStep
        onSave={onSave}
        onClose={() => {}}
      />,
    )
    return onSave
  }

  it('returns settings it has no field for along with the ones it changed', () => {
    const onSave = open({ type: 'string', label: 'Host', 'x-note': 'kept' })
    fireEvent.change(screen.getByLabelText('Label'), { target: { value: 'Hostname' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(onSave).toHaveBeenCalledWith(
      'field',
      { type: 'string', label: 'Hostname', 'x-note': 'kept' },
      { set: { label: 'Hostname' }, unset: [] },
      [],
    )
  })

  it('offers a text field’s length, case and characters to strip', () => {
    open({ type: 'string', minLength: 2, maxLength: 8, lowercase: true, sanitize: '[^a-z]' })
    expect(screen.getByLabelText('Shortest')).toHaveValue('2')
    expect(screen.getByLabelText('Longest')).toHaveValue('8')
    expect(screen.getByLabelText('Characters to strip')).toHaveValue('[^a-z]')
  })

  it('checks a kept setting the new type can’t hold, as options keyed by another input', () => {
    open({ type: 'dropdown', options: { aws: ['a'] }, 'option-key': '${{ inputs.csp }}' })
    fireEvent.change(screen.getByLabelText('Type'), { target: { value: 'multi-dropdown' } })
    expect(screen.getByText(INPUTS_EDITOR_STRINGS.optionsByKeyDropdownOnly)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
  })

  it('carries a group’s fields into a list’s template', () => {
    const onSave = open({ type: 'group', items: { host: { type: 'string' } } })
    fireEvent.change(screen.getByLabelText('Type'), { target: { value: 'list' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(onSave).toHaveBeenCalledWith(
      'field',
      { type: 'list', template: { host: { type: 'string' } } },
      expect.anything(),
      [],
    )
  })

  it('labels a numeric option and saves a default picking it as the number', () => {
    const onSave = open({ type: 'dropdown', options: [{ value: 'a', label: 'A' }] })
    fireEvent.click(screen.getByRole('button', { name: 'Add option' }))
    const values = screen.getAllByRole('textbox', { name: 'Value' })
    fireEvent.change(values[values.length - 1] as HTMLElement, { target: { value: '4' } })
    fireEvent.change(screen.getByLabelText('Default'), { target: { value: '4' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(onSave).toHaveBeenCalledWith(
      'field',
      expect.objectContaining({
        options: [
          { value: 'a', label: 'A' },
          { value: 4, label: '4' },
        ],
        default: 4,
      }),
      expect.anything(),
      [],
    )
  })

  it('moves a renamed template field’s value in the default rows, and drops a removed one’s', () => {
    const onSave = open({
      type: 'list',
      template: {
        $meta: {
          layout: {
            type: 'section',
            label: 'Connection',
            css: 'padding: 1rem;',
            children: [
              { type: 'field', field: 'host' },
              { type: 'field', field: 'port' },
            ],
          },
        },
        host: { type: 'string' },
        port: { type: 'number' },
      },
      default: [{ host: 'a', port: 22 }],
    })
    fireEvent.click(screen.getAllByRole('button', { name: 'Edit input' })[0] as HTMLElement)
    const dialogs = screen.getAllByRole('dialog')
    const nested = dialogs[dialogs.length - 1] as HTMLElement
    fireEvent.change(within(nested).getByLabelText('Name'), { target: { value: 'hostname' } })
    fireEvent.click(within(nested).getByRole('button', { name: 'Save' }))
    fireEvent.click(screen.getAllByRole('button', { name: 'Delete input' })[1] as HTMLElement)
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(onSave).toHaveBeenCalledWith(
      'field',
      expect.objectContaining({
        default: [{ hostname: 'a' }],
        template: {
          $meta: {
            layout: {
              type: 'section',
              label: 'Connection',
              css: 'padding: 1rem;',
              children: [{ type: 'field', field: 'hostname' }],
            },
          },
          hostname: { type: 'string' },
        },
      }),
      expect.anything(),
      [],
    )
  })

  it('leaves the list’s dialog open on Escape in a field’s dialog', () => {
    const onClose = vi.fn()
    render(
      <InputDialog
        name="field"
        definition={{ type: 'list', template: { host: { type: 'string' } } }}
        isNew={false}
        siblings={[]}
        allowStep
        onSave={() => {}}
        onClose={onClose}
      />,
    )
    fireEvent.click(screen.getByText('Add field'))
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).not.toHaveBeenCalled()
  })

  it('takes the opt-out value as a duration’s default, and only a number for it', () => {
    open({ type: 'duration', disableLabel: 'Never', disableValue: -1, default: -1 })
    expect(screen.getByLabelText('Default')).toHaveValue('-1')
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled()
  })

  it('takes the opt-out value typed as a duration’s default', () => {
    const onSave = open({ type: 'duration', disableLabel: 'Never', disableValue: -1 })
    fireEvent.change(screen.getByLabelText('Default'), { target: { value: '-1' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(onSave).toHaveBeenCalledWith(
      'field',
      expect.objectContaining({ default: -1 }),
      expect.anything(),
      [],
    )
  })

  it('replaces an opt-out value written as text once the number is typed', () => {
    const onSave = open({ type: 'duration', disableLabel: 'Never', disableValue: '-1' })
    const value = screen.getByLabelText('Value when ticked')
    expect(value).toHaveValue('"-1"')
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
    fireEvent.change(value, { target: { value: '-1' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(onSave).toHaveBeenCalledWith(
      'field',
      expect.objectContaining({ disableValue: -1 }),
      { set: { disableValue: -1 }, unset: [] },
      [],
    )
  })

  it('keeps the links of options set by an expression when the expression changes', () => {
    const onSave = open({
      type: 'checkbox-group',
      options: '${{ inputs.features }}',
      implies: { all: ['logs'] },
    })
    fireEvent.change(screen.getByLabelText('Options'), {
      target: { value: '${{ inputs.flags }}' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(onSave).toHaveBeenCalledWith(
      'field',
      expect.objectContaining({ implies: { all: ['logs'] } }),
      { set: { options: '${{ inputs.flags }}' }, unset: [] },
      [],
    )
  })

  it('changes nothing it wasn’t asked to, so it closes on Escape and saves nothing', () => {
    const onClose = vi.fn()
    const onSave = vi.fn()
    const dialog = (definition: Record<string, unknown>) => (
      <InputDialog
        name="field"
        definition={definition}
        isNew={false}
        siblings={[]}
        allowStep
        onSave={onSave}
        onClose={onClose}
      />
    )
    // A text default naming a numeric option, and a link naming an option there isn't.
    render(dialog({ type: 'dropdown', options: [{ value: 2, label: 'Two' }], default: '2' }))
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
    cleanup()
    render(dialog({ type: 'checkbox-group', options: ['a', 'b'], implies: { a: ['b'], c: ['a'] } }))
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(onSave).not.toHaveBeenCalled()
    expect(onClose).toHaveBeenCalledTimes(2)
  })

  it('writes options the way a radio takes them once a checkbox group becomes one', () => {
    const onSave = open({
      type: 'checkbox-group',
      options: [{ value: 'cuda', label: 'CUDA', description: 'Needs the GPU drivers' }],
    })
    fireEvent.change(screen.getByLabelText('Type'), { target: { value: 'radio' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(onSave).toHaveBeenCalledWith(
      'field',
      { type: 'radio', options: [{ value: 'cuda', label: 'CUDA' }] },
      expect.anything(),
      [],
    )
  })

  it('turns kept options and a default into the text a radio or checkbox group takes', () => {
    const onSave = open({
      type: 'dropdown',
      options: [{ value: 2, label: 'Two', description: 'Second' }],
      default: 2,
    })
    fireEvent.change(screen.getByLabelText('Type'), { target: { value: 'radio' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(onSave).toHaveBeenCalledWith(
      'field',
      { type: 'radio', options: [{ value: '2', label: 'Two' }], default: '2' },
      expect.anything(),
      [],
    )
    cleanup()
    const boxes = open({ type: 'dropdown', options: [{ value: 'a', description: 123 }] })
    fireEvent.change(screen.getByLabelText('Type'), { target: { value: 'checkbox-group' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(boxes).toHaveBeenCalledWith(
      'field',
      { type: 'checkbox-group', options: [{ value: 'a', description: '123' }] },
      expect.anything(),
      [],
    )
  })

  it('asks for text options when JSON ones a radio can’t hold carry over', () => {
    open({ type: 'multi-dropdown', options: [{ value: { id: 1 }, label: 'One' }] })
    fireEvent.change(screen.getByLabelText('Type'), { target: { value: 'radio' } })
    expect(screen.getByText(INPUTS_EDITOR_STRINGS.radioOptionShape)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
  })

  it('keeps a setting both types read alike exactly across a type change', () => {
    const onSave = open({ type: 'password', label: ' Secret ', default: '  passphrase  ' })
    fireEvent.change(screen.getByLabelText('Type'), { target: { value: 'string' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(onSave).toHaveBeenCalledWith(
      'field',
      { type: 'string', label: ' Secret ', default: '  passphrase  ' },
      { set: { type: 'string' }, unset: [] },
      [],
    )
  })

  it('keeps a radio’s and a checkbox group’s values as text, which is all their options take', () => {
    const onSave = open({ type: 'radio', options: ['a'] })
    fireEvent.click(screen.getByRole('button', { name: 'Add option' }))
    const values = screen.getAllByRole('textbox', { name: 'Value' })
    fireEvent.change(values[values.length - 1] as HTMLElement, { target: { value: '1' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(onSave).toHaveBeenCalledWith(
      'field',
      expect.objectContaining({ options: ['a', { value: '1' }] }),
      expect.anything(),
      [],
    )
    cleanup()
    const ticked = open({ type: 'checkbox-group', options: ['1', '2'] })
    fireEvent.click(screen.getByRole('button', { name: 'Add value' }))
    const [first] = screen.getAllByRole('combobox', { name: /, item \d+$/ })
    fireEvent.change(first as HTMLElement, { target: { value: '2' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(ticked).toHaveBeenCalledWith(
      'field',
      expect.objectContaining({ default: ['2'] }),
      expect.anything(),
      [],
    )
  })

  it('writes a kept default as the new type reads it, and asks to change one it can’t hold', () => {
    const onSave = open({ type: 'number', default: 5 })
    fireEvent.change(screen.getByLabelText('Type'), { target: { value: 'string' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(onSave).toHaveBeenCalledWith(
      'field',
      { type: 'string', default: '5' },
      expect.anything(),
      [],
    )
    cleanup()
    const listed = open({
      type: 'multi-dropdown',
      options: [
        { value: 'a', label: 'A' },
        { value: 'b', label: 'B' },
      ],
      default: ['a', 'b'],
    })
    fireEvent.change(screen.getByLabelText('Type'), { target: { value: 'dropdown' } })
    expect(screen.getByText(INPUTS_EDITOR_STRINGS.keptValueDoesNotFit)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Default'), { target: { value: 'a' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(listed).toHaveBeenCalledWith(
      'field',
      expect.objectContaining({ type: 'dropdown', default: 'a' }),
      expect.anything(),
      [],
    )
  })

  it('labels bare numbers among the options once the options are edited', () => {
    const onSave = open({ type: 'dropdown', options: [1, 2] })
    fireEvent.click(screen.getByRole('button', { name: 'Add option' }))
    const values = screen.getAllByRole('textbox', { name: 'Value' })
    fireEvent.change(values[values.length - 1] as HTMLElement, { target: { value: 'c' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(onSave).toHaveBeenCalledWith(
      'field',
      expect.objectContaining({
        options: [{ value: 1, label: '1' }, { value: 2, label: '2' }, expect.anything()],
      }),
      expect.anything(),
      [],
    )
  })

  it('takes only whole numbers for a text’s length, and a pattern that compiles', () => {
    open({ type: 'string' })
    fireEvent.change(screen.getByLabelText('Shortest'), { target: { value: '1.5' } })
    expect(screen.getByText(INPUTS_EDITOR_STRINGS.wholeNumberFrom(0))).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Longest'), { target: { value: '0' } })
    expect(screen.getByText(INPUTS_EDITOR_STRINGS.wholeNumberFrom(1))).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Characters to strip'), { target: { value: '[a-' } })
    expect(screen.getByText(INPUTS_EDITOR_STRINGS.invalidPattern)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
  })
})
