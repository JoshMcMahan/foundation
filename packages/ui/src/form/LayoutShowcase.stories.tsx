import {
  convertToDynamicForm,
  dumpYaml,
  loadYaml,
  workflowInputsSchema,
} from '@parallelworks/workflow-parser'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { useId, useState } from 'react'
import { CopyButton } from '../components/CopyButton'
import { DynamicForm } from './Form'
import type { FormLayoutNode } from './layout'
import { initializeValues } from './lib'

interface ExampleProps {
  workflowYaml: string
  allowLayoutCSS: boolean
  showYaml: boolean
}

function parseExample(source: string) {
  try {
    if (source.length > 100_000) throw new Error('Keep playground YAML under 100,000 characters.')
    const workflow = loadYaml(source)
    // Bound traversal before the converter sees aliases or recursively nested input definitions.
    let nodes = 0
    const ancestors = new Set<object>()
    function visit(value: unknown, depth: number) {
      if (++nodes > 10_000 || depth > 64)
        throw new Error('This example is too deeply nested or too large.')
      if (!value || typeof value !== 'object') return
      if (ancestors.has(value)) throw new Error('Recursive YAML aliases cannot be previewed.')
      ancestors.add(value)
      for (const child of Object.values(value)) visit(child, depth + 1)
      ancestors.delete(value)
    }
    visit(workflow, 0)
    const inputs = workflowInputsSchema(workflow as Record<string, unknown>)
    if (!inputs) throw new Error('Define the form fields under on.execute.inputs.')
    const formJSONs = convertToDynamicForm(inputs)
    return { formJSONs, initialValues: initializeValues(formJSONs) ?? {}, error: '' }
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Unable to read this workflow YAML.' }
  }
}

function WorkflowExample({ workflowYaml, allowLayoutCSS, showYaml }: ExampleProps) {
  const id = useId()
  const [draft, setDraft] = useState(workflowYaml)
  const [preview, setPreview] = useState(() => parseExample(workflowYaml))
  const [revision, setRevision] = useState(0)
  const [message, setMessage] = useState(preview.error)
  const [invalid, setInvalid] = useState(!!preview.error)
  const [expanded, setExpanded] = useState(showYaml)
  const apply = (source: string) => {
    const next = parseExample(source)
    setInvalid(!!next.error)
    if (next.error) {
      setMessage(next.error)
      return
    }
    setPreview(next)
    setRevision((value) => value + 1)
    setMessage('Preview updated. Field defaults reloaded.')
  }
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          className="inline-flex items-center gap-2 rounded border px-3 py-2 theme-hover"
          aria-expanded={expanded}
          aria-controls={id}
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? 'Hide workflow YAML' : 'Edit workflow YAML'}
        </button>
        <CopyButton text={draft} label="workflow YAML" showLabel size="md" />
      </div>
      <div
        className={expanded ? 'grid items-start gap-6' : ''}
        style={
          expanded
            ? { gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 32rem), 1fr))' }
            : undefined
        }
      >
        <section
          id={id}
          hidden={!expanded}
          className="min-w-0 space-y-3"
          aria-label="Workflow YAML editor"
        >
          <label htmlFor={`${id}-source`} className="block font-semibold">
            Workflow YAML
          </label>
          <p className="text-sm theme-muted-text">
            Edit the fields, layout, or CSS, then apply your changes. Jobs are shown for context;
            this preview never runs them.
          </p>
          <textarea
            id={`${id}-source`}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            spellCheck={false}
            wrap="off"
            rows={28}
            maxLength={100_000}
            aria-invalid={invalid}
            aria-describedby={`${id}-status`}
            className="block w-full min-w-0 resize-y rounded border p-3 font-mono text-sm"
            style={{ tabSize: 2 }}
          />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="rounded border px-3 py-2 element"
              onClick={() => apply(draft)}
            >
              Apply YAML
            </button>
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded border px-3 py-2 theme-hover"
              onClick={() => {
                setDraft(workflowYaml)
                apply(workflowYaml)
              }}
            >
              Reset example
            </button>
          </div>
          <p id={`${id}-status`} role="status" className="whitespace-pre-wrap break-words text-sm">
            {message || 'The preview is built from on.execute.inputs using the workflow parser.'}
          </p>
        </section>
        <section className="min-w-0" aria-label="Form preview">
          {preview.formJSONs ? (
            <DynamicForm
              key={revision}
              formJSONs={preview.formJSONs}
              initialValues={preview.initialValues}
              allowLayoutCSS={allowLayoutCSS}
              workflowForm
              skipValueParse
            />
          ) : (
            <p role="alert">{preview.error}</p>
          )}
        </section>
      </div>
    </div>
  )
}

