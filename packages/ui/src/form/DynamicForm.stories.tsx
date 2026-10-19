import type { Meta, StoryObj } from '@storybook/react-vite'
import { useForm, useFormState } from 'react-hook-form'
import { expect, fn, screen, userEvent, waitFor, within } from 'storybook/test'
import { Button } from '../components/Button'
import { DynamicForm, type FormValues } from './Form'

const meta: Meta<typeof DynamicForm> = {
  title: 'UI/Form/DynamicForm',
  component: DynamicForm,
  argTypes: {
    allowLayoutCSS: {
      control: 'boolean',
      description: 'Host opt-in for validated CSS declarations on layout nodes.',
    },
    formJSONs: { control: 'object', description: 'Input definitions and optional $meta.layout.' },
    serverErrors: {
      control: 'object',
      description:
        'Fields the server rejected, by any path (`hosts[0].cpus`, `#/hosts/0/cpus`), each with an optional message.',
    },
    onValuesChange: { action: 'values changed' },
  },
  parameters: {
    docs: {
      description: {
        component:
          'The form engine gates on the wasm expression parser: run ' +
          '`pnpm -F @parallelworks/workflow-parser generate-wasm` once locally ' +
          'or the form stays on its loading state.',
      },
    },
  },
}
export default meta

const FORM_JSONS = {
  settings: {
    type: 'group',
    label: 'Cluster settings',
    description: 'Every node in the cluster starts with these.',
    items: {
      name: {
        type: 'string',
        label: 'Name',
        default: 'demo-cluster',
        tooltip: 'A unique cluster name',
      },
      nodes: { type: 'number', label: 'Nodes', default: 2, min: 1, max: 16 },
      memory: {
        type: 'number',
        label: 'Memory (MB)',
        default: 16384,
        step: 1024,
        min: 0,
        thousandsSeparator: true,
      },
      monitoring: {
        type: 'boolean',
        label: 'Enable monitoring',
        default: true,
      },
      size: {
        type: 'dropdown',
        label: 'Instance size',
        default: 'medium',
        options: ['small', 'medium', 'large'],
      },
      walltime: { type: 'duration', label: 'Walltime', default: '1h30m' },
      scheduler: {
        type: 'radio',
        label: 'Scheduler',
        default: 'slurm',
        options: ['slurm', 'pbs'],
      },
    },
  },
}

export const ClusterSettings: StoryObj<typeof DynamicForm> = {
  args: {
    formJSONs: FORM_JSONS,
    initialValues: {},
    skipValueParse: true,
  },
}

/** The server rejected fields the form sent: each shows the server's message under it, or asks to
 * check the value, until the person changes it. They never hold back a submit. */
export const ServerErrors: StoryObj<typeof DynamicForm> = {
  args: {
    ...ClusterSettings.args,
    serverErrors: [
      { path: 'settings.name', message: 'A cluster with this name already exists.' },
      { path: '#/settings/nodes' },
    ],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const name = await canvas.findByRole('textbox', { name: /Name/ }, { timeout: 5000 })
    await waitFor(() =>
      expect(name).toHaveAccessibleDescription('A cluster with this name already exists.'),
    )
    await expect(canvas.getByText('Check this value.')).toBeVisible()
    await userEvent.type(name, '-2')
    await waitFor(() => expect(name).not.toHaveAttribute('aria-invalid'))
    await expect(canvas.getByText('Check this value.')).toBeVisible()
  },
}

/** A field with neither `optional` nor a default needs a value: a submit, or Next in a wizard, says
 * so under each empty one, and the message goes as the person fills it. */
export const RequiredFields: StoryObj<typeof DynamicForm> = {
  args: {
    formJSONs: {
      name: { type: 'string', label: 'Cluster name' },
      size: { type: 'dropdown', label: 'Instance size', options: ['small', 'medium', 'large'] },
      notes: { type: 'string', label: 'Notes', optional: true },
      nodes: { type: 'number', label: 'Nodes', default: 2 },
    },
    initialValues: {},
    skipValueParse: true,
    onSubmit: fn(),
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement)
    const name = await canvas.findByRole('textbox', { name: /Cluster name/ }, { timeout: 5000 })
    await userEvent.click(canvas.getByRole('button', { name: 'Submit' }))
    await waitFor(() => expect(name).toHaveAccessibleDescription('Enter a value.'))
    await expect(canvas.getAllByText('Enter a value.')).toHaveLength(2)
    await expect(args.onSubmit).not.toHaveBeenCalled()
    await userEvent.type(name, 'demo')
    await waitFor(() => expect(name).not.toHaveAttribute('aria-invalid'))
    await expect(canvas.getAllByText('Enter a value.')).toHaveLength(1)
  },
}

