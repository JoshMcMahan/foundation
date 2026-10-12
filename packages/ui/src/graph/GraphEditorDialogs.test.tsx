// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { dumpYaml } from '@parallelworks/workflow-parser'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { UIProvider, type WorkflowJsonRef } from '../components/Provider'
import type { GraphEdit } from '../editing'
import { STEP_YAML_PATH } from '../editor/settingsYaml'
import { GRAPH_EDITOR_STRINGS } from './editorStrings'
import { JobDialog, StepDialog } from './GraphEditorDialogs'
import type { Json } from './records'

vi.mock('../components/Provider', async (importOriginal) =>
  (await import('../test/engine')).mockEngineHooks(importOriginal),
)
// Monaco can't run in jsdom; a textarea stands in, labelled by the model path.
vi.mock('../editor/Monaco', () => ({
  default: ({
    value,
    onChange,
    path,
  }: {
    value?: string
    onChange?: (value: string) => void
    path?: string
  }) => <textarea aria-label={path} value={value} onChange={(e) => onChange?.(e.target.value)} />,
}))
vi.mock('../components/Dropdown', () => import('../test/DropdownStandIn'))

afterEach(cleanup)

const t = GRAPH_EDITOR_STRINGS

function jobs(workflow: Json): Json {
  return workflow['jobs'] as Json
}

function openJob(workflow: Json, job: string) {
  const onEdit = vi.fn<(edit: GraphEdit) => void>()
  const onClose = vi.fn()
  render(
    <JobDialog
      job={job}
      jobs={jobs(workflow)}
      inputs={undefined}
      workflow={workflow}
      source={dumpYaml(workflow)}
      view="form"
      onEdit={onEdit}
      onClose={onClose}
    />,
  )
  return { onEdit, onClose }
}

function openStep(
  workflow: Json,
  job: string,
  index: number,
  wrap: (dialog: ReactNode) => ReactNode = (dialog) => dialog,
) {
  const onEdit = vi.fn<(edit: GraphEdit) => void>()
  const onClose = vi.fn()
  const steps = (jobs(workflow)[job] as Json)['steps'] as unknown[]
  render(
    wrap(
      <StepDialog
        job={job}
        index={index}
        steps={steps}
        inputs={undefined}
        workflow={workflow}
        usesSuggestions={[]}
        source={dumpYaml(workflow)}
        view="form"
        onEdit={onEdit}
        onClose={onClose}
      />,
    ),
  )
  return { onEdit, onClose }
}

const save = () => fireEvent.click(screen.getByRole('button', { name: 'Save' }))

describe('step dialog', () => {
  it('carries a renamed step ID to every expression that reads the step', () => {
    const workflow = {
      jobs: {
        build: {
          outputs: { image: '${{ needs.build.steps.make.outputs.image }}' },
          steps: [
            { id: 'make', run: 'make' },
            {
              name: 'push',
              run: 'push ${{ steps.make.outputs.image }} ${{ steps.make-all.outputs.x }}',
            },
          ],
        },
        deploy: {
          needs: ['build'],
          steps: [{ run: 'echo ${{ needs.build.steps.make.outputs.image }}' }],
        },
      },
    }
    const { onEdit } = openStep(workflow, 'build', 0)
    fireEvent.change(screen.getByLabelText(t.fields.stepId), { target: { value: 'compile' } })
    save()
    expect(onEdit).toHaveBeenCalledWith({
      type: 'batch',
      edits: [
        { type: 'updateStep', job: 'build', index: 0, set: { id: 'compile' }, unset: [] },
        {
          type: 'updateJob',
          job: 'build',
          set: { outputs: { image: '${{ needs.build.steps.compile.outputs.image }}' } },
        },
        {
          type: 'updateStep',
          job: 'build',
          index: 1,
          set: { run: 'push ${{ steps.compile.outputs.image }} ${{ steps.make-all.outputs.x }}' },
        },
        {
          type: 'updateStep',
          job: 'deploy',
          index: 0,
          set: { run: 'echo ${{ needs.build.steps.compile.outputs.image }}' },
        },
      ],
    })
  })

  it('stays in the form, saying why, while a field it can’t write yet is invalid', async () => {
    const workflow = { jobs: { build: { steps: [{ run: 'make' }] } } }
    openStep(workflow, 'build', 0)
    fireEvent.change(screen.getByLabelText(t.fields.timeout), { target: { value: 'soon' } })
    fireEvent.click(screen.getByRole('button', { name: t.viewYaml }))
    expect(screen.getByText(t.fixFieldsFirst)).toBeInTheDocument()
    expect(screen.queryByLabelText(STEP_YAML_PATH)).toBeNull()
    fireEvent.change(screen.getByLabelText(t.fields.timeout), { target: { value: '5m' } })
    await waitFor(() => expect(screen.queryByText(t.fixFieldsFirst)).toBeNull())
    fireEvent.click(screen.getByRole('button', { name: t.viewYaml }))
    expect(await screen.findByLabelText(STEP_YAML_PATH)).toHaveValue('run: make\ntimeout: 5m\n')
  })

  it('opens a repository step clean, keeping a default file and host it spells out', () => {
    const workflow = {
      jobs: {
        build: {
          steps: [
            {
              name: 'get',
              uses: 'gitlab/team/tools@main',
              with: { $yaml: 'workflow.yaml', $host: 'gitlab.com' },
            },
          ],
        },
      },
    }
    const { onEdit, onClose } = openStep(workflow, 'build', 0)
    save()
    expect(onEdit).not.toHaveBeenCalled()
    expect(onClose).toHaveBeenCalled()
  })
})