const meta: Meta<typeof WorkflowExample> = {
  title: 'UI/Form/LayoutShowcase',
  component: WorkflowExample,
  tags: ['autodocs'],
  argTypes: {
    allowLayoutCSS: {
      control: 'boolean',
      description: 'Host permission for scoped styling. Layout remains active when disabled.',
    },
    workflowYaml: {
      control: 'text',
      description:
        'Complete workflow YAML. The preview parses on.execute.inputs, including layout metadata and field defaults.',
    },
    showYaml: {
      control: 'boolean',
      description: 'Show the editable YAML next to the preview on wide screens.',
    },
  },
  parameters: {
    docs: {
      description: {
        component:
          'Real workflow YAML drives every example through the workflow parser. Expand the YAML editor to change fields, responsive layouts, or scoped CSS and apply the result. Storybook’s Show code view also contains the complete YAML. Layout CSS requires the host’s allowLayoutCSS permission; it cannot be enabled by the workflow itself.',
      },
    },
  },
  render: (args) => <WorkflowExample key={`${args.workflowYaml}:${args.showYaml}`} {...args} />,
}
export default meta

type DemoField = {
  type: string
  label: string
  default?: string | number | boolean
  [key: string]: unknown
}

function showcase(
  title: string,
  description: string,
  fields: Record<string, DemoField>,
  layout: FormLayoutNode,
  css: string,
): StoryObj<typeof WorkflowExample> {
  const workflowYaml = dumpYaml({
    on: {
      execute: {
        inputs: {
          $meta: {
            layout: { type: 'section', label: title, description, css, children: [layout] },
          },
          ...fields,
        },
      },
    },
    jobs: { preview: { steps: [{ run: 'echo "Example workflow"' }] } },
  })
  return {
    args: { workflowYaml, allowLayoutCSS: true, showYaml: false },
    parameters: {
      docs: {
        description: { story: description },
        source: { code: workflowYaml, language: 'yaml', type: 'code' },
      },
    },
  }
}

const RENDER_FIELDS: Record<string, DemoField> = {
  name: { type: 'string', label: 'Render name', default: 'Canyon / final frames' },
  frames: { type: 'string', label: 'Frame range', default: '1001–1240' },
  renderer: {
    type: 'dropdown',
    label: 'Renderer',
    options: ['Path tracer', 'Raster', 'Preview'],
    default: 'Path tracer',
  },
  width: { type: 'number', label: 'Width (px)', default: 3840 },
  height: { type: 'number', label: 'Height (px)', default: 2160 },
  samples: { type: 'number', label: 'Samples per pixel', default: 1024 },
  devices: { type: 'number', label: 'Devices', default: 8 },
  walltime: { type: 'duration', label: 'Time limit', default: 21600 },
  denoise: { type: 'boolean', label: 'Denoise', default: true },
  output: { type: 'string', label: 'Output directory', default: './renders/canyon' },
  format: {
    type: 'dropdown',
    label: 'Format',
    options: ['OpenEXR', 'PNG', 'TIFF'],
    default: 'OpenEXR',
  },
  notify: { type: 'boolean', label: 'Notify on completion', default: true },
  notes: {
    type: 'string',
    textarea: true,
    label: 'Render notes',
    default: 'Preserve the highlights on the canyon walls. Use the final camera path.',
    optional: true,
  },
}

export const RenderStudio = showcase(
  'Render studio',
  'From the first sample to the final frame. Configure your image, reserve the compute, and send it to delivery.',
  RENDER_FIELDS,
  {
    type: 'stack',
    css: 'gap: 2rem; padding-top: 1.5rem;',
    children: [
      { type: 'field', field: 'name', css: 'max-width: 44rem;' },
      {
        type: 'grid',
        columns: { base: 1, md: [2, 1], lg: [3, 1] },
        css: 'gap: 1.5rem;',
        children: [
          {
            type: 'section',
            label: 'Image & compute',
            description: 'Set the image quality and the resources for the batch.',
            css: '--form-surface: #1b222c; --form-accent: #d4ed7a; padding: clamp(1rem, 3%, 2rem); border: 1px solid #424b58; border-radius: 1rem; gap: 1.75rem; font-size: 1.5rem;',
            children: [
              {
                type: 'grid',
                columns: { base: 1, sm: [1, 2] },
                css: 'gap: 1.25rem;',
                children: [
                  { type: 'field', field: 'frames' },
                  { type: 'field', field: 'renderer' },
                ],
              },
              {
                type: 'grid',
                columns: { base: 1, sm: 2, md: 3 },
                css: 'gap: 0.75rem;',
                children: [
                  { type: 'field', field: 'width' },
                  { type: 'field', field: 'height' },
                  { type: 'field', field: 'samples' },
                ],
              },
              {
                type: 'grid',
                columns: { base: 1, sm: 2, md: 3 },
                css: 'gap: 0.75rem;',
                children: [
                  { type: 'field', field: 'devices' },
                  { type: 'field', field: 'walltime' },
                  { type: 'field', field: 'denoise', span: { sm: 2, md: 1 } },
                ],
              },
              { type: 'field', field: 'notes', css: 'padding-top: 0.5rem;' },
            ],
          },
          {
            type: 'section',
            label: 'Delivery',
            description: 'Choose where the finished frames go.',
            css: '--form-surface: #d4ed7a; --form-accent: #25320f; padding: 1.5rem; border-radius: 1rem; gap: 1.75rem; font-size: 1.5rem;',
            children: [
              { type: 'field', field: 'output' },
              { type: 'field', field: 'format' },
              { type: 'field', field: 'notify' },
            ],
          },
        ],
      },
    ],
  },
  '--form-surface: #10151d; --form-accent: #d4ed7a; padding: clamp(1rem, 4%, 3rem); border-radius: 1rem; font-family: "Geist Sans", sans-serif; font-size: 3rem; font-weight: 600; line-height: 1.1;',
)