function HostFormStory() {
  const form = useForm<FormValues>()
  const { isDirty } = useFormState({ control: form.control })
  return (
    <div className="flex flex-col gap-3">
      <DynamicForm form={form} formJSONs={FORM_JSONS} initialValues={{}} skipValueParse />
      <div className="flex items-center gap-3 text-[13px]">
        <span>{isDirty ? 'Unsaved changes' : 'No changes'}</span>
        <Button variant="secondary" onClick={() => form.reset()}>
          Reset
        </Button>
      </div>
    </div>
  )
}

/** A host that owns the form reads its state and drives it: here, whether it has changes, and a
 * reset back to the values it loaded. */
export const HostOwnedForm: StoryObj<typeof DynamicForm> = {
  render: () => <HostFormStory />,
}

/** Inputs with a `width` (pixels, or a share of the row) sit side by side, label on top unless the
 * form sets `labelPosition`; below 24rem each share takes the whole row and a pixel width stays. */
export const WithWidths: StoryObj<typeof DynamicForm> = {
  args: {
    formJSONs: {
      name: { type: 'string', label: 'Job name', default: 'train-resnet', width: '50%' },
      queue: {
        type: 'dropdown',
        label: 'Queue',
        default: 'gpu',
        options: ['cpu', 'gpu', 'debug'],
        width: '25%',
      },
      priority: { type: 'number', label: 'Priority', default: 5, width: '25%' },
      dataset: { type: 'string', label: 'Dataset', default: '/data/images' },
      epochs: { type: 'number', label: 'Epochs', default: 10, width: '33%' },
      batch: { type: 'number', label: 'Batch size', default: 64, width: '33%' },
      rate: { type: 'number', label: 'Learning rate', default: 0.001, width: '33%' },
      seed: { type: 'number', label: 'Seed', default: 42, width: 160 },
    },
    initialValues: {},
    skipValueParse: true,
  },
}

/** `anchor-below` stacks an input under the one shown before it, in that one's column, and the form's own
 * `$meta.labelPosition` holds for inputs in rows too. */
export const AnchoredBelow: StoryObj<typeof DynamicForm> = {
  args: {
    formJSONs: {
      $meta: { labelPosition: 'left' },
      cluster: { type: 'string', label: 'Cluster', default: 'gpu-cluster', width: '50%' },
      partition: { type: 'string', label: 'Partition', default: 'batch', width: '50%' },
      account: { type: 'string', label: 'Account', default: 'research', 'anchor-below': true },
      notes: { type: 'string', label: 'Notes' },
    },
    initialValues: {},
    skipValueParse: true,
  },
}

export const CompactLabels: StoryObj<typeof DynamicForm> = {
  args: {
    formJSONs: FORM_JSONS,
    initialValues: {},
    skipValueParse: true,
    labelPosition: 'top',
    spaceCompact: true,
  },
}

/** Text, a secret that keeps its saved value behind dots until it's typed over, and notes. */
export const TextAndSecret: StoryObj<typeof DynamicForm> = {
  args: {
    formJSONs: {
      host: { type: 'string', label: 'Host', placeholder: 'db.internal' },
      token: { type: 'password', label: 'Token', default: 'saved-token' },
      notes: { type: 'textarea', label: 'Notes', optional: true },
    },
    initialValues: { token: 'saved-token' },
    skipValueParse: true,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const token = await canvas.findByLabelText('Token')
    await expect(token).toHaveAttribute('type', 'password')
    await userEvent.click(canvas.getByRole('button', { name: 'Show value' }))
    await expect(token).toHaveAttribute('type', 'text')
    await expect(canvas.getByRole('textbox', { name: 'Notes' })).toBeInTheDocument()
  },
}

const CHOICE_JSONS = {
  heading: { type: 'label', text: 'Training run' },
  precision: {
    type: 'radio',
    label: 'Precision',
    options: ['fp16', { label: 'Brain float', value: 'bf16' }],
    default: 'bf16',
  },
  workers: { type: 'radio', label: 'Workers', options: [1, 2, 4], default: 2 },
  features: {
    type: 'checkbox-group',
    label: 'Features',
    options: [
      { label: 'Logging', value: 'log' },
      { label: 'Metrics', value: 'metrics', description: 'Sends usage numbers' },
      'tracing',
    ],
    default: ['log'],
  },
}

/** Options with labels of their own or numeric values, each picked by its default, under a label
 *  field's heading. An option's description is read after its name. */
