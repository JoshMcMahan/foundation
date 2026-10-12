import { dumpYaml, loadYaml } from '@parallelworks/workflow-parser'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { useMemo } from 'react'
import { useWorkflowEditing, useWorkflowEngine } from '../components/Provider'
import { DynamicForm } from '../form/Form'
import { initializeValues } from '../form/lib'
import type { EditorProblem } from './editorApi'
import { InputsFormEditor } from './InputsEditor'
import { asRecord } from './records'
import { useStoryWorkflow } from './stories/harness'

const meta: Meta<typeof InputsFormEditor> = {
  title: 'UI/Workflow/InputsFormEditor',
  component: InputsFormEditor,
  argTypes: {
    editor: {
      control: false,
      description: 'The callbacks that make the run form editable, as for the graph.',
    },
    inputs: { control: false, description: 'The workflow’s input definitions the form draws.' },
    children: { control: false, description: 'The run form, drawn from the same inputs.' },
  },
}
export default meta

const INPUTS_WORKFLOW = `on:
  execute:
    inputs:
      title:
        type: header
        text: Training run
      dataset:
        type: string
        label: Dataset
        description: Where the training data lives.
        default: s3://datasets/images
      epochs:
        type: number
        label: Epochs
        default: 10
        min: 1
      precision:
        type: radio
        label: Precision
        options: [fp16, bf16, fp32]
        default: bf16
      resources:
        type: group
        label: Resources
        items:
          gpus:
            type: dropdown
            label: GPUs
            options: [1, 2, 4, 8]
            default: 2
          walltime:
            type: duration
            label: Time limit
            default: 3600
      notify:
        type: boolean
        label: Email me when it finishes
        default: true
jobs:
  train:
    steps:
      - run: python train.py --epochs \${{ inputs.epochs }}
`

function EditableForm({
  source,
  problems,
  allowLayoutCSS = false,
}: {
  source: string
  problems?: EditorProblem[]
  allowLayoutCSS?: boolean
}) {
  const story = useStoryWorkflow(source)
  const editing = useWorkflowEditing()
  const engine = useWorkflowEngine()
  const inputs = useMemo(
    () => editing.workflowInputsSchema(story.workflow),
    [editing, story.workflow],
  )
  const formJSONs = useMemo(() => engine.convertInputs(inputs ?? {}), [engine, inputs])
  // The form starts from the inputs' defaults, as a host's run form does.
  const initialValues = useMemo(() => initializeValues(formJSONs) ?? {}, [formJSONs])
  // In a padded panel, as an app's editing page shows the form.
  return (
    <div className="relative max-w-2xl p-4 panel">
      <InputsFormEditor
        editor={story.editor(
          problems
            ? {
                problems,
                listedProblems: problems.map((problem) => ({ ...problem, pick: () => {} })),
              }
            : {},
        )}
        inputs={inputs}
      >
        <DynamicForm
          allowLayoutCSS={allowLayoutCSS}
          formJSONs={formJSONs}
          initialValues={initialValues}
          reinitialize
          workflowForm
          skipValueParse
        />
      </InputsFormEditor>
    </div>
  )
}

/**
 * The run form as an editor: hover an input for its toolbar, click its label to select it,
 * drag the label or the grip to move it, and add inputs from the bar below. Edits undo.
 */
export const Editable: StoryObj<typeof InputsFormEditor> = {
  render: () => <EditableForm source={INPUTS_WORKFLOW} />,
}

/** A problem marks the input it's in, and the bar counts and lists it. */
export const WithProblems: StoryObj<typeof InputsFormEditor> = {
  render: () => (
    <EditableForm
      source={INPUTS_WORKFLOW}
      problems={[
        {
          message: 'The default isn’t one of the options.',
          line: 20,
          input: ['precision'],
        },
      ]}
    />
  ),
}

const LEGACY_WIDTHS_WORKFLOW = `on:
  execute:
    inputs:
      dataset:
        type: string
        label: Dataset
        default: s3://datasets/images
        width: 50%
      seed:
        type: number
        label: Seed
        default: 42
        hidden: true
      epochs:
        type: number
        label: Epochs
        default: 10
        width: 50%
      batch:
        type: number
        label: Batch size
        default: 64
        anchor-below: true
      precision:
        type: radio
        label: Precision
        options: [fp16, bf16, fp32]
        default: bf16
      resources:
        type: group
        label: Resources
        items:
          gpus:
            type: dropdown
            label: GPUs
            options: [1, 2, 4, 8]
            default: 2
            width: 50%
          walltime:
            type: duration
            label: Time limit
            default: 3600
            width: 50%
jobs:
  train:
    steps:
      - run: python train.py --epochs \${{ inputs.epochs }}
`

const columnsWorkflow = asRecord(loadYaml(LEGACY_WIDTHS_WORKFLOW))
const columnsInputs = asRecord(asRecord(asRecord(columnsWorkflow['on'])['execute'])['inputs'])
for (const value of Object.values(columnsInputs)) {
  const definition = asRecord(value)
  delete definition['width']
  delete definition['anchor-below']
}
columnsInputs['$meta'] = {
  layout: {
    type: 'stack',
    children: [
      {
        type: 'grid',
        columns: { base: 1, sm: [1, 1] },
        children: [
          { type: 'field', field: 'dataset' },
          {
            type: 'stack',
            children: [
              { type: 'field', field: 'epochs' },
              { type: 'field', field: 'batch' },
            ],
          },
        ],
      },
      { type: 'field', field: 'precision' },
      { type: 'field', field: 'resources' },
    ],
  },
}
const resourceInputs = asRecord(asRecord(columnsInputs['resources'])['items'])
for (const value of Object.values(resourceInputs)) delete asRecord(value)['width']
resourceInputs['$meta'] = {
  layout: {
    type: 'grid',
    columns: { base: 1, sm: 2 },
    children: [
      { type: 'field', field: 'gpus' },
      { type: 'field', field: 'walltime' },
    ],
  },
}