const SWEEP_AXES = [
  {
    name: 'resolution',
    label: 'Resolution',
    description: 'Pixels on the longest edge.',
    values: [512, 2048, 512],
  },
  {
    name: 'samples',
    label: 'Samples',
    description: 'Samples per candidate.',
    values: [32, 128, 32],
  },
  {
    name: 'iterations',
    label: 'Iterations',
    description: 'Refinement passes per candidate.',
    values: [10, 30, 10],
  },
  {
    name: 'seed',
    label: 'Seed',
    description: 'Repeat each combination with a distinct seed.',
    values: [1, 4, 1],
  },
]
const SWEEP_FIELDS: Record<string, DemoField> = {
  name: { type: 'string', label: 'Sweep name', default: 'Quality / cost frontier' },
  ...Object.fromEntries(
    SWEEP_AXES.flatMap((axis) =>
      ['start', 'stop', 'step'].map((bound, index) => [
        `${axis.name}_${bound}`,
        {
          type: 'number',
          label: bound === 'start' ? 'From' : bound === 'stop' ? 'Through' : 'Step',
          default: axis.values[index],
        },
      ]),
    ),
  ),
  concurrency: { type: 'number', label: 'Maximum parallel runs', default: 16 },
  budget: { type: 'duration', label: 'Time limit per run', default: 1800 },
  fail_fast: { type: 'boolean', label: 'Stop on first failure', default: false },
}

export const ParameterMatrix = showcase(
  'Parameter matrix',
  'Build a sweep across four independent axes. Compare the bounds, set your limits, and find the useful edge.',
  SWEEP_FIELDS,
  {
    type: 'stack',
    css: 'gap: 2rem; padding-top: 1.5rem;',
    children: [
      { type: 'field', field: 'name', css: 'max-width: 36rem;' },
      {
        type: 'grid',
        columns: { base: 1, sm: 2, md: 4 },
        align: 'rows',
        gap: 'sm',
        css: 'column-gap: 1rem;',
        children: SWEEP_AXES.map((axis, index) => ({
          type: 'section',
          label: axis.label,
          description: axis.description,
          css: `--form-surface: ${['#f5cbbb', '#ecd99f', '#c8ded7', '#ccd8ef'][index]}; --form-accent: #342d29; padding: 1rem; border-top: 4px solid #342d29; font-size: 1.25rem;`,
          children: ['start', 'stop', 'step'].map((bound) => ({
            type: 'field',
            field: `${axis.name}_${bound}`,
            css: 'font-family: "Geist Mono", monospace; padding-block: 0.375rem;',
          })),
        })),
      },
      {
        type: 'section',
        label: 'Run limits',
        css: '--form-surface: #342d29; --form-accent: #ecd99f; padding: 1.5rem; font-size: 1.25rem;',
        children: [
          {
            type: 'grid',
            columns: { base: 1, md: 2, lg: 3 },
            css: 'gap: 1.5rem; max-width: 56rem;',
            children: [
              { type: 'field', field: 'concurrency' },
              { type: 'field', field: 'budget' },
              { type: 'field', field: 'fail_fast' },
            ],
          },
        ],
      },
    ],
  },
  '--form-surface: #faf6ef; --form-accent: #342d29; padding: clamp(1rem, 4%, 3rem); border: 2px solid #342d29; font-family: "Geist Sans", sans-serif; font-size: 3rem; font-weight: 700; line-height: 1.1;',
)