export const Choices: StoryObj<typeof DynamicForm> = {
  args: {
    formJSONs: CHOICE_JSONS,
    initialValues: { precision: 'bf16', workers: 2, features: ['log'] },
    skipValueParse: true,
    workflowForm: true,
  },
  play: async ({ canvasElement }) => {
    const metrics = await within(canvasElement).findByRole('checkbox', { name: 'Metrics' })
    await expect(metrics).toHaveAccessibleDescription('Sends usage numbers')
  },
}

/** Options in groups, one setting another field as it's chosen, and a switch whose states have
 *  names of their own, shown after its label. */
export const GroupedChoicesAndNamedStates: StoryObj<typeof DynamicForm> = {
  args: {
    formJSONs: {
      region: {
        type: 'dropdown',
        label: 'Region',
        secondaryField: 'zone',
        options: [
          {
            category: 'Americas',
            options: [
              { label: 'US East', value: 'us-east', secondaryValue: 'us-east-1a' },
              { label: 'US West', value: 'us-west', secondaryValue: 'us-west-2b' },
            ],
          },
          {
            category: 'Europe',
            options: [
              { label: 'EU Central', value: 'eu-central', secondaryValue: 'eu-central-1a' },
            ],
          },
        ],
      },
      zone: { type: 'string', label: 'Zone', disabled: true },
      visibility: {
        type: 'boolean',
        label: 'Visibility',
        default: 'PRIVATE',
        options: { onOption: 'PUBLIC', offOption: 'PRIVATE' },
      },
    },
    initialValues: { visibility: 'PRIVATE' },
    workflowForm: true,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(
      await canvas.findByRole('combobox', { name: 'Region' }, { timeout: 5000 }),
    )
    await userEvent.click(await screen.findByRole('option', { name: 'EU Central' }))
    await waitFor(() =>
      expect(canvas.getByRole('textbox', { name: 'Zone' })).toHaveValue('eu-central-1a'),
    )
    await expect(canvas.getByText('Private')).toBeVisible()
    // The state's name follows the label, outside the switch's name.
    const visibility = canvas.getByRole('switch', { name: 'Visibility' })
    await userEvent.click(canvas.getByText('Visibility'))
    await expect(visibility).toBeChecked()
    await expect(canvas.getByText('Public')).toBeVisible()
  },
}

const BOOLEAN_FIELDS = {
  notify: { type: 'boolean', label: 'Email me when the run ends', default: true },
  spot: {
    type: 'boolean',
    label: 'Use spot instances',
    default: false,
    tooltip: 'Spot instances cost less but can be reclaimed at any time.',
    description: 'A reclaimed node restarts its task from the last checkpoint.',
  },
  gpu: {
    type: 'boolean',
    label: 'Attach GPUs',
    default: true,
    disabled: true,
    disabled_message: 'This queue has no GPUs.',
    description: 'Set by the queue.',
  },
  visibility: {
    type: 'boolean',
    label: 'Visibility',
    default: 'PRIVATE',
    options: { onOption: 'PUBLIC', offOption: 'PRIVATE' },
  },
  storage: {
    type: 'object',
    label: 'Storage',
    options: {
      keep: {
        type: 'boolean',
        label: 'Keep scratch files after the run',
        default: false,
        tooltip: 'Kept files count toward the project quota.',
      },
    },
  },
  advanced: {
    type: 'group',
    label: 'Advanced',
    items: {
      verbose: { type: 'boolean', label: 'Verbose logs', default: false },
    },
  },
}

/** Each switch comes before its label, as a switch reads. A click on the label flips it, its help
 *  and description are read with it, and a disabled one dims its label too. */
export const Booleans: StoryObj<typeof DynamicForm> = {
  args: {
    formJSONs: BOOLEAN_FIELDS,
    initialValues: {
      notify: true,
      spot: false,
      gpu: true,
      visibility: 'PRIVATE',
      storage: { keep: false },
      verbose: false,
    },
    skipValueParse: true,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const spot = await canvas.findByRole(
      'switch',
      { name: 'Use spot instances' },
      { timeout: 5000 },
    )
    await expect(spot).toHaveAccessibleDescription(
      /reclaimed node restarts.*Spot instances cost less/,
    )
    await userEvent.click(canvas.getByText('Use spot instances'))
    await waitFor(() => expect(spot).toBeChecked())
    await userEvent.click(canvas.getByText('Use spot instances'))
    await waitFor(() => expect(spot).not.toBeChecked())
    const gpu = canvas.getByRole('switch', { name: 'Attach GPUs' })
    await expect(gpu).toBeDisabled()
    await userEvent.click(canvas.getByText('Attach GPUs'), { pointerEventsCheck: 0 })
    await expect(gpu).toBeChecked()
  },
}

/** The same switches with their labels over the fields around them. */
export const BooleansStacked: StoryObj<typeof DynamicForm> = {
  args: { ...Booleans.args, labelPosition: 'top' },
}

