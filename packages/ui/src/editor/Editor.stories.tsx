import type { Meta, StoryObj } from '@storybook/react-vite'
import Editor from './Editor'

const meta: Meta<typeof Editor> = {
  title: 'UI/Editor',
  component: Editor,
  parameters: {
    docs: {
      description: {
        component:
          'Monaco loads lazily on mount. It renders here because monaco-editor ' +
          'and monaco-yaml are devDependencies of this package; consumers must ' +
          'install both optional peers to use `@parallelworks/ui/editor`.',
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