describe('a subworkflow step’s inputs', () => {
  const SIZER = {
    on: {
      execute: {
        inputs: {
          hosts: { type: 'list', label: 'Hosts', template: { name: { type: 'string' } } },
          note: { type: 'string', label: 'Note' },
        },
      },
    },
    jobs: { main: { steps: [{ run: 'true' }] } },
  }
  const withResolver =
    (resolve: (ref: WorkflowJsonRef) => Promise<unknown>) => (dialog: ReactNode) => (
      <UIProvider data={{ resolveWorkflowJson: resolve }}>{dialog}</UIProvider>
    )

  it('writes a list typed as JSON as a list, and other text as typed', async () => {
    const workflow = { jobs: { build: { steps: [{ name: 'size', uses: 'workflow/sizer' }] } } }
    const { onEdit } = openStep(
      workflow,
      'build',
      0,
      withResolver(() => Promise.resolve(SIZER)),
    )
    fireEvent.change(await screen.findByLabelText('Hosts'), { target: { value: '["a", "b"]' } })
    fireEvent.change(screen.getByLabelText('Note'), { target: { value: '[draft' } })
    save()
    expect(onEdit).toHaveBeenCalledWith({
      type: 'updateStep',
      job: 'build',
      index: 0,
      set: { with: { hosts: ['a', 'b'], note: '[draft' } },
      unset: [],
    })
  })

  it('reads the workflow’s inputs once typing its name pauses, not on every keystroke', async () => {
    const workflow = { jobs: { build: { steps: [{ name: 'size', uses: 'workflow/s' }] } } }
    const resolve = vi.fn((_: WorkflowJsonRef) => Promise.resolve(SIZER))
    openStep(workflow, 'build', 0, withResolver(resolve))
    const uses = screen.getByLabelText(t.fields.uses)
    fireEvent.change(uses, { target: { value: 'workflow/si' } })
    fireEvent.change(uses, { target: { value: 'workflow/siz' } })
    fireEvent.change(uses, { target: { value: 'workflow/sizer' } })
    expect(await screen.findByLabelText('Hosts')).toBeInTheDocument()
    // Checking the step reads the saved and the final names too; the names typed between aren't read.
    const names = resolve.mock.calls.map(([ref]) => (ref as { name: string }).name)
    expect(names).toContain('sizer')
    expect(names).not.toContain('si')
    expect(names).not.toContain('siz')
  })
})

describe('job dialog', () => {
  it('opens clean, keeping a whole-number timeout and an output’s spacing as written', () => {
    const workflow = {
      jobs: {
        build: {
          ssh: { remoteHost: 'login', 'disconnect-timeout': 30 },
          outputs: { image: '${{needs.build.steps.make.outputs.image}}' },
          steps: [{ id: 'make', run: 'make' }],
        },
      },
    }
    const { onEdit, onClose } = openJob(workflow, 'build')
    save()
    expect(onEdit).not.toHaveBeenCalled()
    expect(onClose).toHaveBeenCalled()
  })

  it('takes the job’s own name back in the YAML view after the form renamed it', () => {
    const workflow = { jobs: { build: { steps: [{ run: 'make' }] }, test: { steps: [] } } }
    openJob(workflow, 'build')
    fireEvent.change(screen.getByLabelText(t.jobName), { target: { value: 'compile' } })
    fireEvent.click(screen.getByRole('button', { name: t.viewYaml }))
    const name = screen.getByLabelText(t.jobName)
    expect(name).toHaveValue('compile')
    fireEvent.change(name, { target: { value: 'build' } })
    expect(screen.queryByText(t.jobExists)).toBeNull()
    fireEvent.change(name, { target: { value: 'test' } })
    expect(screen.getByText(t.jobExists)).toBeInTheDocument()
  })

  it('lets a job without a matrix save past a max-parallel it no longer writes', () => {
    const workflow = {
      jobs: {
        build: {
          strategy: { matrix: { os: ['linux'] }, 'max-parallel': 'lots' },
          steps: [{ run: 'make' }],
        },
      },
    }
    const { onEdit } = openJob(workflow, 'build')
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
    fireEvent.click(screen.getByRole('checkbox', { name: t.fields.matrix }))
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled()
    save()
    expect(onEdit).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'updateJob', job: 'build', unset: ['strategy'] }),
    )
  })
})