const SWITCH_RUN_FIELDS = {
  notify: {
    type: 'boolean',
    label: 'Email me when the run finishes',
    default: true,
    tooltip: 'Sent to the address on your profile.',
  },
  scratch: {
    type: 'boolean',
    label: 'Keep scratch files',
    default: false,
    description: 'Kept files count toward the project quota.',
  },
  gpus: {
    type: 'boolean',
    label: 'Use GPUs',
    default: true,
    disabled: true,
    disabled_message: 'This queue has no GPUs.',
    description: 'Set by the queue.',
  },
  advanced: {
    type: 'group',
    label: 'Advanced',
    items: {
      verbose: { type: 'boolean', label: 'Verbose logging', default: false },
      retries: { type: 'number', label: 'Retries', default: 2, min: 0, max: 5 },
    },
  },
}

/** The rectangles of an element's text, its letters' height rather than its lines'. */
function textRects(element: Element) {
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
  const rects: DOMRect[] = []
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (node.textContent?.trim()) {
      const range = document.createRange()
      range.selectNodeContents(node)
      rects.push(...range.getClientRects())
    }
  }
  return rects
}

/** What a field's row shows, as the eye sees it: its switch or its input's border, and the text
 *  of its label and description, not the boxes around them. */
function shownExtent(canvasElement: HTMLElement, name: string) {
  const canvas = within(canvasElement)
  const control = canvas.queryByRole('switch', { name }) ?? canvas.getByRole('textbox', { name })
  const labelledBy = control.getAttribute('aria-labelledby')
  const label = labelledBy
    ? document.getElementById(labelledBy)
    : (control as HTMLInputElement).labels?.[0]
  const description = document.getElementById(control.id.replace(/control$/, 'description'))
  // A text field's border is its input's parent's; a switch is its own.
  const box = control.getAttribute('role') === 'switch' ? control : control.parentElement
  const rects = [
    ...(box ? [box.getBoundingClientRect()] : []),
    ...(label ? textRects(label) : []),
    ...(description ? textRects(description) : []),
  ]
  return {
    top: Math.min(...rects.map((rect) => rect.top)),
    bottom: Math.max(...rects.map((rect) => rect.bottom)),
  }
}

/** Asserts that the space the eye sees between consecutive rows is the same within 2px, after a
 *  switch or a description, before a switch or a text field, on each side of a section's heading;
 *  that the rule sits that far over the section's first row; and that the heading sits clearly
 *  further from the rows above it. */
async function expectEvenRows(canvasElement: HTMLElement) {
  const canvas = within(canvasElement)
  await canvas.findByRole('switch', { name: 'Verbose logging' }, { timeout: 5000 })
  const row = (name: string) => shownExtent(canvasElement, name)
  const runs = [
    [row('Email me when the run finishes'), row('Keep scratch files'), row('Use GPUs')],
    [row('Verbose logging'), row('Retries')],
  ]
  const gaps = runs.flatMap((run) =>
    run.slice(1).map((next, index) => next.top - (run[index]?.bottom ?? next.top)),
  )
  const [first = 0] = gaps
  for (const gap of gaps) {
    await expect(Math.abs(gap - first)).toBeLessThanOrEqual(2)
  }
  // The heading belongs to the rows under it: it sits clearly further from the rows above than
  // its rule sits from its first row, which is as far as the rows sit apart.
  const heading = canvas.getByRole('heading', { name: 'Advanced' })
  const rule = heading.closest('[data-section-header]')?.getBoundingClientRect().bottom ?? 0
  const above = Math.min(...textRects(heading).map((rect) => rect.top)) - row('Use GPUs').bottom
  const below = row('Verbose logging').top - rule
  await expect(above - below).toBeGreaterThanOrEqual(8)
  await expect(Math.abs(below - first)).toBeLessThanOrEqual(2)
}

/** A run of switches: one with help, one with a description, a disabled one with a description,
 *  then a section with a switch and a number. Every row leaves the same room before the next, as
 *  text fields do, and a description adds only its own lines. */
export const SwitchRun: StoryObj<typeof DynamicForm> = {
  args: {
    formJSONs: SWITCH_RUN_FIELDS,
    initialValues: { notify: true, scratch: false, gpus: true, verbose: false, retries: 2 },
    skipValueParse: true,
  },
  play: async ({ canvasElement }) => expectEvenRows(canvasElement),
}

/** The same run with the labels over the fields. */
export const SwitchRunStacked: StoryObj<typeof DynamicForm> = {
  args: { ...SwitchRun.args, labelPosition: 'top' },
  play: async ({ canvasElement }) => expectEvenRows(canvasElement),
}