/** Drag and resize responsive grids; stacked fields stay in their column. Every edit writes $meta.layout. */
export const SideBySide: StoryObj<typeof InputsFormEditor> = {
  render: () => <EditableForm source={dumpYaml(columnsWorkflow)} />,
}

export const LegacyWidths: StoryObj<typeof InputsFormEditor> = {
  render: () => <EditableForm source={LEGACY_WIDTHS_WORKFLOW} />,
}

const sectionsWorkflow = structuredClone(columnsWorkflow)
const sectionsInputs = asRecord(asRecord(asRecord(sectionsWorkflow['on'])['execute'])['inputs'])
sectionsInputs['$meta'] = {
  layout: {
    type: 'section',
    label: 'Training setup',
    description: 'Prepare a repeatable experiment.',
    css: '--form-surface: #f7efe2; --form-accent: #733d38; padding: 1.5rem; border-radius: 1rem;',
    children: [
      {
        type: 'grid',
        columns: { base: 1, md: [2, 1] },
        align: 'rows',
        children: [
          {
            type: 'section',
            label: 'Data and model',
            children: [
              { type: 'field', field: 'dataset' },
              { type: 'field', field: 'precision' },
            ],
          },
          {
            type: 'section',
            label: 'Training limits',
            description: 'Shared rows keep the controls aligned.',
            children: [
              { type: 'field', field: 'epochs' },
              { type: 'field', field: 'batch' },
            ],
          },
        ],
      },
      { type: 'field', field: 'resources' },
    ],
  },
}
export const StyledSections: StoryObj<typeof InputsFormEditor> = {
  render: () => <EditableForm source={dumpYaml(sectionsWorkflow)} allowLayoutCSS />,
}

const WIZARD_WORKFLOW = `on:
  execute:
    inputs:
      $meta:
        wizard:
          mode: wizard
          submitLabel: Launch
          navigation:
            allowJump: true
      cluster:
        type: step
        title: Cluster
        description: Where the job runs.
        options:
          partition:
            type: dropdown
            label: Partition
            options: [gpu, cpu, debug]
            default: gpu
          nodes:
            type: number
            label: Nodes
            default: 2
      workers:
        type: step
        title: Worker site
        description: One page per worker site.
        multi: true
        min: 2
        max: 3
        options:
          site:
            type: string
            label: Site
            default: us-east
          gpus:
            type: number
            label: GPUs per node
            default: 4
      review:
        type: step
        title: Review
        options:
          notify:
            type: boolean
            label: Email me when it finishes
            default: true
jobs:
  train:
    steps:
      - run: python train.py
`

/** A wizard is built as it runs, one page at a time: turn pages with its own buttons or the bar's Page,
 * add one with + Page, and split or unsplit a group's or list's inputs from its row. */
export const Wizard: StoryObj<typeof InputsFormEditor> = {
  render: () => <EditableForm source={WIZARD_WORKFLOW} />,
}

const GROUP_PAGES_WORKFLOW = `on:
  execute:
    inputs:
      dataset:
        type: string
        label: Dataset
        default: s3://datasets/images
      resources:
        type: group
        label: Resources
        items:
          $meta:
            wizard:
              mode: wizard
          compute:
            type: step
            title: Compute
            options:
              gpus:
                type: number
                label: GPUs
                default: 2
          limits:
            type: step
            title: Limits
            options:
              walltime:
                type: duration
                label: Time limit
                default: 3600
      tuning:
        type: group
        label: Tuning
        hidden: true
        items:
          seed:
            type: number
            label: Seed
            default: 42
          warmup:
            type: number
            label: Warmup steps
            default: 500
jobs:
  train:
    steps:
      - run: python train.py
`

/** A group's inputs paged inside the form, and a hidden group the form leaves out but the editor lists last. */
export const GroupPages: StoryObj<typeof InputsFormEditor> = {
  render: () => <EditableForm source={GROUP_PAGES_WORKFLOW} />,
}

const weightedWorkflow = structuredClone(columnsWorkflow)
const weightedInputs = asRecord(asRecord(asRecord(weightedWorkflow['on'])['execute'])['inputs'])
weightedInputs['$meta'] = {
  layout: {
    type: 'stack',
    children: [
      {
        type: 'grid',
        columns: { base: 1, md: [2, 1] },
        children: [
          { type: 'field', field: 'dataset' },
          { type: 'field', field: 'epochs' },
        ],
      },
      { type: 'field', field: 'batch' },
      { type: 'field', field: 'precision' },
      { type: 'field', field: 'resources' },
    ],
  },
}

/** A grid wider than a phone at `md`, two to one: an input dropped beside it adds a track and keeps both. */
export const WeightedGrid: StoryObj<typeof InputsFormEditor> = {
  render: () => <EditableForm source={dumpYaml(weightedWorkflow)} />,
}

/** A workflow without inputs yet. */
export const Empty: StoryObj<typeof InputsFormEditor> = {
  render: () => <EditableForm source={'jobs:\n  main:\n    steps:\n      - run: echo hi\n'} />,
}
