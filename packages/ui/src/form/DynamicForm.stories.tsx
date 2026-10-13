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

const CHOICE_JSONS = {
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

/** Options with labels of their own or numeric values, each picked by its default. */
export const Choices: StoryObj<typeof DynamicForm> = {
  args: {
    formJSONs: CHOICE_JSONS,
    initialValues: { precision: 'bf16', workers: 2, features: ['log'] },
    skipValueParse: true,
    workflowForm: true,
  },
}

/** Options in groups, one setting another field as it's chosen, and a switch whose states have
 *  names of their own. */
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
  },
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
    await userEvent.click(canvas.getByRole('button', { name: 'Go to next step' }))
    await userEvent.click(canvas.getByRole('button', { name: 'Go to next step' }))
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
          },
          nodes: { type: 'number', label: 'Nodes', default: 2 },
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