const WORKER_OPTIONS = {
  nodes: { type: 'number', label: 'Nodes', default: 2, width: '50%' },
  queue: {
    type: 'dropdown',
    label: 'Queue',
    default: 'gpu',
    options: ['gpu', 'cpu'],
    width: '50%',
  },
}

/** A repeated page with many copies: the wizard says which page it's on, a bar marks every page,
 *  and the list of them jumps back to one already seen. */
export const RepeatedPageMany: StoryObj<typeof DynamicForm> = {
  args: {
    formJSONs: {
      $meta: { wizard: { mode: 'wizard', navigation: { allowJump: true } } },
      sites: {
        type: 'step',
        title: 'Site',
        multi: true,
        options: WORKER_OPTIONS,
      },
      review: {
        type: 'step',
        title: 'Review',
        options: { note: { type: 'string', label: 'Note' } },
      },
    },
    initialValues: { sites: Array.from({ length: 24 }, () => ({ nodes: 2, queue: 'gpu' })) },
    skipValueParse: true,
    workflowForm: true,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const steps = await canvas.findByRole('navigation', { name: 'Steps' }, { timeout: 5000 })
    await expect(steps).toHaveTextContent('Step 1 of 25')
    await userEvent.click(canvas.getByRole('button', { name: 'Next' }))
    await userEvent.click(canvas.getByRole('button', { name: 'Next' }))
    await waitFor(() => expect(steps).toHaveTextContent('Step 3 of 25'))
    await userEvent.click(within(steps).getByRole('button', { name: 'All steps' }))
    const list = within(await screen.findByRole('dialog', { name: 'Steps' }))
    await userEvent.click(list.getByRole('button', { name: /Step 1: Site 1/ }))
    await waitFor(() => expect(steps).toHaveTextContent('Step 1 of 25'))
    // However many pages, nothing scrolls sideways.
    const page = canvasElement.ownerDocument.documentElement
    await expect(page.scrollWidth).toBeLessThanOrEqual(page.clientWidth)
  },
}

/** The same at a small phone's width. Inline, as story files don't feed the compiled classes. */
export const RepeatedPageManyNarrow: StoryObj<typeof DynamicForm> = {
  ...RepeatedPageMany,
  decorators: [
    (Story) => (
      <div style={{ maxWidth: 320 }}>
        <Story />
      </div>
    ),
  ],
}

/** A page with `multi` repeats: each copy is a page, its values a row under the page's name, with Add after
 * the last copy and Remove on each, inside its `min` and `max`. A title list gives each copy its own. */
export const RepeatedPage: StoryObj<typeof DynamicForm> = {
  args: {
    formJSONs: {
      $meta: { wizard: { mode: 'wizard', submitLabel: 'Launch', navigation: { allowJump: true } } },
      workers: {
        type: 'step',
        title: ['GPU workers', 'CPU workers'],
        description: 'One page per worker site.',
        multi: true,
        max: 3,
        options: WORKER_OPTIONS,
      },
      review: {
        type: 'step',
        title: 'Review',
        options: { notify: { type: 'boolean', label: 'Email me when it finishes', default: true } },
      },
    },
    initialValues: {
      workers: [
        { nodes: 4, queue: 'gpu' },
        { nodes: 8, queue: 'cpu' },
      ],
    },
    skipValueParse: true,
  },
}

/** Without a `min`, a repeated page starts with no copies, as a list starts with no rows: its page offers the first. */
export const RepeatedPageEmpty: StoryObj<typeof DynamicForm> = {
  args: {
    formJSONs: {
      $meta: { wizard: { mode: 'wizard', submitLabel: 'Launch' } },
      workers: {
        type: 'step',
        title: 'Worker site',
        description: 'One page per worker site.',
        multi: true,
        options: WORKER_OPTIONS,
      },
      review: {
        type: 'step',
        title: 'Review',
        options: { notify: { type: 'boolean', label: 'Email me when it finishes', default: true } },
      },
    },
    initialValues: {},
    skipValueParse: true,
  },
}

const WIZARD_IN_A_GROUP = {
  name: { type: 'string', label: 'Job name', default: 'train-resnet' },
  setup: {
    type: 'group',
    label: 'Cluster setup',
    items: {
      $meta: { wizard: { mode: 'wizard' } },
      compute: {
        type: 'step',
        title: 'Compute',
        options: {
          partition: {
            type: 'dropdown',
            label: 'Partition',
            default: 'gpu',
            options: ['gpu', 'cpu'],
            tooltip: 'The queue the job waits in.',
          },
          nodes: { type: 'number', label: 'Nodes', default: 2, tooltip: 'Machines the job spans.' },
        },
      },
      storage: {
        type: 'step',
        title: 'Storage',
        options: { scratch: { type: 'number', label: 'Scratch (GB)', default: 100 } },
      },
    },
  },
}

