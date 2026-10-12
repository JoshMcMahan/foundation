// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { applyGraphEdit, dumpYaml, loadYaml } from '@parallelworks/workflow-parser'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { GRAPH_EDITOR_STRINGS } from './editorStrings'
import { WorkflowSettingsDialog } from './WorkflowSettingsDialog'

vi.mock('../components/Provider', async (importOriginal) =>
  (await import('../test/engine')).mockEngineHooks(importOriginal),
)

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

global.ResizeObserver = class implements ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

afterEach(cleanup)

// Typed values reach the dropdown's owner on blur, which clicking Save causes in a browser.
function type(field: HTMLElement, value: string) {
  fireEvent.change(field, { target: { value } })
  fireEvent.blur(field)
}

const WORKFLOW = {
  permissions: ['*'],
  env: { A: '1' },
  sessions: { app: { redirect: true } },
  on: {
    execute: {
      inputs: { $meta: { labelPosition: 'top' }, x: { type: 'string' } },
    },
  },
  jobs: { main: { steps: [{ run: 'echo' }] } },
}

// The workflow a saved edit leaves.
function saved(workflow: Record<string, unknown>, onEdit: ReturnType<typeof vi.fn>) {
  const edit = onEdit.mock.lastCall?.[0]
  return loadYaml(applyGraphEdit({ yml: dumpYaml(workflow), layout: undefined }, edit).yml) as {
    on: { execute: { inputs: Record<string, unknown> } }
    jobs: { main: { steps: { run: string }[] } }
  }
}

function open(workflow: Record<string, unknown> = WORKFLOW) {
  const onEdit = vi.fn()
  render(<WorkflowSettingsDialog workflow={workflow} onEdit={onEdit} onClose={() => {}} />)
  return onEdit
}

function asOptions(page: unknown): Record<string, unknown> {
  return (page as { options: Record<string, unknown> }).options
}

