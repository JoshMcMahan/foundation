import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { FormProvider, useForm } from 'react-hook-form'
import { expect, screen, waitFor } from 'storybook/test'
import { Editor } from './Editor'
import { EditorField } from './EditorField'
import { addEditorLanguages } from './languages'
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
          'validation, completion, hover and formatting from a bundled worker. ' +
          'The editor colors every language Monaco has; `addEditorLanguages` adds a ' +
          'language service and its workers, such as TypeScript. ' +
          '`readOnly` shows code to read: selectable, copyable and focusable, with no cursor.',
      },
    },
  },
  argTypes: {
    readOnly: { control: 'boolean' },
    disabled: { control: 'boolean' },
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

/** Text to read: it selects and copies, and takes focus from the keyboard, but shows no cursor or
 * current line, and ends at its last line. */
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

const SCRIPT = Array.from(
  { length: 60 },
  (_, i) => `echo "step ${i + 1}" && ./run.sh --stage ${i + 1} --retries 3`,
).join('\n')

/** A file to read, as the file explorer previews one: a longer file scrolls inside the view, then
 * the page scrolls on past it. */
export const ReadOnlyFile: StoryObj<typeof Editor> = {
  args: {
    readOnly: true,
    language: 'shell',
    value: SCRIPT,
    ariaLabel: 'run-all.sh',
    height: 320,
    width: 640,
    fontSize: 12,
    minimap: { enabled: false },
    overviewRulerLanes: 0,
  },
}

const PYTHON = [
  '"""Normalize station observations before the ensemble runs."""',
  'import argparse',
  'from pathlib import Path',
  '',
  '',
  'def normalize(src: Path, out: Path) -> None:',
  '    df = read_table(src)',
  '    df["temperature"] = df.temperature - 273.15',
  '    df.to_parquet(out / src.name, index=False)',
  '',
  '',
  'if __name__ == "__main__":',
  '    parser = argparse.ArgumentParser()',
  '    parser.add_argument("inputs", nargs="+", type=Path)',
  '    args = parser.parse_args()',
  '    for path in args.inputs:',
  '        normalize(path, Path("normalized"))',
  '',
].join('\n')

// The tokens a host with an older palette of its own sets on the root; it leaves the rest, the
// code colors among them, to theme.css.
const HOST_TOKENS = new Set([
  '--theme-app-bg',
  '--theme-app',
  '--theme-accent',
  '--theme-accent-text',
  '--theme-placeholder',
  '--theme-panel-bg',
  '--theme-muted-panel-bg',
  '--theme-muted-text-color',
  '--theme-border',
  '--theme-input-bg',
  '--theme-input-disabled-bg',
  '--theme-hover',
  '--theme-link',
])

/** A file to read under a host that sets only its own surface tokens and switches mode by
 * `color-scheme`: the code colors come from theme.css's defaults for the mode in effect. Switch
 * the toolbar's Mode to check both. */
export const HostSetsSomeTokens: StoryObj<typeof Editor> = {
  args: {
    readOnly: true,
    language: 'python',
    value: PYTHON,
    ariaLabel: 'preprocess.py',
    height: 420,
    width: 720,
    fontSize: 12,
    minimap: { enabled: false },
    overviewRulerLanes: 0,
  },
  decorators: [
    (Story) => {
      // The preview decorator has just applied every token; take back the ones this host leaves.
      const root = document.documentElement.style
      for (const name of [...root].filter((n) => n.startsWith('--theme-'))) {
        if (!HOST_TOKENS.has(name)) {
          root.removeProperty(name)
        }
      }
      return <Story />
    },
  ],
}

/** Greyed out and read-only, as a disabled field is. The editor beside it keeps its colors:
 * Monaco's theme is page-wide, so a disabled editor greys out on its own. */
export const Disabled: StoryObj<typeof Editor> = {
  args: { language: 'yaml', value: YAML_VALUE, disabled: true, height: 200, width: 640 },
  argTypes: { disabled: { control: 'boolean' } },
  render: (args) => (
    <div className="flex flex-col gap-4">
      <Editor {...args} />
      <Editor language="yaml" value={YAML_VALUE} height={200} width={640} />
    </div>
  ),
}

/** Bash, which workflow fields suggest, colors as shell does. */
export const Bash: StoryObj<typeof Editor> = {
  args: {
    language: 'bash',
    value: 'for file in *.log; do\n  gzip "$file"\ndone\n',
    height: 120,
    width: 640,
  },
}

/** Go, which the editor colors with no setup: every Monaco language is, each fetched once shown. */
export const Go: StoryObj<typeof Editor> = {
  args: {
    language: 'go',
    value: 'package main\n\nimport "fmt"\n\nfunc main() {\n\tfmt.Println("hello")\n}\n',
    height: 160,
    width: 640,
  },
}

let typeScriptAdded = false
const tsWorker = () =>
  new Worker(new URL('monaco-editor/language/typescript/ts.worker.js', import.meta.url), {
    type: 'module',
  })

/** TypeScript's language service, which the host adds with `addEditorLanguages` and its worker:
 * the text is colored without it, and with it the editor finds the type error. */
export const AddedLanguageService: StoryObj<typeof Editor> = {
  args: {
    language: 'typescript',
    path: 'file:///greet.ts',
    value: "function greet(name: string): string {\n  return 'Hello, ' + name\n}\n\ngreet(42)\n",
    height: 160,
    width: 640,
  },
  loaders: [
    () => {
      if (!typeScriptAdded) {
        typeScriptAdded = true
        addEditorLanguages({
          load: () => import('monaco-editor/languages/features/typescript/register'),
          workers: { typescript: tsWorker, javascript: tsWorker },
        })
      }
    },
  ],
}

/** The host hands back the text on every change, as a form does: the cursor stays where it is. */
export const Controlled: StoryObj<typeof Editor> = {
  args: { language: 'shell', height: 200, width: 640, ariaLabel: 'Script' },
  render: function Render(args) {
    const [value, setValue] = useState('echo "hello"\n')
    return (
      <div className="flex flex-col gap-2">
        <Editor {...args} value={value} onChange={setValue} />
        <pre className="text-xs text-(--theme-muted-text-color)">{value}</pre>
      </div>
    )
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

interface EditorFieldArgs {
  label: string
  description: string
  help: string
  labelPosition: 'top' | 'left'
  disabled: boolean
}

function EditorFieldDemo({ label, description, help, labelPosition, disabled }: EditorFieldArgs) {
  const form = useForm({ defaultValues: { setup: 'module load cuda\nnvidia-smi\n' } })
  return (
    <FormProvider {...form}>
      <div className="w-[640px]">
        <EditorField
          field={{ type: 'editor', name: 'setup', ...(description && { description }) }}
          label={label}
          help={help || undefined}
          labelPosition={labelPosition}
          disabled={disabled}
        />
      </div>
    </FormProvider>
  )
}

/** A form's code field. Its label names the editor, and its description and help describe it, as
 *  any field's do; a click on the label puts the cursor in the editor. */
export const InAField: StoryObj<EditorFieldArgs> = {
  args: {
    label: 'Setup script',
    description: 'Runs on each node before the job starts.',
    help: 'Bash, with the cluster’s modules on the path.',
    labelPosition: 'top',
    disabled: false,
  },
  argTypes: { labelPosition: { control: 'inline-radio', options: ['top', 'left'] } },
  render: (args) => <EditorFieldDemo {...args} />,
  play: async ({ args }) => {
    const editor = await waitFor(
      () => screen.getByRole('textbox', { name: new RegExp(args.label) }),
      { timeout: 10000 },
    )
    if (args.description) {
      await expect(editor).toHaveAccessibleDescription(new RegExp(args.description))
    }
    await expect(document.querySelector(`label[for="${editor.id}"]`)).toBeNull()
  },
}