/** A group's fields can be a wizard of their own, paged inside the form around it. */
export const WizardInAGroup: StoryObj<typeof DynamicForm> = {
  args: {
    formJSONs: WIZARD_IN_A_GROUP,
    initialValues: {},
    skipValueParse: true,
  },
}

const HELP_FIELDS = {
  name: {
    type: 'string',
    label: 'Run name',
    default: 'experiment-24',
    tooltip: 'Shown in the run list.\nLowercase letters, numbers and dashes.',
  },
  nodes: {
    type: 'number',
    label: 'Nodes',
    default: 4,
    tooltip: 'Machines the run spans. More finish sooner but wait longer for a slot.',
  },
  queue: {
    type: 'dropdown',
    label: 'Queue',
    default: 'gpu',
    options: ['cpu', 'gpu', 'debug'],
    tooltip: 'Debug runs start at once but stop after 30 minutes.',
  },
  precision: {
    type: 'radio',
    label: 'Precision',
    options: ['half', 'single'],
    tooltip: 'Half precision uses half the memory.',
  },
  notify: {
    type: 'boolean',
    label: 'Notify when complete',
    default: true,
    tooltip: 'Sends an email when the run ends, however it ends.',
  },
  storage: {
    type: 'object',
    label: 'Storage',
    tooltip: 'Where the run reads and writes files.',
    options: {
      scratch: {
        type: 'number',
        label: 'Scratch (GB)',
        default: 100,
        tooltip: 'Wiped when the run ends.',
      },
    },
  },
}

/** Every field's help opens over its label as Tab reaches its control, and the control reads it
 *  as its description. Tab passes over each field's ?; a section's ? keeps its Tab stop, having no
 *  control to be read with. */
export const HelpOnKeyboardFocus: StoryObj<typeof DynamicForm> = {
  args: { formJSONs: HELP_FIELDS, initialValues: {}, skipValueParse: true },
  // Room above the first field for its help, which opens over the label.
  decorators: [
    (Story) => (
      <div style={{ paddingTop: 64 }}>
        <Story />
      </div>
    ),
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const name = await canvas.findByRole('textbox', { name: /Run name/ }, { timeout: 5000 })
    await expect(name).toHaveAccessibleDescription(/Shown in the run list/)
    await userEvent.tab()
    await expect(name).toHaveFocus()
    await waitFor(() => expect(screen.getByRole('dialog')).toHaveTextContent(/run list/))
  },
}

const LAYOUT_FIELDS = {
  $meta: {
    layout: {
      type: 'stack',
      gap: 'lg',
      children: [
        { type: 'field', field: 'name' },
        {
          type: 'grid',
          columns: { base: 1, md: [2, 1] },
          align: 'rows',
          gap: 'lg',
          children: [
            {
              type: 'section',
              label: 'Resources',
              description: 'Choose the capacity for this run.',
              children: [
                { type: 'field', field: 'queue' },
                {
                  type: 'grid',
                  columns: { base: 1, sm: 2 },
                  children: [
                    { type: 'field', field: 'nodes' },
                    { type: 'field', field: 'walltime' },
                  ],
                },
              ],
            },
            {
              type: 'section',
              label: 'Accounting',
              children: [
                { type: 'field', field: 'account' },
                { type: 'field', field: 'notify' },
              ],
            },
          ],
        },
      ],
    },
  },
  name: { type: 'string', label: 'Run name', default: 'Experiment 24' },
  queue: { type: 'dropdown', label: 'Queue', options: ['cpu', 'gpu', 'debug'], default: 'gpu' },
  nodes: { type: 'number', label: 'Nodes', default: 4 },
  walltime: { type: 'duration', label: 'Walltime', default: 7200 },
  account: { type: 'string', label: 'Account', default: 'research' },
  notify: { type: 'boolean', label: 'Notify when complete', default: true },
  notes: { type: 'string', label: 'Notes', optional: true },
}

export const ExplicitLayout: StoryObj<typeof DynamicForm> = {
  args: {
    formJSONs: LAYOUT_FIELDS,
    initialValues: {
      name: 'Experiment 24',
      queue: 'gpu',
      nodes: 4,
      walltime: 7200,
      account: 'research',
      notify: true,
    },
    skipValueParse: true,
    workflowForm: true,
  },
}

export const ExplicitLayoutNarrow: StoryObj<typeof DynamicForm> = {
  ...ExplicitLayout,
  decorators: [
    (Story) => (
      <div style={{ maxWidth: 320 }}>
        <Story />
      </div>
    ),
  ],
}