const BRIEF_FIELDS: Record<string, DemoField> = {
  name: { type: 'string', label: 'Experiment title', default: 'A quieter city' },
  question: {
    type: 'string',
    textarea: true,
    label: 'Research question',
    default:
      'How does the placement of green corridors affect street-level noise during the morning commute?',
  },
  dataset: { type: 'string', label: 'Dataset', default: './data/morning-commute.csv' },
  region: {
    type: 'dropdown',
    label: 'Study area',
    options: ['Central district', 'Riverside', 'Whole city'],
    default: 'Central district',
  },
  trials: { type: 'number', label: 'Trials', default: 48 },
  confidence: {
    type: 'dropdown',
    label: 'Confidence level',
    options: ['90%', '95%', '99%'],
    default: '95%',
  },
  hypothesis: {
    type: 'string',
    textarea: true,
    label: 'Working hypothesis',
    default:
      'Continuous green corridors will reduce noise more consistently than isolated pockets with the same total area.',
  },
  output: { type: 'string', label: 'Results directory', default: './results/green-corridors' },
  notify: { type: 'boolean', label: 'Notify when results are ready', default: true },
}

export const ResearchBrief = showcase(
  'Research brief',
  'A quieter city. An experiment in green corridors, the morning commute, and the spaces in between.',
  BRIEF_FIELDS,
  {
    type: 'grid',
    columns: { base: 1, md: 3 },
    css: 'column-gap: clamp(1rem, 4%, 3rem); row-gap: 2.5rem; padding-top: 1.5rem; font-family: "Geist Sans", sans-serif;',
    children: [
      { type: 'field', field: 'name', span: { md: 3 }, css: 'max-width: 42rem;' },
      {
        type: 'field',
        field: 'question',
        span: { md: 2 },
        css: 'padding-top: 1.5rem; border-top: 2px solid #733d38;',
      },
      {
        type: 'section',
        label: 'Evidence',
        css: '--form-surface: #e5dacb; --form-accent: #733d38; padding: 1.5rem; gap: 1.25rem; font-family: serif; font-size: 1.5rem;',
        children: [
          { type: 'field', field: 'dataset', css: 'font-family: "Geist Sans", sans-serif;' },
          { type: 'field', field: 'region', css: 'font-family: "Geist Sans", sans-serif;' },
        ],
      },
      {
        type: 'section',
        label: 'Method',
        css: 'gap: 1.25rem; padding-top: 1.5rem; border-top: 2px solid #733d38; font-size: 1.5rem; font-family: serif;',
        children: [
          { type: 'field', field: 'trials', css: 'font-family: "Geist Sans", sans-serif;' },
          { type: 'field', field: 'confidence', css: 'font-family: "Geist Sans", sans-serif;' },
        ],
      },
      {
        type: 'field',
        field: 'hypothesis',
        span: { md: 2 },
        css: 'padding-top: 1.5rem; border-top: 2px solid #733d38;',
      },
      {
        type: 'section',
        label: 'Delivery',
        span: { md: 3 },
        css: '--form-surface: #733d38; --form-accent: #f7efe2; padding: 1.5rem; font-family: serif; font-size: 1.5rem;',
        children: [
          {
            type: 'grid',
            columns: { base: 1, md: [2, 1] },
            css: 'gap: 1.5rem; font-family: "Geist Sans", sans-serif;',
            children: [
              { type: 'field', field: 'output' },
              { type: 'field', field: 'notify' },
            ],
          },
        ],
      },
    ],
  },
  '--form-surface: #f7efe2; --form-accent: #733d38; padding: clamp(1rem, 4%, 3rem); border-top: 8px solid #733d38; font-family: serif; font-size: 3rem; font-weight: 400; line-height: 1.1;',
)

export const RenderStudioNarrow: StoryObj<typeof WorkflowExample> = {
  ...RenderStudio,
  decorators: [
    (Story) => (
      <div style={{ maxWidth: 360 }}>
        <Story />
      </div>
    ),
  ],
}

export const YamlPlayground: StoryObj<typeof WorkflowExample> = {
  ...ResearchBrief,
  args: { ...ResearchBrief.args, showYaml: true },
  parameters: {
    ...ResearchBrief.parameters,
    docs: {
      ...ResearchBrief.parameters?.['docs'],
      description: {
        story:
          'Edit real workflow YAML and apply it to rebuild the preview. Invalid YAML keeps the last working form visible. Copy YAML to use the same input definitions in a workflow.',
      },
    },
  },
}

export const InvalidYaml: StoryObj<typeof WorkflowExample> = {
  args: {
    workflowYaml: 'on:\n  execute:\n    inputs: [unfinished',
    allowLayoutCSS: true,
    showYaml: true,
  },
}
