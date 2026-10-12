import type { Meta, StoryObj } from '@storybook/react-vite'
import Editor from './Editor'
import { configureEditorYaml } from './yaml'

const meta: Meta<typeof Editor> = {
  title: 'UI/Editor',
  component: Editor,
  parameters: {
    docs: {
      description: {
        component:
          'Monaco loads lazily on mount. It renders here because monaco-editor ' +
          'is a devDependency of this package; consumers must install the ' +
          'optional peer to use `@parallelworks/ui/editor`. YAML models get ' +
          'validation, completion, hover and formatting from a bundled worker.',
      },
    },
  },
}
export default meta

const YAML_VALUE = [
  'jobs:',
  '  build:',
  '    steps:',
  '      - name: compile',
  '        run: make build',
  '      - name: test',
  '        run: make test',
  '',
].join('\n')

export const YamlReadOnly: StoryObj<typeof Editor> = {
  args: {
    language: 'yaml',
    value: YAML_VALUE,
    readOnly: true,
    height: 320,
    width: 640,
  },
}

export const YamlEditable: StoryObj<typeof Editor> = {
  args: {
    language: 'yaml',
    value: YAML_VALUE,
    readOnly: false,
    height: 320,
    width: 640,
  },
}

configureEditorYaml([
  {
    uri: 'https://example.com/pipeline.schema.json',
    fileMatch: ['**/pipeline.yaml'],
    schema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        jobs: {
          type: 'object',
          description: 'Jobs to run, keyed by name.',
          additionalProperties: {
            type: 'object',
            additionalProperties: false,
            properties: {
              steps: {
                type: 'array',
                items: {
                  type: 'object',
                  additionalProperties: false,
                  required: ['run'],
                  properties: {
                    name: { type: 'string', description: 'Shown in the run log.' },
                    run: { type: 'string', description: 'The shell command to run.' },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
])

/** Validates against a schema: `timeout` is not allowed and the second step has no `run`. */
export const YamlWithSchema: StoryObj<typeof Editor> = {
  args: {
    language: 'yaml',
    path: 'file:///pipeline.yaml',
    value: [
      'jobs:',
      '  build:',
      '    timeout: 10',
      '    steps:',
      '      - name: compile',
      '        run: make build',
      '      - name: test',
      '',
    ].join('\n'),
    height: 320,
    width: 640,
  },
}

/** Problems found elsewhere, such as in the workflow around a job's YAML, marked on their lines. */
export const YamlWithMarkers: StoryObj<typeof Editor> = {
  args: {
    language: 'yaml',
    value: YAML_VALUE,
    height: 320,
    width: 640,
    markers: [{ line: 6, message: 'This step reads needs.lint, which the job does not list.' }],
  },
}

/** A workflow checked for what its schema can't catch, such as an input read but never defined. */
export const WorkflowWithLint: StoryObj<typeof Editor> = {
  args: {
    language: 'yaml',
    path: 'file:///workflow.yaml',
    lint: true,
    height: 320,
    width: 640,
    value: `on:
  execute:
    inputs:
      target:
        type: string
jobs:
  build:
    steps:
      - run: make TARGET=\${{ inputs.taget }}
`,
  },
}