export const TopLabelsInNarrowColumns: StoryObj<typeof DynamicForm> = {
  args: {
    initialValues: { workers: 8, retries: 3 },
    skipValueParse: true,
    formJSONs: {
      $meta: {
        layout: {
          type: 'grid',
          columns: 2,
          children: [
            { type: 'field', field: 'workers' },
            { type: 'field', field: 'retries' },
          ],
        },
      },
      workers: { type: 'number', label: 'Maximum number of concurrent workers' },
      retries: { type: 'number', label: 'Retry limit' },
    },
  },
  decorators: [
    (Story) => (
      <div style={{ maxWidth: 360 }}>
        <Story />
      </div>
    ),
  ],
  // A label that wraps moves neither its required mark off its last word nor its control below
  // its neighbor's.
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const workers = await canvas.findByRole(
      'textbox',
      { name: /Maximum number of concurrent workers/ },
      { timeout: 5000 },
    )
    const retries = canvas.getByRole('textbox', { name: /Retry limit/ })
    for (const input of [workers, retries]) {
      const label = canvasElement.querySelector(`label[for="${input.id}"]`)
      await expect(label?.querySelector('[aria-hidden="true"]')).toHaveTextContent('*')
    }
    await expect(workers.getBoundingClientRect().top).toBe(retries.getBoundingClientRect().top)
  },
}

export const IndependentSections: StoryObj<typeof DynamicForm> = {
  ...ExplicitLayout,
  args: {
    ...ExplicitLayout.args,
    formJSONs: {
      ...LAYOUT_FIELDS,
      $meta: {
        layout: {
          ...LAYOUT_FIELDS.$meta.layout,
          children: LAYOUT_FIELDS.$meta.layout.children.map((node) =>
            node.type === 'grid' ? { ...node, align: 'independent' } : node,
          ),
        },
      },
    },
  },
}

export const AlignedRowsLongDescription: StoryObj<typeof DynamicForm> = {
  ...ExplicitLayout,
  args: {
    ...ExplicitLayout.args,
    formJSONs: {
      ...LAYOUT_FIELDS,
      $meta: {
        layout: {
          ...LAYOUT_FIELDS.$meta.layout,
          children: LAYOUT_FIELDS.$meta.layout.children.map((node) =>
            node.type === 'grid'
              ? {
                  ...node,
                  children: node.children?.map((section) =>
                    section.label === 'Accounting'
                      ? {
                          ...section,
                          description:
                            'Choose the account to charge for this run. Check that it has enough capacity for the resources you selected.',
                        }
                      : section,
                  ),
                }
              : node,
          ),
        },
      },
    },
  },
}

export const AlignedRowsValidation: StoryObj<typeof DynamicForm> = {
  ...ExplicitLayout,
  args: {
    ...ExplicitLayout.args,
    formJSONs: {
      ...LAYOUT_FIELDS,
      walltime: { ...LAYOUT_FIELDS.walltime, min: 10000 },
      project: { type: 'string', label: 'Project' },
      $meta: {
        layout: {
          ...LAYOUT_FIELDS.$meta.layout,
          children: LAYOUT_FIELDS.$meta.layout.children.map((node) =>
            node.type === 'grid'
              ? {
                  ...node,
                  children: node.children?.map((section) => ({
                    ...section,
                    children: [
                      ...section.children,
                      { type: 'field', field: section.label === 'Resources' ? 'notes' : 'project' },
                    ],
                  })),
                }
              : node,
          ),
        },
      },
    },
  },
}

export const AlignedRowsConditional: StoryObj<typeof DynamicForm> = {
  ...ExplicitLayout,
  args: {
    ...ExplicitLayout.args,
    formJSONs: {
      ...LAYOUT_FIELDS,
      // biome-ignore lint/suspicious/noTemplateCurlyInString: Workflow expressions are evaluated by the engine.
      account: { ...LAYOUT_FIELDS.account, hidden: '${{ !inputs.notify }}' },
    },
  },
}

const CSS_LAYOUT_FIELDS = {
  ...LAYOUT_FIELDS,
  $meta: {
    layout: {
      type: 'grid',
      columns: { base: 1, md: [2, 1] },
      css: 'gap: 1.25rem; padding: 0.5rem;',
      children: [
        { type: 'field', field: 'name', css: 'max-width: 28rem;' },
        { type: 'field', field: 'account' },
      ],
    },
  },
}

export const CustomLayoutCSS: StoryObj<typeof DynamicForm> = {
  ...ExplicitLayout,
  args: { ...ExplicitLayout.args, allowLayoutCSS: true, formJSONs: CSS_LAYOUT_FIELDS },
}

