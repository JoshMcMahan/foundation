import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, screen, userEvent } from 'storybook/test'
import type { Json } from './editorFields'
import { InputDialog } from './InputDialog'

const meta: Meta<typeof InputDialog> = {
  title: 'UI/Workflow/InputDialog',
  component: InputDialog,
  parameters: {
    docs: {
      description: {
        component:
          'Every setting of one workflow input, in sections that open where the input already ' +
          'sets something. The type picker offers every input type the workflow schema takes.',
      },
    },
  },
  args: {
    isNew: false,
    siblings: [],
    allowStep: false,
    onSave: () => {},
    onClose: () => {},
    yaml: { onSave: () => {} },
    view: 'form',
  },
  argTypes: {
    definition: { control: 'object' },
    yaml: {
      control: false,
      description: 'How the host saves the input as YAML; without it the dialog is only a form.',
    },
    view: { control: 'inline-radio', options: ['form', 'yaml'] },
  },
}
export default meta

const INPUTS: Json = {
  dataset: { type: 'string', label: 'Dataset' },
  epochs: { type: 'number', label: 'Epochs', default: 10 },
}

export const EditString: StoryObj<typeof InputDialog> = {
  args: {
    name: 'dataset',
    definition: {
      type: 'string',
      label: 'Dataset',
      description: 'Where the training data lives.',
      default: '/data/images',
      placeholder: '/data/path',
    },
    inputs: INPUTS,
  },
}

export const EditDropdown: StoryObj<typeof InputDialog> = {
  args: {
    name: 'gpus',
    definition: {
      type: 'dropdown',
      label: 'GPUs',
      options: [
        { label: 'One', value: 1 },
        { label: 'Two', value: 2 },
        { label: 'Four', value: 4 },
      ],
      default: 2,
    },
    inputs: INPUTS,
  },
}

/** A new input picks its type first; a compute target takes only the shared settings. */
export const NewComputeTarget: StoryObj<typeof InputDialog> = {
  args: {
    name: 'target',
    definition: { type: 'compute-target' },
    isNew: true,
    inputs: INPUTS,
  },
}

/** An input's settings as YAML, with its comments kept. */
export const EditAsYaml: StoryObj<typeof InputDialog> = {
  args: {
    name: 'epochs',
    definition: { type: 'number', label: 'Epochs', default: 10 },
    inputs: INPUTS,
    view: 'yaml',
    yaml: {
      source:
        'on:\n  execute:\n    inputs:\n      epochs:\n        # How long to train\n        type: number\n        label: Epochs\n        default: 10\n',
      path: ['epochs'],
      onSave: () => {},
    },
  },
}

/** A wizard page that repeats: a title per copy, and the fewest and most copies a person can have. */
export const EditRepeatablePage: StoryObj<typeof InputDialog> = {
  args: {
    name: 'workers',
    allowStep: true,
    definition: {
      type: 'step',
      title: ['GPU workers', 'CPU workers'],
      description: 'One page per worker site.',
      multi: true,
      min: 1,
      max: 3,
      options: { nodes: { type: 'number', label: 'Nodes', default: 2 } },
    },
    inputs: INPUTS,
  },
}

/** A dropdown whose options depend on another input: a list for each of its values. */
export const EditKeyedDropdown: StoryObj<typeof InputDialog> = {
  args: {
    name: 'region',
    definition: {
      type: 'dropdown',
      label: 'Region',
      // biome-ignore lint/suspicious/noTemplateCurlyInString: a workflow expression
      'option-key': '${{ inputs.provider }}',
      options: { east: ['east-1', 'east-2'], west: ['west-1'] },
    },
    inputs: { provider: { type: 'dropdown', options: ['east', 'west'] } },
  },
}

/** A list repeats its template's fields per row, and can start with rows of its own. */
export const EditList: StoryObj<typeof InputDialog> = {
  args: {
    name: 'hosts',
    definition: {
      type: 'list',
      label: 'Hosts',
      template: {
        $meta: {
          layout: {
            type: 'grid',
            columns: { base: 1, sm: [2, 1] },
            children: [
              { type: 'field', field: 'host' },
              { type: 'field', field: 'port' },
            ],
          },
        },
        host: { type: 'string', label: 'Host' },
        port: { type: 'number', label: 'Port' },
      },
      default: [{ host: 'one', port: 22 }],
    },
    inputs: INPUTS,
  },
}

/** A length of time with a box that sends a set value instead, such as -1 for none. */
export const EditDurationOptOut: StoryObj<typeof InputDialog> = {
  args: {
    name: 'idle',
    definition: {
      type: 'duration',
      label: 'Suspend idle nodes after',
      default: 600,
      disableLabel: 'Never suspend idle nodes',
      disableValue: -1,
    },
    inputs: INPUTS,
  },
}

/** Checkboxes with a description each, and options that tick others along with them. */
export const EditLinkedCheckboxes: StoryObj<typeof InputDialog> = {
  args: {
    name: 'features',
    definition: {
      type: 'checkbox-group',
      label: 'Features',
      options: [
        { value: 'gpu', label: 'GPU', description: 'Adds GPU drivers.' },
        { value: 'cuda', label: 'CUDA', description: 'Needs the GPU drivers.' },
      ],
      implies: { cuda: ['gpu'] },
    },
    inputs: INPUTS,
  },
}

/** A new type: the settings the old one had that the new one doesn't take go, as the note says. */
export const ChangingType: StoryObj<typeof InputDialog> = {
  args: {
    name: 'dataset',
    definition: { type: 'string', label: 'Dataset', placeholder: '/data/path' },
    inputs: INPUTS,
  },
  play: async () => {
    const type = await screen.findByRole('combobox', { name: 'Type' })
    await userEvent.clear(type)
    await userEvent.type(type, 'Number')
    await userEvent.click(await screen.findByRole('option', { name: 'Number' }))
    await expect(await screen.findByText(/new type doesn/i)).toBeVisible()
  },
}

/** With a delete button and the host's "open when adding" switch in its footer. */
export const WithFooter: StoryObj<typeof InputDialog> = {
  args: {
    name: 'dataset',
    definition: { type: 'string', label: 'Dataset' },
    inputs: INPUTS,
    onDelete: () => {},
    openOnAdd: { open: true, onChange: () => {} },
  },
}

export const LegacyLayoutHints: StoryObj<typeof InputDialog> = {
  args: {
    name: 'dataset',
    definition: { type: 'string', label: 'Dataset', width: '50%', 'anchor-below': true },
    inputs: INPUTS,
  },
  parameters: {
    docs: {
      description: {
        story:
          'Existing layout hints survive edits. New layout is authored on the input container through $meta.layout.',
      },
    },
  },
}
