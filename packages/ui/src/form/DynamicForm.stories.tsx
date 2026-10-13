import type { Meta, StoryObj } from '@storybook/react-vite'
import { useForm, useFormState } from 'react-hook-form'
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
    missingFields: {
      control: 'object',
      description: 'Field names the host marks as missing a value, set as `required` errors.',
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

/** The host marks fields it found missing a value: the form sets them as errors, and only those
 * fields draw again. */
export const MissingFields: StoryObj<typeof DynamicForm> = {
  args: {
    ...ClusterSettings.args,
    missingFields: ['name', 'size'],
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
        <button type="button" className="btn" onClick={() => form.reset()}>
          Reset
        </button>
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

/** A repeated page with more copies than the row of step dots holds: the dots scroll, the current one in
 * view. */
export const RepeatedPageMany: StoryObj<typeof DynamicForm> = {
  // A phone's width, where ten steps overflow. Inline, as story files don't feed the compiled classes.
  decorators: [
    (Story) => (
      <div style={{ maxWidth: 360 }}>
        <Story />
      </div>
    ),
  ],
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
    initialValues: { sites: Array.from({ length: 9 }, () => ({ nodes: 2, queue: 'gpu' })) },
    skipValueParse: true,
    workflowForm: true,
  },
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