export const CustomLayoutCSSDisabled: StoryObj<typeof DynamicForm> = {
  ...CustomLayoutCSS,
  args: { ...CustomLayoutCSS.args, allowLayoutCSS: false },
}

export const RejectedLayoutCSS: StoryObj<typeof DynamicForm> = {
  ...CustomLayoutCSS,
  args: {
    ...CustomLayoutCSS.args,
    formJSONs: {
      ...CSS_LAYOUT_FIELDS,
      $meta: {
        layout: { ...CSS_LAYOUT_FIELDS.$meta.layout, css: 'gap: 1.25rem; position: fixed;' },
      },
    },
  },
}

export const LayoutSpans: StoryObj<typeof DynamicForm> = {
  args: {
    initialValues: {},
    skipValueParse: true,
    formJSONs: {
      ...LAYOUT_FIELDS,
      $meta: {
        layout: {
          type: 'grid',
          columns: { base: 1, sm: 2, lg: 3 },
          gap: 'lg',
          children: [
            { type: 'field', field: 'name', span: { sm: 2, lg: 3 } },
            { type: 'field', field: 'queue' },
            { type: 'field', field: 'nodes' },
            { type: 'field', field: 'walltime', span: { sm: 2, lg: 1 } },
          ],
        },
      },
    },
  },
}

export const LayoutConditionalFields: StoryObj<typeof DynamicForm> = {
  args: {
    initialValues: { advanced: false, account: 'research', name: 'Experiment 24' },
    skipValueParse: true,
    workflowForm: true,
    formJSONs: {
      $meta: {
        layout: {
          type: 'stack',
          children: [
            { type: 'field', field: 'advanced' },
            {
              type: 'grid',
              columns: { base: 1, sm: 2 },
              children: [
                { type: 'field', field: 'name' },
                {
                  type: 'section',
                  label: 'Accounting',
                  children: [{ type: 'field', field: 'account' }],
                },
              ],
            },
          ],
        },
      },
      advanced: { type: 'boolean', label: 'Show accounting' },
      name: { type: 'string', label: 'Run name' },
      // biome-ignore lint/suspicious/noTemplateCurlyInString: Workflow expressions are evaluated by the engine.
      account: { type: 'string', label: 'Account', hidden: '${{ !inputs.advanced }}' },
    },
  },
}

export const LayoutInWizardPage: StoryObj<typeof DynamicForm> = {
  args: {
    initialValues: {},
    skipValueParse: true,
    formJSONs: {
      $meta: { wizard: { mode: 'wizard' } },
      setup: { type: 'step', title: 'Configure the run', options: LAYOUT_FIELDS },
      review: {
        type: 'step',
        title: 'Review',
        options: { comment: { type: 'string', label: 'Comment' } },
      },
    },
  },
}

export const LayoutInGroup: StoryObj<typeof DynamicForm> = {
  args: {
    initialValues: {},
    skipValueParse: true,
    formJSONs: { settings: { type: 'group', label: 'Run settings', items: LAYOUT_FIELDS } },
  },
}

export const InvalidLayoutFallback: StoryObj<typeof DynamicForm> = {
  args: {
    initialValues: {},
    skipValueParse: true,
    formJSONs: { ...LAYOUT_FIELDS, $meta: { layout: { type: 'field', field: 'removed_input' } } },
  },
}

export const LayoutCSSBoundary: StoryObj<typeof DynamicForm> = {
  args: {
    allowLayoutCSS: true,
    initialValues: { name: 'Oversized surface' },
    skipValueParse: true,
    formJSONs: {
      $meta: {
        layout: {
          type: 'field',
          field: 'name',
          css: 'width: 256rem; max-width: 256rem; padding: 1rem; background-color: #d4ed7a;',
        },
      },
      name: { type: 'string', label: 'Name' },
    },
  },
  parameters: {
    docs: {
      description: {
        story:
          'Oversized authored content stays inside the form. The neighboring application control remains visible and interactive.',
      },
    },
  },
  render: (args) => (
    <div
      style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: '1rem' }}
    >
      <DynamicForm {...args} />
      <div>
        <label htmlFor="outside-control">Application setting</label>
        <input id="outside-control" defaultValue="Outside the form" style={{ width: '100%' }} />
      </div>
    </div>
  ),
}

export const ExcessiveLayoutFallback: StoryObj<typeof DynamicForm> = {
  args: {
    initialValues: { name: 'Still editable' },
    skipValueParse: true,
    formJSONs: {
      $meta: {
        layout: {
          type: 'stack',
          children: Array.from({ length: 129 }, () => ({ type: 'stack', children: [] })),
        },
      },
      name: { type: 'string', label: 'Name' },
    },
  },
}