describe('WorkflowSettingsDialog', () => {
  it('describes each setting', () => {
    open()
    const help = GRAPH_EDITOR_STRINGS.help
    for (const text of [
      help.workflowEnv,
      help.workflowTimeout,
      help.permissions,
      help.sessionName,
      help.sessionType,
      help.promptForName,
      help.sessionRedirect,
      help.useTLS,
      help.useCustomDomain,
      help.openAI,
      help.sessionDetach,
      help.organizationVariables,
      help.userVariables,
      help.labelPosition,
      help.wizard,
    ]) {
      expect(screen.getByText(text)).toBeInTheDocument()
    }
  })

  it('saves only the sections that changed', () => {
    const onEdit = open()
    type(screen.getByDisplayValue('1'), '2')
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(onEdit).toHaveBeenCalledWith({
      type: 'updateWorkflow',
      set: { env: { A: '2' } },
      unset: [],
      inputsMeta: { set: {}, unset: [] },
    })
  })

  it('allows only one redirect across sessions and links', () => {
    open()
    fireEvent.click(screen.getByText('Add link'))
    const names = screen.getAllByLabelText('Name')
    fireEvent.change(names[names.length - 1] as HTMLElement, {
      target: { value: 'docs' },
    })
    fireEvent.change(screen.getByLabelText('An endpoint session'), {
      target: { value: 'app' },
    })
    const redirects = screen.getAllByLabelText('Open when the run starts')
    fireEvent.click(redirects[redirects.length - 1] as HTMLElement)
    expect(screen.getAllByText(GRAPH_EDITOR_STRINGS.oneRedirect).length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
  })

  it('edits the input form layout in the same step, the inputs starting the first page', () => {
    const onEdit = open()
    fireEvent.click(screen.getByText(GRAPH_EDITOR_STRINGS.labelsBeside))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Split into pages' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(onEdit).toHaveBeenCalledWith({
      type: 'batch',
      edits: [
        {
          type: 'updateWorkflow',
          inputsMeta: {
            set: {
              wizard: { mode: 'wizard', navigation: { allowJump: true }, submitLabel: 'Submit' },
            },
            unset: ['labelPosition'],
          },
        },
        {
          type: 'addInput',
          parent: [],
          index: 0,
          name: 'step_1',
          definition: { type: 'step', title: 'Step 1', options: {} },
        },
        { type: 'moveInputs', paths: [['x']], parent: ['step_1'], index: 0 },
      ],
    })
  })

  it('puts a wizard’s inputs back when it is no longer split into pages, with what reads them', () => {
    const paged = {
      on: {
        execute: {
          inputs: {
            $meta: { wizard: { mode: 'wizard', flatten: false } },
            step_1: { type: 'step', title: 'One', options: { x: { type: 'string' } } },
          },
        },
      },
      jobs: { main: { steps: [{ run: 'echo ${{ inputs.step_1.x }}' }] } },
    }
    const onEdit = open(paged)
    fireEvent.click(screen.getByRole('checkbox', { name: 'Split into pages' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    // The inputs move while the wizard still names its pages, so what reads them follows.
    expect(onEdit).toHaveBeenCalledWith({
      type: 'batch',
      edits: [
        { type: 'moveInputs', paths: [['step_1', 'x']], parent: [], index: 0 },
        { type: 'deleteInput', path: ['step_1'] },
        { type: 'updateWorkflow', inputsMeta: { set: {}, unset: ['wizard'] } },
      ],
    })
    const after = saved(paged, onEdit)
    expect(after.on.execute.inputs).toEqual({ x: { type: 'string' } })
    expect(after.jobs.main.steps[0]?.run).toBe('echo ${{ inputs.x }}')
  })

  it('moves what reads a page’s inputs when page names are left in or out', () => {
    const paged = (flatten?: boolean) => ({
      on: {
        execute: {
          inputs: {
            $meta: { wizard: { mode: 'wizard', ...(flatten === false ? { flatten } : {}) } },
            step_1: {
              type: 'step',
              title: 'One',
              options: { x: { type: 'string' }, y: { type: 'number' } },
            },
          },
        },
      },
      jobs: {
        main: {
          steps: [
            {
              run:
                flatten === false
                  ? 'echo ${{ inputs.step_1.x }} ${{ inputs.step_1.y }}'
                  : 'echo ${{ inputs.x }} ${{ inputs.y }}',
            },
          ],
        },
      },
    })
    const named = paged()
    let onEdit = open(named)
    fireEvent.click(screen.getByRole('checkbox', { name: GRAPH_EDITOR_STRINGS.fields.flatten }))
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    let after = saved(named, onEdit)
    expect(after.jobs.main.steps[0]?.run).toBe('echo ${{ inputs.step_1.x }} ${{ inputs.step_1.y }}')
    expect(Object.keys(after.on.execute.inputs)).toEqual(['$meta', 'step_1'])
    expect(Object.keys(asOptions(after.on.execute.inputs['step_1']))).toEqual(['x', 'y'])
    cleanup()
    const unnamed = paged(false)
    onEdit = open(unnamed)
    fireEvent.click(screen.getByRole('checkbox', { name: GRAPH_EDITOR_STRINGS.fields.flatten }))
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    after = saved(unnamed, onEdit)
    expect(after.jobs.main.steps[0]?.run).toBe('echo ${{ inputs.x }} ${{ inputs.y }}')
    expect(Object.keys(asOptions(after.on.execute.inputs['step_1']))).toEqual(['x', 'y'])
  })

  it('keeps an input made from a session’s switch when the same save puts pages back', () => {
    const paged = {
      sessions: { app: {} },
      on: {
        execute: {
          inputs: {
            $meta: { wizard: { mode: 'wizard', flatten: false } },
            step_1: { type: 'step', title: 'One', options: { x: { type: 'string' } } },
          },
        },
      },
      jobs: { main: { steps: [{ run: 'echo' }] } },
    }
    const onEdit = open(paged)
    const session = screen.getByDisplayValue('app').closest('div.flex.items-start') as HTMLElement
    const redirect = within(session)
      .getByRole('checkbox', { name: GRAPH_EDITOR_STRINGS.fields.redirect })
      .closest('.flex-col') as HTMLElement
    fireEvent.click(
      within(redirect).getByRole('button', { name: GRAPH_EDITOR_STRINGS.useExpression }),
    )
    fireEvent.click(within(redirect).getByRole('button', { name: /^New .* input/ }))
    fireEvent.click(
      within(screen.getByRole('dialog', { name: /input/i })).getByRole('button', { name: 'Save' }),
    )
    fireEvent.click(screen.getByRole('checkbox', { name: 'Split into pages' }))
    fireEvent.click(screen.getAllByRole('button', { name: 'Save' }).at(-1) as HTMLElement)
    const after = saved(paged, onEdit)
    const inputs = after.on.execute.inputs
    const made = Object.keys(inputs).find((name) => name !== 'x' && name !== '$meta')
    expect(made).toBeDefined()
    expect(
      (after as unknown as { sessions: { app: { redirect: string } } }).sessions.app.redirect,
    ).toBe(`\${{ inputs.${made} }}`)
  })

  it('keeps each session’s own settings when the one before it is removed', () => {
    open({
      sessions: { one: { redirect: '${{ inputs.open }}' }, two: { redirect: true } },
      jobs: { main: { steps: [{ run: 'echo' }] } },
    })
    const card = (name: string) =>
      screen.getByDisplayValue(name).closest('div.flex.items-start') as HTMLElement
    fireEvent.click(
      within(card('one')).getByRole('button', { name: GRAPH_EDITOR_STRINGS.removeRow }),
    )
    // The first session's redirect was an expression; the second's is still a switch, and on.
    expect(
      within(card('two')).getByRole('checkbox', { name: GRAPH_EDITOR_STRINGS.fields.redirect }),
    ).toBeChecked()
  })

  it('adds permissions and required variables', () => {
    const onEdit = open({ jobs: {} })
    fireEvent.click(screen.getByText('Add permission'))
    type(screen.getByLabelText('Permissions, item 1'), '*')
    fireEvent.click(screen.getByText('Add organization variable'))
    type(screen.getByLabelText('Organization variables, item 1'), 'API_KEY')
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(onEdit).toHaveBeenCalledWith({
      type: 'updateWorkflow',
      set: {
        permissions: ['*'],
        needs: { organizationVariables: ['API_KEY'] },
      },
      unset: [],
      inputsMeta: { set: {}, unset: [] },
    })
  })
})

describe('WorkflowSettingsDialog as YAML', () => {
  it('shows the settings, not the jobs or trigger, and saves edited text', async () => {
    const onEdit = vi.fn()
    render(
      <WorkflowSettingsDialog
        workflow={WORKFLOW}
        source={dumpYaml(WORKFLOW)}
        onEdit={onEdit}
        onClose={() => {}}
      />,
    )
    const text = (await screen.findByLabelText(
      'file:///workflow-settings.yaml',
    )) as HTMLTextAreaElement
    expect(text.value).toContain('permissions:')
    expect(text.value).not.toContain('jobs:')
    fireEvent.change(text, { target: { value: 'timeout: 2h\n' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(onEdit).toHaveBeenCalledWith({
      type: 'setSettingsYaml',
      yaml: 'timeout: 2h\n',
    })
  })

  it('refuses YAML that holds jobs or a trigger, keeping the text rather than losing it on Save', async () => {
    const onEdit = vi.fn()
    render(
      <WorkflowSettingsDialog
        workflow={WORKFLOW}
        source={dumpYaml(WORKFLOW)}
        onEdit={onEdit}
        onClose={() => {}}
      />,
    )
    const text = await screen.findByLabelText('file:///workflow-settings.yaml')
    fireEvent.change(text, { target: { value: 'timeout: 2h\njobs:\n  x: {}\n' } })
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Form' }))
    expect(screen.getByLabelText('file:///workflow-settings.yaml')).toBeInTheDocument()
    expect(onEdit).not.toHaveBeenCalled()
  })

  it('stays in the form while two sessions share a name, rather than dropping one in the YAML', async () => {
    const twice = { ...WORKFLOW, sessions: { app: {}, web: {} } }
    render(
      <WorkflowSettingsDialog
        workflow={twice}
        source={dumpYaml(twice)}
        view="form"
        onEdit={() => {}}
        onClose={() => {}}
      />,
    )
    fireEvent.change(screen.getByDisplayValue('web'), { target: { value: 'app' } })
    fireEvent.click(screen.getByRole('button', { name: 'YAML' }))
    expect(screen.getByText(GRAPH_EDITOR_STRINGS.fixFieldsFirst)).toBeInTheDocument()
    expect(screen.queryByLabelText('file:///workflow-settings.yaml')).toBeNull()
  })

  it('carries what the YAML changed into the form', async () => {
    render(
      <WorkflowSettingsDialog
        workflow={WORKFLOW}
        source={dumpYaml(WORKFLOW)}
        onEdit={() => {}}
        onClose={() => {}}
      />,
    )
    const text = await screen.findByLabelText('file:///workflow-settings.yaml')
    fireEvent.change(text, { target: { value: 'timeout: 2h\n' } })
    fireEvent.click(screen.getByRole('button', { name: 'Form' }))
    expect(screen.getByDisplayValue('2h')).toBeInTheDocument()
  })
})
