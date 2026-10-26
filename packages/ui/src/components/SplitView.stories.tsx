import {
  convertToDynamicForm,
  loadYaml,
  workflowInputsSchema,
} from '@parallelworks/workflow-parser'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { useMemo, useState } from 'react'
import { Editor } from '../editor/Editor'
import { DynamicForm } from '../form/Form'
import { initializeValues } from '../form/lib'
import { DependencyGraphPreview } from '../graph/DependencyGraph'
import { Card } from './Card'
import { SplitView } from './SplitView'

interface Args {
  minPaneWidth: number
  form: boolean
}

const meta: Meta<Args> = {
  title: 'UI/SplitView',
  args: { minPaneWidth: 320, form: true },
  argTypes: {
    minPaneWidth: {
      control: { type: 'number', min: 200, step: 20 },
      description:
        'The narrowest a pane goes; narrower than two of these, one pane shows at a time.',
    },
    form: { description: 'A third pane, the inputs form, takes turns with the preview.' },
  },
}
export default meta

const WORKFLOW = `on:
  execute:
    inputs:
      cases:
        type: number
        label: Load cases
        default: 4
      mesh:
        type: dropdown
        label: Mesh
        default: medium
        options: [coarse, medium, fine]
jobs:
  mesh:
    steps:
      - name: Generate mesh
        run: ./mesh.sh \${{ inputs.mesh }}
  solve:
    needs: [mesh]
    steps:
      - name: Run solver
        run: ./solve.sh
  loads:
    needs: [mesh]
    steps:
      - name: Apply loads
        run: ./loads.sh
  report:
    needs: [solve, loads]
    steps:
      - name: Write report
        run: ./report.sh
`

function parse(source: string) {
  try {
    const loaded = loadYaml(source)
    const workflow = loaded && typeof loaded === 'object' ? (loaded as Record<string, unknown>) : {}
    const formJSONs = convertToDynamicForm(workflowInputsSchema(workflow) ?? {})
    return { workflow, formJSONs, initialValues: initializeValues(formJSONs) ?? {} }
  } catch {
    return { workflow: {}, formJSONs: {}, initialValues: {} }
  }
}

/** A workflow's text beside a preview of it: the editor and the graph each fill their pane, the
 *  editor drops its minimap when the pane is narrow, and the graph refits as the pane resizes. */
function WorkflowBuild({ minPaneWidth, form }: Args) {
  const [source, setSource] = useState(WORKFLOW)
  const { workflow, formJSONs, initialValues } = useMemo(() => parse(source), [source])
  const editor = {
    value: 'yaml' as const,
    label: 'YAML',
    content: (
      <Card size="fill" padding="none" className="min-h-0 flex-1 overflow-hidden">
        <Editor language="yaml" value={source} onChange={setSource} height="100%" />
      </Card>
    ),
  }
  const preview = {
    value: 'preview' as const,
    label: 'Preview',
    content: <DependencyGraphPreview yml={workflow} fill />,
  }
  const inputs = {
    value: 'form' as const,
    label: 'Input form',
    content: (
      <Card size="fill" className="min-h-0 flex-1 overflow-y-auto">
        <DynamicForm
          formJSONs={formJSONs}
          initialValues={initialValues}
          reinitialize
          workflowForm
        />
      </Card>
    ),
  }
  return (
    // A height for the view to fill: here the story's, in a page the space under its header.
    <div className="flex flex-col" style={{ height: 'calc(100dvh - 2rem)' }}>
      <SplitView
        label="Workflow views"
        minPaneWidth={minPaneWidth}
        panes={form ? [editor, preview, inputs] : [editor, preview]}
      />
    </div>
  )
}

/** Where two panes fit, the editor and the preview share the width, with a handle between
 *  them; the switch picks what shows beside the editor. */
export const EditorAndPreview: StoryObj<Args> = {
  render: (args) => <WorkflowBuild {...args} />,
}

/** With one pane beside the editor there is nothing to switch, so no switch shows. */
export const TwoPanes: StoryObj<Args> = {
  args: { form: false },
  render: (args) => <WorkflowBuild {...args} />,
}

/** On a phone one pane shows at a time, at full width, and the switch moves between all three. */
export const Phone: StoryObj<Args> = {
  globals: { viewport: { value: 'mobile1', isRotated: false } },
  render: (args) => <WorkflowBuild {...args} />,
}
