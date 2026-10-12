// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import {
  applyGraphEdit,
  dumpYaml,
  type GraphEdit,
  type GraphLayout,
  jobNeeds,
  layoutFromCols,
  loadYaml,
} from '@parallelworks/workflow-parser'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeAll, describe, expect, it, onTestFinished, vi } from 'vitest'
import type { NestedWorkflowText } from '../editor/nestedText'
import { TEST_ACTIONS } from '../test/actions'
import { testEngine } from '../test/engine'

// The components call useWorkflowEngine(), which throws outside a UIProvider carrying one.
vi.mock('../components/Provider', async (importOriginal) =>
  (await import('../test/engine')).mockEngineHooks(importOriginal),
)

// jsdom lacks these; the graph relies on them for connector recompute + fit.
global.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver
global.requestAnimationFrame = (() => 0) as typeof requestAnimationFrame
global.cancelAnimationFrame = (() => {}) as typeof cancelAnimationFrame
// jsdom has no PointerEvent; without it pointer events lose button and coordinates.
if (!('PointerEvent' in window)) {
  Object.defineProperty(window, 'PointerEvent', { value: MouseEvent })
}

vi.mock('react-zoom-pan-pinch', () => ({
  TransformWrapper: ({ children }: { children: unknown }) =>
    typeof children === 'function' ? (children as () => unknown)() : children,
  TransformComponent: ({ children }: { children: ReactNode }) => (
    <div className="react-transform-wrapper">{children}</div>
  ),
}))
vi.mock('framer-motion', () => ({
  AnimatePresence: ({ children }: { children: unknown }) => children,
  motion: new Proxy(
    {},
    {
      get:
        () =>
        ({ children }: { children: unknown }) =>
          children,
    },
  ),
}))
vi.mock('../logviewer', () => ({ LogViewer: () => null }))
// Monaco can't run in jsdom; a textarea stands in, labelled by the model path.
// What the last YAML editor was handed, for the completions that reach past its own text.
const editorProps = vi.hoisted(() => ({}) as { nested?: NestedWorkflowText | undefined })
vi.mock('../editor/Monaco', () => ({
  default: ({
    value,
    onChange,
    path,
    nested,
  }: {
    value?: string
    onChange?: (value: string) => void
    path?: string
    nested?: NestedWorkflowText
  }) => {
    editorProps.nested = nested
    return <textarea aria-label={path} value={value} onChange={(e) => onChange?.(e.target.value)} />
  },
}))
vi.mock('../components/Dropdown', () => import('../test/DropdownStandIn'))
vi.mock('./AnnotationBanner', () => ({ AnnotationBanner: () => null }))

import { suggestionsOf } from '../test/DropdownStandIn'
import { computeGraphLayout, DependencyGraphPreview } from './DependencyGraph'
import type { DependencyGraphEditor, EditorProblem } from './editorApi'
import { GRAPH_EDITOR_STRINGS } from './editorStrings'
import { COLUMN_PITCH } from './gridSpacing'
import type { WorkflowJob } from './types'

afterEach(cleanup)

// jsdom has no hit testing, so each drag names the element under the drop.
let underPointer: Element | null = null
document.elementFromPoint = () => underPointer
afterEach(() => {
  underPointer = null
})

// A real release is followed by a click, which the editor swallows after a drag.
function release(at: [number, number]) {
  act(() => {
    fireEvent.pointerUp(window, { clientX: at[0], clientY: at[1] })
  })
  fireEvent.click(document.body)
}

function job(needs: string[] = [], extra: Record<string, unknown> = {}) {
  return {
    status: 'completed',
    steps: [{ name: 'step', status: 'completed' }],
    needs,
    ...extra,
  } as unknown as WorkflowJob
}

function editor(overrides: Partial<DependencyGraphEditor> = {}) {
  return {
    onEdit: vi.fn(() => undefined),
    canUndo: true,
    canRedo: false,
    onUndo: vi.fn(),
    onRedo: vi.fn(),
    ...overrides,
  } satisfies DependencyGraphEditor
}

const yml = {
  jobs: {
    build: { steps: [{ name: 'compile', run: 'make' }] },
    linux: { needs: ['build'], steps: [{ run: 'x' }] },
    mac: { needs: ['build'], steps: [{ run: 'y' }] },
  },
}

const YML_TEXT = `jobs:
  build:
    steps:
      - name: compile
        run: make
  linux:
    needs:
      - build
    steps:
      - run: x
  mac:
    # macOS runners
    needs:
      - build
    steps:
      - run: y
`

const withInputs = {
  on: {
    execute: {
      inputs: {
        cluster: { type: 'compute-clusters', label: 'Cluster' },
        mode: { type: 'dropdown', options: ['fast', 'slow'] },
      },
    },
  },
  ...yml,
}

// A connection's edit: each new need, then the jobs that gained one moved right of their needs.
function connected(pairs: [string, string][], layout: unknown = expect.any(Object)) {
  return {
    type: 'batch',
    edits: [
      ...pairs.map(([from, to]) => ({ type: 'connect', from, to })),
      {
        type: 'placeAfterNeeds',
        jobs: [...new Set(pairs.map(([, to]) => to))],
        layout,
      },
    ],
  }
}

// Started from the jobs needed instead: they move left of the jobs that now need them.
function connectedFrom(pairs: [string, string][], layout: unknown = expect.any(Object)) {
  return {
    type: 'batch',
    edits: [
      ...pairs.map(([from, to]) => ({ type: 'connect', from, to })),
      {
        type: 'placeBeforeDependents',
        jobs: [...new Set(pairs.map(([from]) => from))],
        dependents: [...new Set(pairs.map(([, to]) => to))],
        layout,
      },
    ],
  }
}

function jobRow(name: string): HTMLElement {
  return document.querySelector(`[data-dag-job="${name}"]`) as HTMLElement
}

/** A dialog field, found by its label: the nearest element around it that holds its input. */
function field(label: string): HTMLElement {
  let element: HTMLElement | null =
    screen.getAllByText(label, { selector: 'span, label' })[0] ?? null
  // Not a select: the Insert a value menu beside a label is one.
  while (element && !element.querySelector('input, textarea')) {
    element = element.parentElement
  }
  return element as HTMLElement
}

/** What a typed field offers from its list. */
// The suggestions a field offers, as the dropdown stand-in lists them.
// The editor loads lazily; once it has, every later graph draws it at once.
beforeAll(async () => {
  await import('./GraphEditor')
  render(<DependencyGraphPreview yml={yml} editor={editor()} />)
  await screen.findByRole('button', { name: GRAPH_EDITOR_STRINGS.resetLayout })
  cleanup()
})

describe('DependencyGraphPreview editor', () => {
  it('renders no editor controls without an editor', () => {
    render(<DependencyGraphPreview yml={yml} />)
    expect(screen.queryByRole('button', { name: 'Undo' })).toBeNull()
    expect(document.querySelector('[data-dag-job]')).toBeNull()
  })

  it('wires the toolbar to the editor', () => {
    const e = editor()
    render(<DependencyGraphPreview yml={yml} editor={e} />)
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    expect(e.onUndo).toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Redo' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Reset layout' })).toBeDisabled()
    fireEvent.click(screen.getByText('Matrix job'))
    expect(e.onEdit).toHaveBeenCalledWith({ type: 'addJob', matrix: true })
  })

  it('places each job where its position in the YAML says', () => {
    const placed = {
      jobs: {
        a: { position: { column: 1, row: 0 }, steps: [{ run: 'a' }] },
        b: { position: { column: 0, row: 0 }, steps: [{ run: 'b' }] },
      },
    }
    render(<DependencyGraphPreview yml={placed} editor={editor()} />)
    expect(screen.getByRole('button', { name: 'Reset layout' })).toBeEnabled()
    expect(
      [...document.querySelectorAll('[data-dag-job]')].map((el) => el.getAttribute('data-dag-job')),
    ).toEqual(['b', 'a'])
  })

  it('makes job rows draggable and gives multi-job boxes a grip', () => {
    render(<DependencyGraphPreview yml={yml} editor={editor()} />)
    const rows = [...document.querySelectorAll('[data-dag-job]')].map((el) =>
      el.getAttribute('data-dag-job'),
    )
    expect(rows).toEqual(['build', 'linux', 'mac'])
    expect(
      screen.getAllByRole('button', {
        name: 'Drag to move these jobs together',
      }),
    ).toHaveLength(1)
  })

  it('still toggles steps on a click that does not drag', () => {
    render(<DependencyGraphPreview yml={yml} editor={editor()} />)
    const row = document.querySelector('[data-dag-job="build"]') as HTMLElement
    const toggle = within(row).getByRole('button', { name: 'Build' })
    fireEvent.pointerDown(toggle, { button: 0, clientX: 10, clientY: 10 })
    fireEvent.pointerMove(window, { clientX: 11, clientY: 11 })
    fireEvent.pointerUp(window, { clientX: 11, clientY: 11 })
    fireEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
  })

  it('deletes a job dropped on the trash, swallowing the click', () => {
    const e = editor()
    render(<DependencyGraphPreview yml={yml} editor={e} />)
    const row = document.querySelector('[data-dag-job="build"]') as HTMLElement
    const toggle = within(row).getByRole('button', { name: 'Build' })
    fireEvent.pointerDown(toggle, { button: 0, clientX: 100, clientY: 100 })
    act(() => {
      fireEvent.pointerMove(window, { clientX: 50, clientY: 50 })
    })
    expect(screen.getByText('Drop here to delete')).toBeInTheDocument()
    // jsdom lays nothing out, so the trash zone's rect sits at the origin.
    act(() => {
      fireEvent.pointerMove(window, { clientX: 0, clientY: 0 })
      fireEvent.pointerUp(window, { clientX: 0, clientY: 0 })
    })
    fireEvent.click(toggle)
    expect(e.onEdit).toHaveBeenCalledWith({
      type: 'deleteJob',
      jobs: ['build'],
    })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByText('Drop here to delete')).toBeNull()
  })

  it('opens the job menu on right-click', () => {
    const e = editor()
    render(<DependencyGraphPreview yml={yml} editor={e} />)
    const row = document.querySelector('[data-dag-job="mac"]') as HTMLElement
    fireEvent.contextMenu(row, { clientX: 5, clientY: 5 })
    fireEvent.click(screen.getByText('Make matrix'))
    expect(e.onEdit).toHaveBeenCalledWith({
      type: 'setMatrix',
      job: 'mac',
      variables: [['value', [1, 2]]],
    })
  })

  it('takes focus back after an edit from a menu, so undo keys still reach the graph', async () => {
    const e = editor()
    render(<DependencyGraphPreview yml={yml} editor={e} />)
    const row = document.querySelector('[data-dag-job="mac"]') as HTMLElement
    fireEvent.contextMenu(row, { clientX: 5, clientY: 5 })
    fireEvent.click(screen.getByText('Make matrix'))
    const graph = document.querySelector('[tabindex="-1"]') as HTMLElement
    await waitFor(() => expect(graph).toHaveFocus())
    fireEvent.keyDown(graph, { key: 'z', metaKey: true })
    expect(e.onUndo).toHaveBeenCalledOnce()
  })

  it('takes focus back when a job dialog closes', async () => {
    render(<DependencyGraphPreview yml={yml} editor={editor()} />)
    const row = document.querySelector('[data-dag-job="mac"]') as HTMLElement
    fireEvent.contextMenu(row, { clientX: 5, clientY: 5 })
    fireEvent.click(screen.getByText('Edit job'))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(document.querySelector('[tabindex="-1"]')).toHaveFocus())
  })

  it('edits a job through its dialog as one edit', () => {
    const e = editor()
    render(<DependencyGraphPreview yml={yml} editor={e} />)
    const row = document.querySelector('[data-dag-job="mac"]') as HTMLElement
    fireEvent.contextMenu(row, { clientX: 5, clientY: 5 })
    fireEvent.click(screen.getByText('Edit job'))
    const name = screen.getByLabelText('Job name')
    fireEvent.change(name, { target: { value: 'linux' } })
    expect(screen.getByText('A job with this name already exists.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
    fireEvent.change(name, { target: { value: 'macos' } })
    fireEvent.click(screen.getByLabelText('linux'))
    fireEvent.change(screen.getByLabelText('Time limit'), {
      target: { value: 'soon' },
    })
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Time limit'), {
      target: { value: '10m' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(e.onEdit).toHaveBeenCalledWith({
      type: 'updateJob',
      job: 'mac',
      name: 'macos',
      set: { needs: ['build', 'linux'], timeout: '10m' },
      unset: [],
    })
  })

  it('opens the step editor from a step and saves its fields', () => {
    const e = editor()
    render(<DependencyGraphPreview yml={yml} editor={e} />)
    const row = document.querySelector('[data-dag-job="build"]') as HTMLElement
    fireEvent.click(within(row).getByRole('button', { name: 'Build' }))
    fireEvent.click(screen.getByTestId('compile'))
    fireEvent.change(screen.getByLabelText('Commands'), {
      target: { value: 'make\nmake test' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(e.onEdit).toHaveBeenCalledWith({
      type: 'updateStep',
      job: 'build',
      index: 0,
      set: { run: 'make\nmake test' },
      unset: [],
    })
  })

  it('draws a matrix job as a matrix group with an editable header', () => {
    const matrix = {
      jobs: {
        build: {
          strategy: { matrix: { os: ['linux', 'mac'] } },
          steps: [{ run: 'make' }],
        },
      },
    }
    render(<DependencyGraphPreview yml={matrix} editor={editor()} />)
    expect(screen.getByText(/Matrix:/)).toBeInTheDocument()
    expect(screen.getByText('2 jobs')).toBeInTheDocument()
    expect(document.querySelector('[data-dag-job="build"]')).not.toBeNull()
    expect(screen.queryByText('matrix')).toBeNull()
  })

  it('keeps a job whose if is false on the graph it edits, which a run leaves out', () => {
    const never = {
      jobs: {
        build: { steps: [{ run: 'make' }] },
        off: { if: false, needs: ['build'], steps: [{ run: 'x' }] },
      },
    }
    render(<DependencyGraphPreview yml={never} editor={editor()} />)
    expect(document.querySelector('[data-dag-job="off"]')).not.toBeNull()
    cleanup()
    render(<DependencyGraphPreview yml={never} />)
    expect(screen.getAllByText('Build').length).toBeGreaterThan(0)
    expect(screen.queryByText('Off')).toBeNull()
  })

  it('offers only Edit matrix for a matrix job and saves include entries', () => {
    const e = editor()
    const matrix = {
      jobs: {
        build: {
          strategy: { matrix: { os: ['linux', 'mac'] } },
          steps: [{ run: 'make' }],
        },
      },
    }
    render(<DependencyGraphPreview yml={matrix} editor={e} />)
    const row = document.querySelector('[data-dag-job="build"]') as HTMLElement
    fireEvent.contextMenu(row, { clientX: 5, clientY: 5 })
    expect(screen.queryByText('Edit job')).toBeNull()
    expect(screen.queryByText('Make matrix')).toBeNull()
    fireEvent.click(screen.getByText('Edit matrix'))
    expect(screen.getByText(GRAPH_EDITOR_STRINGS.help.include)).toBeInTheDocument()
    fireEvent.click(screen.getAllByText('Add entry')[0] as HTMLElement)
    fireEvent.change(screen.getAllByLabelText('Key').at(-1) as HTMLElement, {
      target: { value: 'os' },
    })
    fireEvent.change(screen.getAllByLabelText('Value').at(-1) as HTMLElement, {
      target: { value: 'windows' },
    })
    fireEvent.click(screen.getByLabelText('Stop others on a failure'))
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(e.onEdit).toHaveBeenCalledWith({
      type: 'updateJob',
      job: 'build',
      set: {
        strategy: {
          matrix: { os: ['linux', 'mac'], include: [{ os: 'windows' }] },
          'fail-fast': false,
        },
      },
      unset: [],
    })
  })

  it('describes every field of the job and step dialogs', () => {
    const e = editor()
    render(<DependencyGraphPreview yml={yml} editor={e} />)
    const row = document.querySelector('[data-dag-job="mac"]') as HTMLElement
    fireEvent.contextMenu(row, { clientX: 5, clientY: 5 })
    fireEvent.click(screen.getByText('Edit job'))
    const help = GRAPH_EDITOR_STRINGS.help
    for (const text of [
      help.jobName,
      help.needs,
      help.jobIf,
      help.remoteHost,
      help.remoteUser,
      help.jumpNodeHost,
      help.jumpNodeUser,
      help.disconnectTimeout,
      help.jobEnv,
      help.outputs,
      help.jobWorkingDirectory,
      help.jobTimeout,
    ]) {
      expect(screen.getByText(text)).toBeInTheDocument()
    }
  })

  it('offers only the with inputs a built-in action takes', () => {
    const e = editor()
    const steps = {
      jobs: {
        build: {
          steps: [
            {
              name: 'get',
              uses: 'example/checkout',
              with: { repo: 'r', branch: 'main', extra: 1 },
            },
          ],
        },
      },
    }
    render(<DependencyGraphPreview yml={steps} editor={e} />)
    const row = document.querySelector('[data-dag-job="build"]') as HTMLElement
    fireEvent.click(within(row).getByRole('button', { name: 'Build' }))
    fireEvent.click(screen.getByTestId('get'))
    expect(
      screen.getByText(TEST_ACTIONS['example/checkout']!.inputs[2]!.description),
    ).toBeInTheDocument()
    const save = screen.getByRole('button', { name: 'Save' })
    expect(screen.getAllByText(GRAPH_EDITOR_STRINGS.notActionInput).length).toBeGreaterThan(0)
    expect(save).toBeDisabled()
    const extra = screen.getByText('extra').parentElement as HTMLElement
    fireEvent.click(within(extra).getByRole('button', { name: 'Remove' }))
    fireEvent.change(screen.getByLabelText('Branch'), {
      target: { value: 'dev' },
    })
    fireEvent.click(save)
    expect(e.onEdit).toHaveBeenCalledWith({
      type: 'updateStep',
      job: 'build',
      index: 0,
      set: { with: { repo: 'r', branch: 'dev' } },
      unset: [],
    })
  })

  it('refuses a uses from the YAML that the schema does not know', () => {
    const steps = {
      jobs: { build: { steps: [{ name: 'get', uses: 'somewhere/else' }] } },
    }
    render(<DependencyGraphPreview yml={steps} editor={editor()} />)
    fireEvent.click(within(jobRow('build')).getByRole('button', { name: 'Build' }))
    fireEvent.click(screen.getByTestId('get'))
    expect(screen.getByLabelText('Workflow or action')).toHaveValue('somewhere/else')
    expect(screen.getByText(GRAPH_EDITOR_STRINGS.invalidUses)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
  })

  it('picks a built-in action for a step and fills in its inputs', () => {
    const e = editor()
    render(<DependencyGraphPreview yml={yml} editor={e} />)
    fireEvent.click(within(jobRow('build')).getByRole('button', { name: 'Build' }))
    fireEvent.click(screen.getByTestId('compile'))
    fireEvent.click(screen.getByRole('button', { name: GRAPH_EDITOR_STRINGS.stepUses }))
    fireEvent.click(screen.getByRole('button', { name: 'Action' }))
    fireEvent.change(screen.getByLabelText('Workflow or action'), {
      target: { value: 'example/checkout' },
    })
    fireEvent.change(screen.getByLabelText('Repository'), {
      target: { value: 'https://github.com/o/r' },
    })
    fireEvent.change(screen.getByLabelText('Branch'), {
      target: { value: 'main' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(e.onEdit).toHaveBeenCalledWith({
      type: 'updateStep',
      job: 'build',
      index: 0,
      set: {
        uses: 'example/checkout',
        with: { repo: 'https://github.com/o/r', branch: 'main' },
      },
      unset: ['run'],
    })
  })

  it('takes a typed uses that none of the lists offer', () => {
    const e = editor()
    render(<DependencyGraphPreview yml={yml} editor={e} />)
    fireEvent.click(within(jobRow('build')).getByRole('button', { name: 'Build' }))
    fireEvent.click(screen.getByTestId('compile'))
    fireEvent.click(screen.getByRole('button', { name: GRAPH_EDITOR_STRINGS.stepUses }))
    fireEvent.click(screen.getByRole('button', { name: 'Marketplace' }))
    fireEvent.change(screen.getByLabelText('Workflow or action'), {
      target: { value: 'marketplace/demo@2.0.0' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(e.onEdit).toHaveBeenCalledWith({
      type: 'updateStep',
      job: 'build',
      index: 0,
      set: { uses: 'marketplace/demo@2.0.0' },
      unset: ['run'],
    })
  })

  it('reads a job’s remote host from a cluster input, or takes any host typed in', () => {
    const e = editor()
    render(<DependencyGraphPreview yml={withInputs} editor={e} />)
    fireEvent.contextMenu(jobRow('mac'), { clientX: 5, clientY: 5 })
    fireEvent.click(screen.getByText('Edit job'))
    const host = within(field('Host')).getByLabelText('Host')
    expect(suggestionsOf(host)).toContainEqual({
      value: '${{ inputs.cluster.ip }}',
      label: 'Cluster',
    })
    fireEvent.change(host, { target: { value: '${{ inputs.cluster.ip }}' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(e.onEdit).toHaveBeenCalledWith({
      type: 'updateJob',
      job: 'mac',
      set: { ssh: { remoteHost: '${{ inputs.cluster.ip }}' } },
      unset: [],
    })
  })

  it('runs a job on a compute environment, and refuses one with a remote host as well', () => {
    const e = editor()
    render(<DependencyGraphPreview yml={withInputs} editor={e} />)
    fireEvent.contextMenu(jobRow('mac'), { clientX: 5, clientY: 5 })
    fireEvent.click(screen.getByText('Edit job'))
    const dialog = screen.getByRole('dialog')
    fireEvent.change(within(dialog).getByLabelText('Cluster'), {
      target: { value: 'my-hpc' },
    })
    expect(
      within(dialog).getByText(GRAPH_EDITOR_STRINGS.runsOnNeedsEnvironment),
    ).toBeInTheDocument()
    fireEvent.change(within(dialog).getByLabelText('Environment name'), {
      target: { value: 'gpu-large' },
    })
    const host = within(field('Host')).getByLabelText('Host')
    fireEvent.change(host, { target: { value: '10.0.0.1' } })
    expect(within(dialog).getByText(GRAPH_EDITOR_STRINGS.runsOnWithSsh)).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Save' })).toBeDisabled()
    fireEvent.change(host, { target: { value: '' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }))
    expect(e.onEdit).toHaveBeenCalledWith({
      type: 'updateJob',
      job: 'mac',
      set: {
        'runs-on': { environment: { cluster: 'my-hpc', name: 'gpu-large' } },
      },
      unset: [],
    })
  })

  it('runs a job on a compute target, and asks where on it', () => {
    const e = editor()
    render(<DependencyGraphPreview yml={withInputs} editor={e} />)
    fireEvent.contextMenu(jobRow('mac'), { clientX: 5, clientY: 5 })
    fireEvent.click(screen.getByText('Edit job'))
    const dialog = screen.getByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Compute target' }))
    fireEvent.change(within(dialog).getByLabelText('Target'), { target: { value: 'c1' } })
    expect(within(dialog).getByText(GRAPH_EDITOR_STRINGS.runsOnNeedsMode)).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Save' })).toBeDisabled()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Login node' }))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }))
    expect(e.onEdit).toHaveBeenCalledWith({
      type: 'updateJob',
      job: 'mac',
      set: { 'runs-on': { mode: 'login', targetId: 'c1' } },
      unset: [],
    })
  })

  it('keeps the compute target a job runs on when its dialog changes something else', () => {
    const target = {
      mode: 'environment',
      targetId: 'c1',
      environmentId: 'env-1',
      schedulingParams: { walltime: '01:00:00' },
      newWorker: false,
    }
    const e = editor()
    render(
      <DependencyGraphPreview
        yml={{ jobs: { build: { 'runs-on': target, steps: [{ run: 'make' }] } } }}
        editor={e}
      />,
    )
    fireEvent.contextMenu(jobRow('build'), { clientX: 5, clientY: 5 })
    fireEvent.click(screen.getByText('Edit job'))
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByLabelText('Environment ID')).toHaveValue('env-1')
    fireEvent.change(within(field('When to run')).getByLabelText('When to run'), {
      target: { value: 'always' },
    })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }))
    expect(e.onEdit).toHaveBeenCalledWith({
      type: 'updateJob',
      job: 'build',
      set: { if: 'always' },
      unset: [],
    })
  })

  it('runs a job on any condition typed in, offering the form’s choices', () => {
    const e = editor()
    render(<DependencyGraphPreview yml={withInputs} editor={e} />)
    fireEvent.contextMenu(jobRow('mac'), { clientX: 5, clientY: 5 })
    fireEvent.click(screen.getByText('Edit job'))
    const condition = within(field('When to run')).getByLabelText('When to run')
    expect(suggestionsOf(condition)).toContainEqual({
      value: "${{ inputs.mode == 'slow' }}",
      label: 'When mode is slow',
    })
    fireEvent.change(condition, {
      target: { value: "${{ inputs.mode != 'slow' }}" },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(e.onEdit).toHaveBeenCalledWith({
      type: 'updateJob',
      job: 'mac',
      set: { if: "${{ inputs.mode != 'slow' }}" },
      unset: [],
    })
  })

  it('offers the executor’s status checks for when a step runs', () => {
    const e = editor()
    render(<DependencyGraphPreview yml={yml} editor={e} />)
    fireEvent.click(within(jobRow('build')).getByRole('button', { name: 'Build' }))
    fireEvent.click(screen.getByTestId('compile'))
    const condition = within(field('When to run')).getByLabelText('When to run')
    expect(condition).toHaveValue('')
    expect(suggestionsOf(condition).map((option) => option.value)).toEqual(
      expect.arrayContaining(['always', 'failure()', 'cancelled()', 'success()', 'false']),
    )
    fireEvent.change(condition, { target: { value: 'failure()' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(e.onEdit).toHaveBeenCalledWith({
      type: 'updateStep',
      job: 'build',
      index: 0,
      set: { if: 'failure()' },
      unset: [],
    })
  })

  it('writes Never as false', () => {
    const e = editor()
    render(<DependencyGraphPreview yml={yml} editor={e} />)
    fireEvent.click(within(jobRow('build')).getByRole('button', { name: 'Build' }))
    fireEvent.click(screen.getByTestId('compile'))
    fireEvent.change(within(field('When to run')).getByLabelText('When to run'), {
      target: { value: 'false' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(e.onEdit).toHaveBeenCalledWith({
      type: 'updateStep',
      job: 'build',
      index: 0,
      set: { if: false },
      unset: [],
    })
  })

  it('switches needs to an expression and back from the form', () => {
    const e = editor()
    render(<DependencyGraphPreview yml={yml} editor={e} />)
    fireEvent.contextMenu(jobRow('mac'), { clientX: 5, clientY: 5 })
    fireEvent.click(screen.getByText('Edit job'))
    const needs = field('Depends on')
    fireEvent.click(within(needs).getByRole('button', { name: 'Use an expression instead' }))
    fireEvent.change(within(needs).getByLabelText('Depends on'), {
      target: { value: '${{ inputs.jobs }}' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(e.onEdit).toHaveBeenCalledWith({
      type: 'updateJob',
      job: 'mac',
      set: { needs: '${{ inputs.jobs }}' },
      unset: [],
    })
  })

  it('types an expression in place of a switch', () => {
    const e = editor()
    render(<DependencyGraphPreview yml={yml} editor={e} />)
    fireEvent.click(within(jobRow('build')).getByRole('button', { name: 'Build' }))
    fireEvent.click(screen.getByTestId('compile'))
    const lenient = field('Keep going if it fails')
    fireEvent.click(within(lenient).getByRole('button', { name: 'Use an expression instead' }))
    // The switch gives way to a typed field below the label.
    expect(screen.queryByRole('checkbox', { name: 'Keep going if it fails' })).toBeNull()
    fireEvent.change(screen.getByLabelText('Keep going if it fails'), {
      target: { value: '${{ inputs.lenient }}' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(e.onEdit).toHaveBeenCalledWith({
      type: 'updateStep',
      job: 'build',
      index: 0,
      set: { 'ignore-errors': '${{ inputs.lenient }}' },
      unset: [],
    })
  })

  it('leaves a condition as written while other fields change', () => {
    const e = editor()
    const steps = {
      jobs: {
        build: {
          steps: [{ name: 'notify', run: 'x', if: 'failure() && inputs.notify' }],
        },
      },
    }
    render(<DependencyGraphPreview yml={steps} editor={e} />)
    fireEvent.click(within(jobRow('build')).getByRole('button', { name: 'Build' }))
    fireEvent.click(screen.getByTestId('notify'))
    expect(within(field('When to run')).getByLabelText('When to run')).toHaveValue(
      'failure() && inputs.notify',
    )
    fireEvent.change(screen.getByLabelText('Time limit'), {
      target: { value: '10m' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(e.onEdit).toHaveBeenCalledWith(
      expect.objectContaining({ set: { timeout: '10m' }, unset: [] }),
    )
  })

  it('runs a job when an output of a job it needs is a value', () => {
    const e = editor()
    const outputs = {
      jobs: {
        build: {
          outputs: { version: '${{ needs.build.steps.v.outputs.v }}' },
          steps: [{ id: 'v', run: 'make' }],
        },
        deploy: { needs: ['build'], steps: [{ run: 'deploy' }] },
      },
    }
    render(<DependencyGraphPreview yml={outputs} editor={e} />)
    fireEvent.contextMenu(jobRow('deploy'), { clientX: 5, clientY: 5 })
    fireEvent.click(screen.getByText('Edit job'))
    const condition = field('When to run')
    const insert = within(condition).getByLabelText('Insert a value…')
    expect(
      within(insert).getByRole('option', {
        name: 'needs.build.outputs.version',
      }),
    ).toBeInTheDocument()
    fireEvent.change(within(condition).getByLabelText('When to run'), {
      target: { value: "${{ needs.build.outputs.version == '2' }}" },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(e.onEdit).toHaveBeenCalledWith({
      type: 'updateJob',
      job: 'deploy',
      set: { if: "${{ needs.build.outputs.version == '2' }}" },
      unset: [],
    })
  })

  it('adds a new input from a field in the same edit as the job', () => {
    const e = editor()
    render(<DependencyGraphPreview yml={yml} editor={e} />)
    fireEvent.contextMenu(jobRow('mac'), { clientX: 5, clientY: 5 })
    fireEvent.click(screen.getByText('Edit job'))
    fireEvent.click(
      within(field('When to run')).getByRole('button', {
        name: 'New Switch input…',
      }),
    )
    const dialogs = screen.getAllByRole('dialog')
    const created = dialogs[dialogs.length - 1] as HTMLElement
    expect(within(created).getByLabelText('Name')).toHaveValue('enabled')
    expect(within(created).getByLabelText('Type')).toBeDisabled()
    fireEvent.click(within(created).getByRole('button', { name: 'Save' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(e.onEdit).toHaveBeenCalledWith({
      type: 'batch',
      edits: [
        {
          type: 'addInput',
          parent: [],
          name: 'enabled',
          definition: { type: 'boolean' },
        },
        {
          type: 'updateJob',
          job: 'mac',
          set: { if: '${{ inputs.enabled }}' },
          unset: [],
        },
      ],
    })
  })

  it('publishes a step’s output as a job output', () => {
    const e = editor()
    const steps = {
      jobs: { build: { steps: [{ id: 'get', run: 'echo v=1 >> $OUTPUTS' }] } },
    }
    render(<DependencyGraphPreview yml={steps} editor={e} />)
    fireEvent.contextMenu(jobRow('build'), { clientX: 5, clientY: 5 })
    fireEvent.click(screen.getByText('Edit job'))
    const outputs = screen.getByText('Outputs').closest('details') as HTMLElement
    fireEvent.click(within(outputs).getByText('Add'))
    fireEvent.change(within(outputs).getByLabelText('Name'), {
      target: { value: 'version' },
    })
    fireEvent.change(within(outputs).getByLabelText('Output'), {
      target: { value: 'v' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(e.onEdit).toHaveBeenCalledWith({
      type: 'updateJob',
      job: 'build',
      set: {
        outputs: { version: '${{ needs.build.steps.get.outputs.v }}' },
      },
      unset: [],
    })
  })

  it('keeps an include expression and offers no whole-matrix expression', () => {
    const e = editor()
    const matrix = {
      jobs: {
        build: {
          strategy: {
            matrix: { os: ['linux'], include: '${{ inputs.extra }}' },
          },
          steps: [{ run: 'make' }],
        },
      },
    }
    render(<DependencyGraphPreview yml={matrix} editor={e} />)
    const row = document.querySelector('[data-dag-job="build"]') as HTMLElement
    fireEvent.contextMenu(row, { clientX: 5, clientY: 5 })
    fireEvent.click(screen.getByText('Edit matrix'))
    expect(screen.queryByRole('button', { name: 'Expression' })).toBeNull()
    expect(screen.getByLabelText('Extra combinations')).toHaveValue('${{ inputs.extra }}')
    fireEvent.change(screen.getByLabelText('Runs at the same time'), {
      target: { value: '2' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(e.onEdit).toHaveBeenCalledWith({
      type: 'updateJob',
      job: 'build',
      set: {
        strategy: {
          matrix: { os: ['linux'], include: '${{ inputs.extra }}' },
          'max-parallel': 2,
        },
      },
      unset: [],
    })
  })

  it('opens a job as YAML by default, comments included, and saves that YAML', async () => {
    const e = editor({ readSource: () => YML_TEXT })
    render(<DependencyGraphPreview yml={yml} editor={e} />)
    fireEvent.contextMenu(jobRow('mac'), { clientX: 5, clientY: 5 })
    fireEvent.click(screen.getByText('Edit job'))
    expect(
      screen.getAllByRole('button', { name: /^(YAML|Form)$/ }).map((button) => button.textContent),
    ).toEqual(['YAML', 'Form'])
    const text = await screen.findByLabelText('file:///workflow-job.yaml')
    expect(text).toHaveValue('# macOS runners\nneeds:\n  - build\nsteps:\n  - run: y\n')
    const next = 'needs:\n  - linux\nsteps:\n  - run: y\n'
    fireEvent.change(text, { target: { value: next } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(e.onEdit).toHaveBeenCalledWith({
      type: 'setJobYaml',
      job: 'mac',
      yaml: next,
    })
  })

  it('opens the form when the user last chose it, and reports each switch', async () => {
    const onSettingsViewChange = vi.fn()
    const e = editor({
      readSource: () => YML_TEXT,
      settingsView: 'form',
      onSettingsViewChange,
    })
    render(<DependencyGraphPreview yml={yml} editor={e} />)
    fireEvent.contextMenu(jobRow('mac'), { clientX: 5, clientY: 5 })
    fireEvent.click(screen.getByText('Edit job'))
    fireEvent.change(screen.getByLabelText('Time limit'), {
      target: { value: '10m' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'YAML' }))
    const text = await screen.findByLabelText('file:///workflow-job.yaml')
    expect((text as HTMLTextAreaElement).value).toContain('timeout: 10m')
    expect(onSettingsViewChange).toHaveBeenLastCalledWith('yaml')
    fireEvent.click(screen.getByRole('button', { name: 'Form' }))
    expect(screen.getByLabelText('Time limit')).toHaveValue('10m')
    expect(onSettingsViewChange).toHaveBeenLastCalledWith('form')
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(e.onEdit).toHaveBeenCalledWith({
      type: 'updateJob',
      job: 'mac',
      set: { timeout: '10m' },
      unset: [],
    })
  })

  it('edits one step as YAML and refuses YAML that doesn’t parse', async () => {
    const e = editor({ readSource: () => YML_TEXT })
    render(<DependencyGraphPreview yml={yml} editor={e} />)
    fireEvent.click(within(jobRow('build')).getByRole('button', { name: 'Build' }))
    fireEvent.click(screen.getByTestId('compile'))
    const text = await screen.findByLabelText('file:///workflow-step.yaml')
    expect(text).toHaveValue('name: compile\nrun: make\n')
    fireEvent.change(text, { target: { value: 'run: [' } })
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
    fireEvent.change(text, {
      target: { value: 'name: compile\nrun: make all\n' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(e.onEdit).toHaveBeenCalledWith({
      type: 'setStepYaml',
      job: 'build',
      index: 0,
      yaml: 'name: compile\nrun: make all\n',
    })
  })

  it('renames a job from its YAML view, in the same edit as its settings', async () => {
    const e = editor({ readSource: () => YML_TEXT })
    render(<DependencyGraphPreview yml={yml} editor={e} />)
    fireEvent.contextMenu(jobRow('build'), { clientX: 5, clientY: 5 })
    fireEvent.click(screen.getByText('Edit job'))
    const text = await screen.findByLabelText('file:///workflow-job.yaml')
    const name = screen.getByLabelText('Job name')
    expect(name).toHaveValue('build')
    fireEvent.change(name, { target: { value: 'linux' } })
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
    fireEvent.change(name, { target: { value: 'compile' } })
    fireEvent.change(text, {
      target: { value: 'steps:\n  - name: compile\n    run: make all\n' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(e.onEdit).toHaveBeenCalledWith({
      type: 'batch',
      edits: [
        {
          type: 'setJobYaml',
          job: 'build',
          yaml: 'steps:\n  - name: compile\n    run: make all\n',
        },
        { type: 'updateJob', job: 'build', name: 'compile' },
      ],
    })
  })

  it('saves the inputs a with: completion adds along with the step that reads them', async () => {
    const e = editor({ readSource: () => YML_TEXT })
    render(<DependencyGraphPreview yml={yml} editor={e} />)
    fireEvent.click(within(jobRow('build')).getByRole('button', { name: 'Build' }))
    fireEvent.click(screen.getByTestId('compile'))
    const text = await screen.findByLabelText('file:///workflow-step.yaml')
    const group = {
      label: 'other inputs',
      type: 'group',
      items: { size: { type: 'number' } },
    }
    act(() => {
      editorProps.nested?.addInputs('workflow_other', group)
    })
    expect(editorProps.nested?.inputs()).toEqual({ workflow_other: group })
    const step =
      'name: compile\nuses: workflow/other\nwith:\n  size: ${{ inputs.workflow_other.size }}\n'
    fireEvent.change(text, { target: { value: step } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(e.onEdit).toHaveBeenCalledWith({
      type: 'batch',
      edits: [
        {
          type: 'addInput',
          parent: [],
          index: 0,
          name: 'workflow_other',
          definition: group,
        },
        { type: 'setStepYaml', job: 'build', index: 0, yaml: step },
      ],
    })
  })

  it('leaves out an added group the YAML no longer reads', async () => {
    const e = editor({ readSource: () => YML_TEXT })
    render(<DependencyGraphPreview yml={yml} editor={e} />)
    fireEvent.click(within(jobRow('build')).getByRole('button', { name: 'Build' }))
    fireEvent.click(screen.getByTestId('compile'))
    const text = await screen.findByLabelText('file:///workflow-step.yaml')
    act(() => {
      editorProps.nested?.addInputs('workflow_other', { type: 'group' })
    })
    fireEvent.change(text, {
      target: { value: 'name: compile\nrun: make all\n' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(e.onEdit).toHaveBeenCalledWith({
      type: 'setStepYaml',
      job: 'build',
      index: 0,
      yaml: 'name: compile\nrun: make all\n',
    })
  })

  it('saves a matrix job without rewriting a matrix it did not touch', () => {
    const matrixYml = {
      jobs: {
        build: {
          strategy: { matrix: { python: ['3.10', '3.12'] } },
          steps: [{ run: 'x' }],
        },
      },
    }
    const text =
      'jobs:\n  build:\n    strategy:\n      matrix:\n        python: ["3.10", "3.12"]\n    steps:\n      - run: x\n'
    const e = editor({ readSource: () => text, settingsView: 'form' })
    render(<DependencyGraphPreview yml={matrixYml} editor={e} />)
    fireEvent.contextMenu(jobRow('build'), { clientX: 5, clientY: 5 })
    fireEvent.click(screen.getByText('Edit matrix'))
    fireEvent.change(screen.getByLabelText('Time limit'), {
      target: { value: '10m' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(e.onEdit).toHaveBeenCalledWith({
      type: 'updateJob',
      job: 'build',
      set: { timeout: '10m' },
      unset: [],
    })
  })

  it('opens the workflow settings from the toolbar', () => {
    const onOpenSettings = vi.fn()
    render(<DependencyGraphPreview yml={yml} editor={editor({ onOpenSettings })} />)
    fireEvent.click(screen.getByRole('button', { name: 'Workflow settings' }))
    expect(onOpenSettings).toHaveBeenCalled()
  })

  it('offers an empty canvas with the toolbar for a workflow without jobs', () => {
    const e = editor()
    render(<DependencyGraphPreview yml={{ jobs: {} }} editor={e} />)
    fireEvent.click(screen.getByText('Job'))
    expect(e.onEdit).toHaveBeenCalledWith({ type: 'addJob' })
  })

  it('takes undo and paste on the canvas of a graph without jobs, which holds the border choice', () => {
    const e = editor()
    render(<DependencyGraphPreview yml={{ jobs: {} }} editor={e} removeBorder />)
    const canvas = screen.getByText('Job').closest('[tabindex="-1"]') as HTMLElement
    expect(canvas).toHaveClass('border-none')
    canvas.focus()
    fireEvent.keyDown(canvas, { key: 'z', ctrlKey: true })
    expect(e.onUndo).toHaveBeenCalledOnce()
  })

  it('keeps the keys on the graph when deleting its last job empties it', () => {
    const e = editor()
    const one = { jobs: { only: { steps: [{ run: 'x' }] } } }
    const { rerender } = render(<DependencyGraphPreview yml={one} editor={e} />)
    const container = jobRow('only').closest('[tabindex="-1"]') as HTMLElement
    container.focus()
    fireEvent.click(jobRow('only'), { shiftKey: true })
    jobRow('only').focus()
    fireEvent.keyDown(jobRow('only'), { key: 'Delete' })
    expect(e.onEdit).toHaveBeenCalledWith({ type: 'deleteJob', jobs: ['only'] })
    rerender(<DependencyGraphPreview yml={{ jobs: {} }} editor={e} />)
    const canvas = screen.getByText('Job').closest('[tabindex="-1"]') as HTMLElement
    expect(document.activeElement).toBe(canvas)
    fireEvent.keyDown(canvas, { key: 'z', ctrlKey: true })
    expect(e.onUndo).toHaveBeenCalledOnce()
  })

  it('adds a job only when its dialog is first saved', () => {
    const e = editor({ readSource: () => YML_TEXT })
    render(<DependencyGraphPreview yml={yml} editor={e} />)
    fireEvent.click(screen.getByText('Job'))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(e.onEdit).not.toHaveBeenCalled()
    fireEvent.click(screen.getByText('Job'))
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(e.onEdit).toHaveBeenCalledTimes(1)
    expect(e.onEdit).toHaveBeenCalledWith({ type: 'addJob' })
  })

  it('adds a job or step straight away when new ones skip their dialog', () => {
    const e = editor({
      readSource: () => YML_TEXT,
      openOnAdd: false,
      onOpenOnAddChange: vi.fn(),
    })
    render(<DependencyGraphPreview yml={yml} editor={e} />)
    fireEvent.click(screen.getByText('Job'))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(e.onEdit).toHaveBeenCalledWith({ type: 'addJob' })
    fireEvent.click(within(jobRow('build')).getByRole('button', { name: 'Build' }))
    fireEvent.click(screen.getByText('Add step'))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(e.onEdit).toHaveBeenLastCalledWith({ type: 'addStep', job: 'build' })
  })

  it('switches whether new jobs, steps and inputs open their dialog from a dialog', () => {
    const onOpenOnAddChange = vi.fn()
    const e = editor({ readSource: () => YML_TEXT, onOpenOnAddChange })
    render(<DependencyGraphPreview yml={yml} editor={e} />)
    fireEvent.click(screen.getByText('Job'))
    const open = screen.getByRole('checkbox', { name: 'Open when adding' })
    expect(open).toBeChecked()
    fireEvent.click(open)
    expect(onOpenOnAddChange).toHaveBeenCalledWith(false)
  })

  it('adds a step with its first save, as one edit with what the dialog set', async () => {
    const e = editor({ readSource: () => YML_TEXT })
    render(<DependencyGraphPreview yml={yml} editor={e} />)
    fireEvent.click(within(jobRow('build')).getByRole('button', { name: 'Build' }))
    fireEvent.click(screen.getByText('Add step'))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(e.onEdit).not.toHaveBeenCalled()
    fireEvent.click(screen.getByText('Add step'))
    const text = await screen.findByLabelText('file:///workflow-step.yaml')
    fireEvent.change(text, { target: { value: 'run: make test\n' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(e.onEdit).toHaveBeenCalledWith({
      type: 'batch',
      edits: [
        { type: 'addStep', job: 'build' },
        {
          type: 'setStepYaml',
          job: 'build',
          index: 1,
          yaml: 'run: make test\n',
        },
      ],
    })
  })

  it('discards a new step deleted from its dialog', () => {
    const e = editor({ readSource: () => YML_TEXT, settingsView: 'form' })
    render(<DependencyGraphPreview yml={yml} editor={e} />)
    fireEvent.click(within(jobRow('build')).getByRole('button', { name: 'Build' }))
    fireEvent.click(screen.getByText('Add step'))
    fireEvent.click(screen.getByRole('button', { name: 'Delete step' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(e.onEdit).not.toHaveBeenCalled()
  })

  it('names dragged jobs as the graph shows them', () => {
    const jobs = {
      jobs: {
        job_1: { steps: [{ run: 'a' }] },
        job_2: { steps: [{ run: 'b' }] },
      },
    }
    render(<DependencyGraphPreview yml={jobs} editor={editor()} />)
    fireEvent.pointerDown(
      screen.getByRole('button', { name: 'Drag to move these jobs together' }),
      { button: 0, clientX: 10, clientY: 10 },
    )
    act(() => {
      fireEvent.pointerMove(window, { clientX: 60, clientY: 60 })
    })
    expect(screen.getByText('Job 1, Job 2')).toBeInTheDocument()
    release([60, 60])
  })
})

describe('connecting jobs from node circles', () => {
  // build feeds the linux and mac box; test stands alone.
  const graph = {
    jobs: {
      build: { steps: [{ run: 'make' }] },
      test: { steps: [{ run: 'check' }] },
      linux: { needs: ['build'], steps: [{ run: 'x' }] },
      mac: { needs: ['build'], steps: [{ run: 'y' }] },
    },
  }

  // Nodes are measured after the first paint; a hover re-renders the graph as that paint would.
  function renderGraph(e?: DependencyGraphEditor) {
    render(<DependencyGraphPreview yml={graph} editor={e} />)
    const node = document.getElementById('node_build') as HTMLElement
    act(() => {
      fireEvent.mouseEnter(node)
    })
    act(() => {
      fireEvent.mouseLeave(node)
    })
  }

  function port(node: string, side: 'in' | 'out'): HTMLElement {
    return document.querySelector(
      `[data-dag-port="${side}"][data-dag-node="${node}"]`,
    ) as HTMLElement
  }

  function drag(from: HTMLElement, to: HTMLElement) {
    underPointer = to
    fireEvent.pointerDown(from, { button: 0, clientX: 10, clientY: 10 })
    act(() => {
      fireEvent.pointerMove(window, { clientX: 60, clientY: 60 })
    })
    release([60, 60])
  }

  it('puts a circle on both sides of every node, only in the editor', () => {
    renderGraph()
    expect(document.querySelector('[data-dag-port]')).toBeNull()
    cleanup()
    renderGraph(editor())
    const ports = [...document.querySelectorAll('[data-dag-port]')].map(
      (el) => `${el.getAttribute('data-dag-node')}:${el.getAttribute('data-dag-port')}`,
    )
    expect(ports.sort()).toEqual([
      'build:in',
      'build:out',
      'linux:in',
      'linux:out',
      'test:in',
      'test:out',
    ])
  })

  it('makes the job dropped on depend on a node dragged from its right circle', () => {
    const e = editor()
    renderGraph(e)
    drag(port('test', 'out'), jobRow('linux'))
    expect(e.onEdit).toHaveBeenCalledWith(
      connectedFrom([['test', 'linux']], {
        build: { column: 0, row: 0 },
        test: { column: 0, row: 1 },
        linux: { column: 1, row: 0 },
        mac: { column: 1, row: 0 },
      }),
    )
  })

  it('makes a node dragged from its left circle depend on the job dropped on', () => {
    const e = editor()
    renderGraph(e)
    drag(port('test', 'in'), jobRow('build'))
    expect(e.onEdit).toHaveBeenCalledWith(connected([['build', 'test']]))
  })

  it('connects every job of a node, from its circle or dropped on it, as one edit', () => {
    const e = editor()
    renderGraph(e)
    const both: [string, string][] = [
      ['test', 'linux'],
      ['test', 'mac'],
    ]
    // Whichever end the drag starts from is the one that moves.
    drag(port('test', 'out'), port('linux', 'in'))
    expect(e.onEdit).toHaveBeenLastCalledWith(connectedFrom(both))
    drag(port('linux', 'in'), jobRow('test'))
    expect(e.onEdit).toHaveBeenLastCalledWith(connected(both))
    expect(e.onEdit).toHaveBeenCalledTimes(2)
  })

  it('counts a drop anywhere on a node as a drop on its circle', () => {
    const e = editor()
    renderGraph(e)
    drag(port('test', 'out'), document.getElementById('node_linux') as HTMLElement)
    expect(e.onEdit).toHaveBeenCalledWith(
      connectedFrom([
        ['test', 'linux'],
        ['test', 'mac'],
      ]),
    )
  })

  it('refuses a connection that would loop, repeat or need itself', () => {
    const e = editor()
    renderGraph(e)
    drag(port('linux', 'out'), jobRow('build'))
    drag(port('build', 'out'), port('linux', 'out'))
    drag(port('test', 'out'), port('test', 'in'))
    expect(e.onEdit).not.toHaveBeenCalled()
  })
})

describe('a matrix job’s steps', () => {
  const matrix = {
    jobs: {
      build: {
        strategy: { matrix: { region: ['us', 'eu'] } },
        steps: [{ name: 'deploy', run: 'x' }],
      },
    },
  }

  // The matrix opened, its first run's steps shown, and rects set by hand as jsdom lays nothing out.
  function openFirstRun() {
    render(<DependencyGraphPreview yml={matrix} editor={editor()} />)
    const node = document.getElementById('node_build') as HTMLElement
    fireEvent.click(within(node).getByRole('button', { name: /Matrix: build/ }))
    fireEvent.click(within(node).getByRole('button', { name: 'Build (1/2)' }))
    jobRow('build').getBoundingClientRect = () => new DOMRect(0, 0, 200, 30)
    const step = document.querySelector(
      '[data-dag-step-job="build"][data-dag-step="0"]',
    ) as HTMLElement
    step.getBoundingClientRect = () => new DOMRect(0, 60, 200, 20)
    return { node, step }
  }

  it('selects them with a box or shift-click, as the steps of its one job', () => {
    const { node, step } = openFirstRun()
    fireEvent.pointerDown(node.parentElement as HTMLElement, {
      button: 0,
      clientX: -10,
      clientY: 55,
      shiftKey: true,
    })
    act(() => {
      fireEvent.pointerMove(window, { clientX: 210, clientY: 85 })
    })
    act(() => {
      fireEvent.pointerUp(window, { clientX: 210, clientY: 85 })
    })
    expect(step).toHaveAttribute('data-selected')
    expect(jobRow('build')).not.toHaveAttribute('data-selected')
    fireEvent.click(step, { shiftKey: true })
    expect(step).not.toHaveAttribute('data-selected')
  })
})

describe('selecting jobs', () => {
  // a feeds d; b and c stand alone, so they share a node.
  const graph = {
    jobs: {
      a: { steps: [{ run: 'a' }] },
      b: { steps: [{ run: 'b' }] },
      c: { steps: [{ run: 'c' }] },
      d: { needs: ['a'], steps: [{ run: 'd' }] },
    },
  }

  // jsdom lays nothing out, so each row and node gets a rect by hand.
  function renderGraph(e: DependencyGraphEditor) {
    render(<DependencyGraphPreview yml={graph} editor={e} />)
    const node = document.getElementById('node_a') as HTMLElement
    act(() => {
      fireEvent.mouseEnter(node)
    })
    act(() => {
      fireEvent.mouseLeave(node)
    })
    const rects: Record<string, [number, number, number, number]> = {
      a: [0, 0, 100, 20],
      b: [0, 100, 100, 20],
      c: [0, 130, 100, 20],
      d: [300, 0, 100, 20],
    }
    for (const [name, [x, y, w, h]] of Object.entries(rects)) {
      jobRow(name).getBoundingClientRect = () => new DOMRect(x, y, w, h)
    }
    const nodes: Record<string, [number, number, number, number]> = {
      node_a: [0, 0, 100, 40],
      node_b: [0, 90, 100, 70],
      node_d: [300, 0, 100, 40],
    }
    for (const [id, [x, y, w, h]] of Object.entries(nodes)) {
      const el = document.getElementById(id) as HTMLElement
      el.getBoundingClientRect = () => new DOMRect(x, y, w, h)
    }
    // The one connector, a to d, runs straight across from a's right edge to d's left.
    for (const path of document.querySelectorAll('path[data-dag-edge-from]')) {
      Object.assign(path, {
        getTotalLength: () => 200,
        getPointAtLength: (at: number) => ({ x: 100 + at, y: 10 }),
        getScreenCTM: () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }),
      })
    }
  }

  function selected(): string[] {
    return [...document.querySelectorAll('[data-dag-job][data-selected]')].map(
      (el) => el.getAttribute('data-dag-job') ?? '',
    )
  }

  function marquee(from: [number, number], to: [number, number], shift = false) {
    const empty = document.getElementById('node_a')?.parentElement as HTMLElement
    fireEvent.pointerDown(empty, {
      button: 0,
      clientX: from[0],
      clientY: from[1],
      shiftKey: shift,
    })
    act(() => {
      fireEvent.pointerMove(window, { clientX: to[0], clientY: to[1] })
    })
    act(() => {
      fireEvent.pointerUp(window, { clientX: to[0], clientY: to[1] })
    })
  }

  function drag(from: HTMLElement, to: HTMLElement, at: [number, number]) {
    underPointer = to
    fireEvent.pointerDown(from, { button: 0, clientX: 350, clientY: 10 })
    act(() => {
      fireEvent.pointerMove(window, { clientX: at[0], clientY: at[1] })
    })
    release(at)
  }

  it('selects the jobs a shift-drag on empty space touches, adding to them', () => {
    renderGraph(editor())
    marquee([-10, 90], [150, 125])
    expect(selected()).toEqual([])
    marquee([-10, 90], [150, 125], true)
    expect(selected()).toEqual(['b'])
    marquee([290, -10], [410, 30], true)
    expect(selected().sort()).toEqual(['b', 'd'])
    expect(
      screen.getByRole('button', {
        name: 'Drag to move the selected jobs together',
      }),
    ).toBeInTheDocument()
    marquee([500, 500], [500, 500])
    expect(selected()).toEqual([])
  })

  const connector = () => screen.getByRole('button', { name: 'd depends on a' })
  function stepRowOf(job: string, rect: [number, number, number, number]) {
    fireEvent.click(within(jobRow(job)).getByRole('button', { name: job.toUpperCase() }))
    const row = document.querySelector(
      `[data-dag-step-job="${job}"][data-dag-step="0"]`,
    ) as HTMLElement
    row.getBoundingClientRect = () => new DOMRect(...rect)
    return row
  }

  it('takes the steps a box touches when it touches no job, and jobs when it does', () => {
    renderGraph(editor())
    const step = stepRowOf('a', [0, 20, 100, 20])
    marquee([-10, 25], [150, 35], true)
    expect(step).toHaveAttribute('data-selected')
    expect(selected()).toEqual([])
    marquee([500, 500], [500, 500])
    marquee([-10, 5], [150, 35], true)
    expect(selected()).toEqual(['a'])
    expect(step).not.toHaveAttribute('data-selected')
  })

  it('takes the connectors a box touches when it touches no job or step', () => {
    renderGraph(editor())
    marquee([180, 0], [220, 20], true)
    expect(connector()).toHaveAttribute('aria-pressed', 'true')
    expect(selected()).toEqual([])
  })

  it('adds only the kind already selected by box, and a shift-click on another kind starts over with it', () => {
    renderGraph(editor())
    fireEvent.click(connector())
    marquee([-10, 90], [150, 125], true)
    expect(selected()).toEqual([])
    expect(connector()).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(within(jobRow('c')).getByRole('button', { name: 'C' }), {
      shiftKey: true,
    })
    expect(selected()).toEqual(['c'])
    expect(connector()).toHaveAttribute('aria-pressed', 'false')
    marquee([180, 0], [220, 20], true)
    expect(connector()).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(connector(), { shiftKey: true })
    expect(selected()).toEqual([])
    expect(connector()).toHaveAttribute('aria-pressed', 'true')
  })

  it('toggles a job with shift-click without opening its steps', () => {
    renderGraph(editor())
    const toggle = within(jobRow('c')).getByRole('button', { name: 'C' })
    fireEvent.click(toggle, { shiftKey: true })
    expect(selected()).toEqual(['c'])
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(toggle, { shiftKey: true })
    expect(selected()).toEqual([])
  })

  it('clears the selection on Escape', () => {
    renderGraph(editor())
    marquee([-10, 90], [150, 155], true)
    expect(selected().sort()).toEqual(['b', 'c'])
    const container = document.querySelector('[tabindex="-1"]') as HTMLElement
    fireEvent.keyDown(container, { key: 'Escape' })
    expect(selected()).toEqual([])
  })

  it('lets go of the selection on a press outside the graph', () => {
    renderGraph(editor())
    marquee([-10, 90], [150, 155], true)
    expect(selected().sort()).toEqual(['b', 'c'])
    fireEvent.pointerDown(document.body, { button: 0 })
    expect(selected()).toEqual([])
  })

  it('outlines the whole selection in one box, across columns', () => {
    renderGraph(editor())
    const outlines = () =>
      [...document.querySelectorAll<HTMLElement>('.rounded-xl.border-dashed')].map((outline) => [
        outline.style.left,
        outline.style.width,
      ])
    const pick = (job: string) =>
      fireEvent.click(within(jobRow(job)).getByRole('button', { name: job.toUpperCase() }), {
        shiftKey: true,
      })
    pick('a')
    pick('c')
    pick('d')
    // From a's node, 36px out, to d's, 36px out.
    expect(outlines()).toEqual([['-36px', '472px']])
  })

  it('puts the selection’s circles level with a selected job’s own', () => {
    renderGraph(editor())
    fireEvent.click(within(jobRow('a')).getByRole('button', { name: 'A' }), { shiftKey: true })
    const own = document.querySelector('[data-dag-port="in"][data-dag-node="a"]') as HTMLElement
    const selection = document.querySelector(
      '[data-dag-selection][data-dag-port="in"]',
    ) as HTMLElement
    expect(selection.style.top).toBe(own.style.top)
  })

  it('draws the selection’s grip over its circles', () => {
    renderGraph(editor())
    fireEvent.click(within(jobRow('a')).getByRole('button', { name: 'A' }), { shiftKey: true })
    const grip = screen.getByRole('button', { name: GRAPH_EDITOR_STRINGS.moveSelectionHint })
    const circle = document.querySelector('[data-dag-selection][data-dag-port="in"]') as HTMLElement
    // Of two overlapping siblings the later one paints on top, so the circle's square can't cover it.
    expect(circle.compareDocumentPosition(grip) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('moves the selected jobs together, anchored on the one dragged', () => {
    const e = editor()
    renderGraph(e)
    fireEvent.click(within(jobRow('b')).getByRole('button', { name: 'B' }), {
      shiftKey: true,
    })
    fireEvent.click(within(jobRow('d')).getByRole('button', { name: 'D' }), {
      shiftKey: true,
    })
    // Just below column 0's last box, the first empty row.
    drag(jobRow('d'), jobRow('d'), [50, 200])
    expect(e.onEdit).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'move',
        jobs: ['b', 'd'],
        anchor: 'd',
        to: { column: 0, row: 2 },
      }),
    )
  })

  it('connects every selected job from the selection’s circles', () => {
    const e = editor()
    renderGraph(e)
    marquee([-10, 90], [150, 125], true)
    marquee([290, -10], [410, 30], true)
    const out = document.querySelector('[data-dag-selection][data-dag-port="out"]') as HTMLElement
    drag(out, jobRow('c'), [60, 60])
    expect(e.onEdit).toHaveBeenCalledWith(
      connectedFrom([
        ['b', 'c'],
        ['d', 'c'],
      ]),
    )
  })
})

describe('moves and removals an expression depends on', () => {
  // d reads an output of b, the job it needs.
  const reading = {
    jobs: {
      a: { steps: [{ run: 'a' }] },
      b: { needs: ['a'], steps: [{ run: 'b' }] },
      d: { needs: ['b'], steps: [{ run: 'echo ${{ needs.b.outputs.v }}' }] },
    },
  }
  const plain = {
    jobs: { ...reading.jobs, d: { needs: ['b'], steps: [{ run: 'echo' }] } },
  }

  // jsdom lays nothing out, so each node gets a rect by hand.
  function renderGraph(yml: typeof reading, e: DependencyGraphEditor) {
    render(<DependencyGraphPreview yml={yml} editor={e} />)
    const node = document.getElementById('node_a') as HTMLElement
    act(() => {
      fireEvent.mouseEnter(node)
    })
    act(() => {
      fireEvent.mouseLeave(node)
    })
    const rects: Record<string, [number, number, number, number]> = {
      node_a: [0, 0, 100, 40],
      node_b: [300, 0, 100, 40],
      node_d: [600, 0, 100, 40],
    }
    for (const [id, [x, y, w, h]] of Object.entries(rects)) {
      const el = document.getElementById(id) as HTMLElement
      el.getBoundingClientRect = () => new DOMRect(x, y, w, h)
    }
  }

  function dragIntoColumnOfB() {
    fireEvent.pointerDown(jobRow('d'), { button: 0, clientX: 650, clientY: 20 })
    act(() => {
      fireEvent.pointerMove(window, { clientX: 350, clientY: 300 })
    })
    release([350, 300])
  }

  it('refuses a move that would cut a need an expression reads', () => {
    const e = editor()
    renderGraph(reading, e)
    dragIntoColumnOfB()
    expect(e.onEdit).not.toHaveBeenCalled()
  })

  it('makes the same move when no expression reads the need', () => {
    const e = editor()
    renderGraph(plain, e)
    dragIntoColumnOfB()
    expect(e.onEdit).toHaveBeenCalledWith(expect.objectContaining({ type: 'move', jobs: ['d'] }))
  })

  const connectors = () => screen.getAllByRole('button', { name: / depends on / })
  const ends = () => [...document.querySelectorAll('[data-dag-edge-end]')]

  it('keeps Remove dependency off where an expression reads the need', () => {
    const e = editor()
    renderGraph(reading, e)
    const [fromA, fromB] = connectors()
    fireEvent.contextMenu(fromB as Element)
    const inUse = within(screen.getByRole('menu')).getByText('Remove dependency').closest('button')
    expect(inUse).toHaveAttribute('aria-disabled', 'true')
    fireEvent.click(inUse as Element)
    expect(e.onEdit).not.toHaveBeenCalled()
    fireEvent.keyDown(window, { key: 'Escape' })
    fireEvent.contextMenu(fromA as Element)
    const free = within(screen.getAllByRole('menu').at(-1) as HTMLElement)
      .getByText('Remove dependency')
      .closest('button')
    expect(free).not.toHaveAttribute('aria-disabled', 'true')
  })

  it('selects a connector with a click, adds connectors with shift, and deletes them with Delete', () => {
    const e = editor({ onEdit: vi.fn(() => ({ yml: '', layout: undefined })) })
    renderGraph(plain, e)
    const [fromA, fromB] = connectors()
    fireEvent.click(fromA as Element)
    expect(ends()).toHaveLength(2)
    fireEvent.click(fromB as Element, { shiftKey: true })
    expect(ends()).toHaveLength(4)
    const container = document.querySelector('[tabindex="-1"]') as HTMLElement
    fireEvent.keyDown(container, { key: 'Delete' })
    expect(e.onEdit).toHaveBeenCalledWith({
      type: 'disconnect',
      needs: [
        { job: 'b', need: 'a' },
        { job: 'd', need: 'b' },
      ],
    })
    expect(ends()).toHaveLength(0)
  })

  it('selects a connector from the keyboard and removes it with Delete', () => {
    const e = editor({ onEdit: vi.fn(() => ({ yml: '', layout: undefined })) })
    renderGraph(plain, e)
    const connector = screen.getByRole('button', { name: 'b depends on a' })
    expect(connector).toHaveAttribute('tabindex', '0')
    fireEvent.keyDown(connector, { key: 'Enter' })
    expect(connector).toHaveAttribute('aria-pressed', 'true')
    fireEvent.keyDown(connector, { key: 'Delete' })
    expect(e.onEdit).toHaveBeenCalledWith({
      type: 'disconnect',
      needs: [{ job: 'b', need: 'a' }],
    })
  })

  it('connects jobs from the job menu, offering only needs that make no loop', () => {
    const e = editor()
    renderGraph(plain, e)
    fireEvent.contextMenu(jobRow('a'), { clientX: 5, clientY: 5 })
    const menu = screen.getByRole('menu')
    // b and d already wait on a, so a can need neither; b needs a already, d only through b.
    expect(within(menu).queryByText('Depends on')).toBeNull()
    fireEvent.click(within(menu).getByText('Needed by'))
    // Named as the graph names them.
    expect(within(menu).queryByRole('button', { name: 'B' })).toBeNull()
    fireEvent.click(within(menu).getByRole('button', { name: 'D' }))
    expect(e.onEdit).toHaveBeenCalledWith(connectedFrom([['a', 'd']]))
  })

  it('takes a job menu opened from the keyboard, arrows through it and gives focus back', () => {
    renderGraph(plain, editor())
    const more = within(jobRow('a')).getByRole('button', {
      name: 'Job actions',
    })
    // jsdom's :focus-visible follows the event in flight, so the opener is stated to show keyboard focus.
    const matches = Element.prototype.matches
    const spy = vi.spyOn(Element.prototype, 'matches').mockImplementation(function (
      this: Element,
      selector: string,
    ) {
      return selector === ':focus-visible' ? this === more : matches.call(this, selector)
    })
    onTestFinished(() => spy.mockRestore())
    more.focus()
    fireEvent.click(more)
    const items = within(screen.getByRole('menu')).getAllByRole('button')
    expect(items[0]).toHaveFocus()
    fireEvent.keyDown(items[0] as HTMLElement, { key: 'ArrowDown' })
    expect(items[1]).toHaveFocus()
    fireEvent.keyDown(items[1] as HTMLElement, { key: 'ArrowUp' })
    fireEvent.keyDown(items[0] as HTMLElement, { key: 'ArrowUp' })
    expect(items.at(-1)).toHaveFocus()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(more).toHaveFocus()
  })

  it('moves the start of a selected connector onto another job', () => {
    const e = editor()
    renderGraph(plain, e)
    const [, fromB] = connectors()
    fireEvent.click(fromB as Element)
    const start = document.querySelector('[data-dag-edge-end="from"]') as HTMLElement
    underPointer = jobRow('a')
    fireEvent.pointerDown(start, { button: 0, clientX: 400, clientY: 20 })
    act(() => {
      fireEvent.pointerMove(window, { clientX: 60, clientY: 20 })
    })
    release([60, 20])
    expect(e.onEdit).toHaveBeenCalledWith({
      type: 'batch',
      edits: [
        { type: 'disconnect', needs: [{ job: 'd', need: 'b' }] },
        { type: 'connect', from: 'a', to: 'd' },
        { type: 'placeAfterNeeds', jobs: ['d'], layout: expect.any(Object) },
      ],
    })
  })

  it('keeps the ends of a connector an expression reads where they are', () => {
    const e = editor()
    renderGraph(reading, e)
    const [, fromB] = connectors()
    fireEvent.click(fromB as Element)
    const start = document.querySelector('[data-dag-edge-end="from"]') as HTMLElement
    expect(start).toHaveClass('cursor-not-allowed')
    underPointer = jobRow('a')
    fireEvent.pointerDown(start, { button: 0, clientX: 400, clientY: 20 })
    act(() => {
      fireEvent.pointerMove(window, { clientX: 60, clientY: 20 })
    })
    release([60, 20])
    expect(e.onEdit).not.toHaveBeenCalled()
  })
})

describe('nodes formed by hand', () => {
  // b and c need a, so by default they share one node; d stands alone.
  const graph = {
    jobs: {
      a: { steps: [{ run: 'a' }] },
      b: { needs: ['a'], steps: [{ run: 'b' }] },
      c: { needs: ['a'], steps: [{ run: 'c' }] },
      d: { steps: [{ run: 'd' }] },
    },
  }
  const jobs = {
    a: job(),
    b: job(['a']),
    c: job(['a']),
  }

  // jsdom lays nothing out, so each row and node gets a rect by hand.
  function renderEditor(
    e: DependencyGraphEditor,
    layout?: GraphLayout,
    bLeft = 300,
    yml: { jobs: Record<string, unknown> } = graph,
  ) {
    render(<DependencyGraphPreview yml={yml} editor={e} {...(layout ? { layout } : {})} />)
    const node = document.querySelector('[id^="node_"]') as HTMLElement
    act(() => {
      fireEvent.mouseEnter(node)
    })
    act(() => {
      fireEvent.mouseLeave(node)
    })
    const rects: Record<string, [number, number, number, number]> = {
      node_a: [0, 0, 100, 40],
      node_d: [0, 140, 100, 40],
      node_b: [bLeft, 0, 100, 70],
    }
    for (const [id, [x, y, w, h]] of Object.entries(rects)) {
      const el = document.getElementById(id)
      if (el) {
        el.getBoundingClientRect = () => new DOMRect(x, y, w, h)
      }
    }
  }

  function dragRow(job: string, to: [number, number], over: Element | null) {
    underPointer = over
    fireEvent.pointerDown(jobRow(job), { button: 0, clientX: 350, clientY: 20 })
    act(() => {
      fireEvent.pointerMove(window, { clientX: to[0], clientY: to[1] })
    })
    release(to)
  }

  it('pulls a job out of its node and keeps it in the column', () => {
    const e = editor()
    renderEditor(e)
    // The lower half of c's own node puts c in the row below it.
    dragRow('c', [350, 60], jobRow('c'))
    expect(e.onEdit).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'move',
        jobs: ['c'],
        to: { column: 1, row: 1 },
      }),
    )
  })

  it('merges a job dropped on another node, which then shares its needs', () => {
    const e = editor()
    renderEditor(e)
    dragRow('d', [350, 30], document.getElementById('node_b'))
    expect(e.onEdit).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'groupJobs', jobs: ['d'], into: 'b' }),
    )
  })

  it('adds a job dropped from the toolbar onto a node in one edit, though the host can’t read its source', () => {
    const e = editor({ openOnAdd: false, onOpenOnAddChange: vi.fn() })
    renderEditor(e)
    const chip = screen.getByText('Job').closest('button') as HTMLElement
    underPointer = document.getElementById('node_b')
    fireEvent.pointerDown(chip, { button: 0, clientX: 600, clientY: 300 })
    act(() => {
      fireEvent.pointerMove(window, { clientX: 350, clientY: 30 })
    })
    release([350, 30])
    expect(e.onEdit).toHaveBeenCalledOnce()
    expect(e.onEdit).toHaveBeenCalledWith({
      type: 'batch',
      edits: [
        { type: 'addJob' },
        expect.objectContaining({ type: 'groupJobs', jobs: ['job_1'], into: 'b' }),
      ],
    })
  })

  it('merges a job into a node that needs it, whose jobs then drop that need', () => {
    const e = editor()
    renderEditor(e)
    dragRow('a', [350, 30], document.getElementById('node_b'))
    expect(e.onEdit).toHaveBeenCalledWith({
      type: 'batch',
      edits: [
        {
          type: 'disconnect',
          needs: [
            { job: 'b', need: 'a' },
            { job: 'c', need: 'a' },
          ],
        },
        expect.objectContaining({ type: 'groupJobs', jobs: ['a'], into: 'b' }),
      ],
    })
  })

  it('merges a job into a node as one unit, which a reset layout keeps together', () => {
    // b and c need a; x needs only b, and y only c, so they start as two nodes.
    const units = {
      jobs: {
        a: { steps: [{ run: 'a' }] },
        b: { needs: ['a'], steps: [{ run: 'b' }] },
        c: { needs: ['a'], steps: [{ run: 'c' }] },
        x: { needs: ['b'], steps: [{ run: 'x' }] },
        y: { needs: ['c'], steps: [{ run: 'y' }] },
      },
    }
    const e = editor()
    renderEditor(e, undefined, 300, units)
    dragRow('c', [350, 30], document.getElementById('node_b'))
    expect(e.onEdit).toHaveBeenCalledWith({
      type: 'batch',
      edits: [
        expect.objectContaining({ type: 'groupJobs', jobs: ['c'], into: 'b' }),
        { type: 'connect', from: 'c', to: 'x' },
        { type: 'connect', from: 'b', to: 'y' },
      ],
    })
    const joined = vi.mocked(e.onEdit).mock.calls[0]?.[0] as GraphEdit
    const { yml } = applyGraphEdit({ yml: dumpYaml(units), layout: undefined }, joined)
    const needs = jobNeeds((loadYaml(yml) as { jobs: unknown }).jobs)
    const reset = computeGraphLayout(
      testEngine,
      Object.fromEntries(Object.entries(needs).map(([name, list]) => [name, job(list)])),
      {},
    )
    expect(reset.dependencyCols[1]).toEqual([['b', 'c']])
  })

  it('leaves every job in a node a job merges into with every need the node draws', () => {
    // x and m share a node, since q already waits on p, but only m lists p.
    const e = editor()
    renderEditor(e, undefined, 300, {
      jobs: {
        p: { steps: [{ run: 'p' }] },
        e: { steps: [{ run: 'e' }] },
        q: { needs: ['p'], steps: [{ run: 'q' }] },
        x: { needs: ['q'], steps: [{ run: 'x' }] },
        m: { needs: ['p', 'q'], steps: [{ run: 'm' }] },
      },
    })
    dragRow('e', [350, 30], document.getElementById('node_x'))
    expect(e.onEdit).toHaveBeenCalledWith({
      type: 'batch',
      edits: [
        expect.objectContaining({ type: 'groupJobs', jobs: ['e'], into: 'x' }),
        { type: 'connect', from: 'p', to: 'x' },
        { type: 'connect', from: 'p', to: 'e' },
      ],
    })
  })

  it('refuses a merge that drops a need an expression reads', () => {
    const e = editor()
    renderEditor(e, undefined, 300, {
      jobs: {
        ...graph.jobs,
        b: { needs: ['a'], steps: [{ run: 'echo ${{ needs.a.outputs.v }}' }] },
      },
    })
    dragRow('a', [350, 30], document.getElementById('node_b'))
    expect(e.onEdit).not.toHaveBeenCalled()
  })

  it('refuses a merge that would loop through another job', () => {
    // a feeds m, which feeds b, so a can't sit beside b.
    const e = editor()
    renderEditor(e, undefined, 300, {
      jobs: {
        a: { steps: [{ run: 'a' }] },
        m: { needs: ['a'], steps: [{ run: 'm' }] },
        b: { needs: ['m'], steps: [{ run: 'b' }] },
        d: { steps: [{ run: 'd' }] },
      },
    })
    dragRow('a', [350, 30], document.getElementById('node_b'))
    expect(e.onEdit).not.toHaveBeenCalled()
  })

  it('drops a job columns out past either side, one more per column width', () => {
    const e = editor()
    renderEditor(e)
    dragRow('d', [900, 400], null)
    expect(e.onEdit).toHaveBeenLastCalledWith(
      expect.objectContaining({
        type: 'move',
        jobs: ['d'],
        to: { column: 3, row: 2 },
      }),
    )
    dragRow('d', [-500, 20], null)
    expect(e.onEdit).toHaveBeenLastCalledWith(
      expect.objectContaining({
        type: 'move',
        jobs: ['d'],
        to: { column: -2, row: 0 },
      }),
    )
  })

  it('drops nothing on a release over the page around the graph', () => {
    const e = editor()
    renderEditor(e)
    dragRow('d', [-500, 20], document.body)
    expect(e.onEdit).not.toHaveBeenCalled()
  })

  it('drops a job above the top row', () => {
    const e = editor()
    renderEditor(e)
    dragRow('d', [50, -100], null)
    expect(e.onEdit).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'move',
        jobs: ['d'],
        to: { column: 0, row: -1 },
      }),
    )
  })

  it('leaves a column empty between two nodes and drops a job in it', () => {
    const layout = emptyLayoutWith({
      a: [0, 0],
      d: [0, 1],
      b: [2, 0],
      c: [2, 0],
    })
    expect(computeGraphLayout(testEngine, jobs, {}, layout).colSlots).toEqual([0, 2])
    const e = editor()
    renderEditor(e, layout, 300 + COLUMN_PITCH)
    expect(document.getElementById('node_b')?.parentElement?.style.marginLeft).toBe(
      `${COLUMN_PITCH}px`,
    )
    expect(document.getElementById('node_a')?.parentElement?.style.marginLeft).toBe('')
    dragRow('d', [400, 200], null)
    expect(e.onEdit).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'move',
        jobs: ['d'],
        to: { column: 1, row: 1 },
      }),
    )
  })
})

function emptyLayoutWith(entries: Record<string, [number, number]>) {
  return layoutFromCols(
    [],
    Object.fromEntries(
      Object.entries(entries).map(([job, [column, row]]) => [job, { column, row }]),
    ),
  )
}

describe('steps, the clipboard and the arrow keys', () => {
  const graph = {
    jobs: {
      build: {
        steps: [
          { name: 'compile', run: 'make' },
          { name: 'pack', run: 'tar' },
        ],
      },
      test: {
        needs: ['build'],
        steps: [{ name: 'unit', run: 'echo ${{ needs.build.outputs.x }}' }],
      },
      lint: { steps: [{ name: 'check', run: 'x' }] },
    },
  }
  const text = dumpYaml(graph)
  const withSource = () => editor({ readSource: () => text })

  function renderGraph(e: DependencyGraphEditor) {
    render(<DependencyGraphPreview yml={graph} editor={e} />)
    return jobRow('build').closest('[tabindex="-1"]') as HTMLElement
  }
  function openSteps(job: string, label: string) {
    fireEvent.click(within(jobRow(job)).getByRole('button', { name: label }))
  }
  function stepRow(job: string, index: number): HTMLElement {
    return document.querySelector(
      `[data-dag-step-job="${job}"][data-dag-step="${index}"]`,
    ) as HTMLElement
  }
  const selected = (el: HTMLElement) => el.hasAttribute('data-selected')

  it('selects steps with shift-click, and a shift-click on a job or step starts over with it', () => {
    renderGraph(withSource())
    openSteps('build', 'Build')
    fireEvent.click(stepRow('build', 0), { shiftKey: true })
    fireEvent.click(stepRow('build', 1), { shiftKey: true })
    expect(selected(stepRow('build', 0))).toBe(true)
    expect(selected(stepRow('build', 1))).toBe(true)
    fireEvent.click(jobRow('lint'), { shiftKey: true })
    expect(selected(jobRow('lint'))).toBe(true)
    expect(selected(stepRow('build', 0))).toBe(false)
    expect(selected(stepRow('build', 1))).toBe(false)
    fireEvent.click(stepRow('build', 1), { shiftKey: true })
    expect(selected(stepRow('build', 1))).toBe(true)
    expect(selected(jobRow('lint'))).toBe(false)
  })

  it('drops a step between the steps of the matrix run under the pointer, with both runs open', () => {
    const matrix = {
      jobs: {
        run: {
          strategy: { matrix: { os: ['linux', 'mac'] } },
          steps: [
            { name: 'first', run: 'a' },
            { name: 'second', run: 'b' },
          ],
        },
        lint: { steps: [{ name: 'check', run: 'x' }] },
      },
    }
    const e = editor({ readSource: () => dumpYaml(matrix) })
    render(<DependencyGraphPreview yml={matrix} editor={e} />)
    fireEvent.click(screen.getByRole('button', { name: 'Expand All' }))
    // The first run's steps sit above the second run's.
    const copies = [...document.querySelectorAll<HTMLElement>('[data-dag-step-job="run"]')]
    expect(copies).toHaveLength(4)
    copies.forEach((row, i) => {
      const top = [100, 130, 300, 330][i] ?? 0
      row.getBoundingClientRect = () => new DOMRect(0, top, 200, 20)
    })
    underPointer = copies[1] ?? null
    fireEvent.pointerDown(stepRow('lint', 0), { button: 0, clientX: 0, clientY: 0 })
    act(() => {
      fireEvent.pointerMove(window, { clientX: 50, clientY: 125 })
    })
    release([50, 125])
    expect(e.onEdit).toHaveBeenCalledWith({
      type: 'moveSteps',
      steps: [{ job: 'lint', index: 0 }],
      job: 'run',
      index: 1,
    })
  })

  it('lets go of the selected steps on undo, redo or a dialog’s save, which can renumber them', () => {
    const e = editor({ readSource: () => text, canRedo: true, settingsView: 'form' })
    const container = renderGraph(e)
    openSteps('build', 'Build')
    const pick = () => {
      fireEvent.click(stepRow('build', 1), { shiftKey: true })
      expect(selected(stepRow('build', 1))).toBe(true)
    }
    pick()
    fireEvent.keyDown(container, { key: 'z', ctrlKey: true })
    expect(e.onUndo).toHaveBeenCalledOnce()
    expect(selected(stepRow('build', 1))).toBe(false)
    pick()
    fireEvent.click(screen.getByRole('button', { name: 'Redo' }))
    expect(selected(stepRow('build', 1))).toBe(false)
    pick()
    fireEvent.click(screen.getByTestId('compile'))
    fireEvent.change(screen.getByLabelText(GRAPH_EDITOR_STRINGS.stepName), {
      target: { value: 'build it' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(selected(stepRow('build', 1))).toBe(false)
  })

  it('drags the selected steps into another job as one edit', () => {
    const e = withSource()
    renderGraph(e)
    openSteps('build', 'Build')
    fireEvent.click(stepRow('build', 0), { shiftKey: true })
    fireEvent.click(stepRow('build', 1), { shiftKey: true })
    underPointer = jobRow('lint')
    fireEvent.pointerDown(stepRow('build', 0), {
      button: 0,
      clientX: 0,
      clientY: 0,
    })
    act(() => {
      fireEvent.pointerMove(window, { clientX: 60, clientY: 60 })
    })
    release([60, 60])
    expect(e.onEdit).toHaveBeenCalledWith({
      type: 'moveSteps',
      steps: [
        { job: 'build', index: 0 },
        { job: 'build', index: 1 },
      ],
      job: 'lint',
      index: 1,
    })
  })

  it('refuses a step drop that would break an expression, and says why', () => {
    const e = withSource()
    renderGraph(e)
    openSteps('test', 'Test')
    underPointer = jobRow('lint')
    fireEvent.pointerDown(stepRow('test', 0), {
      button: 0,
      clientX: 0,
      clientY: 0,
    })
    act(() => {
      fireEvent.pointerMove(window, { clientX: 60, clientY: 60 })
    })
    expect(
      screen.getByText('"unit" reads needs.build, which lint doesn\'t need'),
    ).toBeInTheDocument()
    release([60, 60])
    expect(e.onEdit).not.toHaveBeenCalled()
  })

  it('copies the selected jobs and pastes them back as new jobs below them', () => {
    const e = withSource()
    const container = renderGraph(e)
    // Picking a job with the pointer focuses the graph.
    container.focus()
    fireEvent.click(jobRow('lint'), { shiftKey: true })
    const setData = vi.fn()
    fireEvent.copy(container, { clipboardData: { setData } })
    const copied = setData.mock.calls[0]?.[1] as string
    expect(setData).toHaveBeenCalledWith('text/plain', expect.stringContaining('lint:'))
    fireEvent.paste(container, { clipboardData: { getData: () => copied } })
    expect(e.onEdit).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'pasteJobs',
        yaml: copied,
        offsets: { lint: { column: 0, row: 0 } },
        to: expect.objectContaining({ column: 0 }),
      }),
    )
  })

  it('copies and pastes jobs while the graph has focus, though the page holds a text selection', () => {
    const e = withSource()
    const container = renderGraph(e)
    const elsewhere = document.createElement('p')
    elsewhere.textContent = 'some page text'
    document.body.append(elsewhere)
    onTestFinished(() => elsewhere.remove())
    container.focus()
    fireEvent.click(jobRow('lint'), { shiftKey: true })
    // The browser sends the copy to where the page's text selection is, outside the graph.
    const setData = vi.fn()
    fireEvent.copy(elsewhere, { clipboardData: { setData } })
    expect(setData).toHaveBeenCalledWith('text/plain', expect.stringContaining('lint:'))
    fireEvent.paste(elsewhere, { clipboardData: { getData: () => setData.mock.calls[0]?.[1] } })
    expect(e.onEdit).toHaveBeenCalledWith(expect.objectContaining({ type: 'pasteJobs' }))
  })

  it('pastes nothing when the clipboard holds no text, not what was copied before', () => {
    const e = withSource()
    const container = renderGraph(e)
    container.focus()
    fireEvent.click(jobRow('lint'), { shiftKey: true })
    fireEvent.copy(container, { clipboardData: { setData: vi.fn() } })
    fireEvent.paste(container, { clipboardData: { getData: () => '' } })
    expect(e.onEdit).not.toHaveBeenCalled()
  })

  it('leaves a copy outside the graph to the page when the graph doesn’t have focus', () => {
    const e = withSource()
    renderGraph(e)
    fireEvent.click(jobRow('lint'), { shiftKey: true })
    const setData = vi.fn()
    fireEvent.copy(document.body, { clipboardData: { setData } })
    expect(setData).not.toHaveBeenCalled()
  })

  it('copies and pastes with Cmd and with Ctrl alike', () => {
    const writeText = vi.fn(() => Promise.resolve())
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    })
    const e = withSource()
    const container = renderGraph(e)
    fireEvent.click(jobRow('lint'), { shiftKey: true })
    // jsdom is no Mac, so Cmd is the key the browser leaves to the page.
    fireEvent.keyDown(container, { key: 'c', metaKey: true })
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('lint:'))
    fireEvent.keyDown(container, { key: 'v', metaKey: true })
    expect(e.onEdit).toHaveBeenCalledTimes(1)
    expect(e.onEdit).toHaveBeenLastCalledWith(expect.objectContaining({ type: 'pasteJobs' }))
    // Ctrl+V is the browser's own paste; without a paste event, what was copied here still pastes.
    vi.useFakeTimers()
    try {
      fireEvent.keyDown(container, { key: 'v', ctrlKey: true })
      act(() => {
        vi.advanceTimersByTime(150)
      })
    } finally {
      vi.useRealTimers()
    }
    expect(e.onEdit).toHaveBeenCalledTimes(2)
  })

  it('moves the selected jobs with the arrow keys, and leaves the keys alone otherwise', () => {
    const e = withSource()
    const container = renderGraph(e)
    expect(fireEvent.keyDown(container, { key: 'ArrowDown' })).toBe(true)
    fireEvent.click(jobRow('lint'), { shiftKey: true })
    expect(fireEvent.keyDown(container, { key: 'ArrowDown' })).toBe(false)
    expect(e.onEdit).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'nudge',
        jobs: ['lint'],
        direction: 'down',
      }),
    )
  })

  it('lists the gestures and keys from the toolbar and closes on Escape', () => {
    render(<DependencyGraphPreview yml={graph} editor={editor()} />)
    const button = screen.getByRole('button', { name: 'Shortcuts' })
    fireEvent.click(button)
    const list = screen.getByRole('dialog', { name: 'Shortcuts' })
    expect(within(list).getByText(GRAPH_EDITOR_STRINGS.shortcutDoes.connect)).toBeInTheDocument()
    expect(list).toHaveFocus()
    fireEvent.keyDown(list, { key: 'Escape' })
    expect(screen.queryByRole('dialog', { name: 'Shortcuts' })).toBeNull()
    expect(button).toHaveFocus()
  })

  it('sets the same view controls in one bar whether or not the graph is being edited', () => {
    for (const props of [{ editor: editor() }, {}]) {
      render(<DependencyGraphPreview yml={graph} {...props} />)
      const reset = screen.getByRole('button', { name: 'Reset View' })
      expect(reset).not.toHaveClass('btn')
      expect(reset.parentElement).toContainElement(screen.getByRole('button', { name: 'Zoom in' }))
      expect(reset.parentElement).toContainElement(screen.getByRole('button', { name: 'Zoom out' }))
      cleanup()
    }
  })

  it('keeps the editing toolbar off a graph that is not being edited', () => {
    render(<DependencyGraphPreview yml={graph} />)
    for (const name of ['Shortcuts', 'Undo', 'Redo', 'Workflow settings']) {
      expect(screen.queryByRole('button', { name })).toBeNull()
    }
    expect(screen.queryByText('Matrix job')).toBeNull()
  })
})

describe('problems and the YAML beside the graph', () => {
  const graph = {
    jobs: {
      build: { steps: [{ name: 'compile', run: 'make' }] },
      test: { needs: ['build'], steps: [{ name: 'unit', run: 'x' }] },
    },
  }
  const problems = [
    { message: 'test reads needs.lint', line: 7, job: 'test' },
    { message: 'unit reads matrix.os', line: 9, job: 'test', step: 0 },
  ]
  function renderGraph(e: DependencyGraphEditor) {
    render(<DependencyGraphPreview yml={graph} editor={e} />)
  }
  const badge = (el: HTMLElement) => el.querySelector('[data-problem-badge]') as HTMLElement | null

  it('counts its problems in the toolbar and picks one from the list', () => {
    const pick = vi.fn()
    renderGraph(
      editor({
        problems,
        listedProblems: [{ ...problems[0]!, pick }, problems[1]!],
      }),
    )
    // The node's badge counts the same two; the toolbar's count is the one that opens a list.
    const count = screen
      .getAllByRole('button', { name: '2 problems' })
      .find((button) => button.hasAttribute('aria-expanded'))
    fireEvent.click(count as HTMLElement)
    const list = screen.getByRole('dialog', { name: '2 problems' })
    expect(within(list).queryByRole('button', { name: /unit reads matrix\.os/ })).toBeNull()
    fireEvent.click(within(list).getByRole('button', { name: /test reads needs\.lint/ }))
    expect(pick).toHaveBeenCalledOnce()
    expect(screen.queryByRole('dialog', { name: '2 problems' })).toBeNull()
  })

  it('brings a picked problem’s job, or step, into view selected and opens it', () => {
    let show: ((problem: EditorProblem) => boolean) | undefined
    renderGraph(
      editor({
        problems,
        registerShow: (next) => {
          show = next
          return () => {}
        },
      }),
    )
    act(() => {
      expect(show?.({ message: '', line: 9, job: 'test', step: 0 })).toBe(true)
    })
    expect(document.querySelector('[data-dag-step-job="test"][data-dag-step="0"]')).toHaveAttribute(
      'data-selected',
    )
    expect(screen.getByRole('dialog', { name: 'Edit step' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    act(() => {
      show?.({ message: '', line: 3, job: 'build' })
    })
    expect(jobRow('build')).toHaveAttribute('data-selected')
    expect(screen.getByRole('dialog', { name: 'Edit job' })).toBeInTheDocument()
    expect(show?.({ message: '', line: 1, input: ['name'] })).toBe(false)
  })

  it('marks a job and its step with their problems, and not their node', () => {
    const onReveal = vi.fn()
    renderGraph(editor({ problems, onReveal }))
    fireEvent.click(within(jobRow('test')).getByRole('button', { name: 'Test' }))
    // The job's badge lists its steps' problems too.
    expect(badge(jobRow('test'))?.dataset['tooltipContent']).toBe(
      'test reads needs.lint\nunit reads matrix.os',
    )
    const step = document.querySelector(
      '[data-dag-step-job="test"][data-dag-step="0"]',
    ) as HTMLElement
    expect(badge(step)?.dataset['tooltipContent']).toBe('unit reads matrix.os')
    expect(badge(jobRow('build'))).toBeNull()
    expect(jobRow('test')).toHaveClass('ring-(--theme-error)')
    expect(step).toHaveClass('ring-(--theme-error)')
    expect(jobRow('build')).not.toHaveClass('ring-(--theme-error)')
    expect(
      document.getElementById('node_test')?.querySelector('.border-\\(--theme-error\\)'),
    ).toBeNull()
    onReveal.mockClear()
    fireEvent.click(badge(step) as HTMLElement)
    expect(onReveal).toHaveBeenCalledTimes(1)
    expect(onReveal).toHaveBeenCalledWith({ line: 9 })
  })

  it('shows a clicked or selected job or step in the YAML', () => {
    const onReveal = vi.fn()
    renderGraph(editor({ onReveal }))
    fireEvent.click(within(jobRow('build')).getByRole('button', { name: 'Build' }))
    expect(onReveal).toHaveBeenLastCalledWith({ job: 'build' })
    fireEvent.click(screen.getByTestId('compile'))
    expect(onReveal).toHaveBeenLastCalledWith({ job: 'build', step: 0 })
    fireEvent.click(jobRow('test'), { shiftKey: true })
    expect(onReveal).toHaveBeenLastCalledWith({ job: 'test' })
    // Taking a job out of the selection shows nothing.
    onReveal.mockClear()
    fireEvent.click(jobRow('test'), { shiftKey: true })
    expect(onReveal).not.toHaveBeenCalled()
  })

  it('lists the linter’s problems for the job or step a dialog edits', () => {
    const lint = vi.fn(() => [
      { path: 'jobs.build.steps.0.run', message: 'reads inputs.nope', line: 5 },
      { path: 'jobs.test.needs', message: 'not this dialog’s', line: 8 },
    ])
    window.validateWorkflow = lint
    try {
      render(
        <DependencyGraphPreview
          yml={graph}
          editor={editor({ readSource: () => dumpYaml(graph) })}
        />,
      )
      fireEvent.click(within(jobRow('build')).getByRole('button', { name: 'Build' }))
      fireEvent.click(screen.getByTestId('compile'))
      expect(screen.getByText('reads inputs.nope')).toBeInTheDocument()
      expect(screen.queryByText('not this dialog’s')).toBeNull()
      expect(lint).toHaveBeenCalled()
    } finally {
      delete window.validateWorkflow
    }
  })

  it('marks the field a problem is at, leads to it, and makes its fix in one click', () => {
    window.validateWorkflow = vi.fn(() => [
      {
        path: 'jobs.build.steps.0.run',
        message: 'reads inputs.mdoe',
        line: 5,
        fix: { find: 'inputs.mdoe', replace: 'inputs.mode', key: false },
      },
    ])
    const typo = {
      jobs: {
        build: {
          steps: [{ name: 'compile', run: 'echo ${{ inputs.mdoe }}' }],
        },
      },
    }
    try {
      render(
        <DependencyGraphPreview
          yml={typo}
          editor={editor({
            readSource: () => dumpYaml(typo),
            settingsView: 'form',
          })}
        />,
      )
      fireEvent.click(within(jobRow('build')).getByRole('button', { name: 'Build' }))
      fireEvent.click(screen.getByTestId('compile'))
      const commands = screen.getByLabelText('Commands')
      expect(commands).toHaveAttribute('aria-invalid', 'true')
      fireEvent.click(screen.getByRole('button', { name: 'reads inputs.mdoe' }))
      expect(commands).toHaveFocus()
      fireEvent.click(screen.getByRole('button', { name: 'Use inputs.mode' }))
      expect(commands).toHaveValue('echo ${{ inputs.mode }}')
    } finally {
      delete window.validateWorkflow
    }
  })

  it('renames a key an action does not take to the input it likely meant', () => {
    window.validateWorkflow = vi.fn(() => [
      {
        path: 'jobs.build.steps.0.with.schedulerType',
        message: 'no input called schedulerType',
        line: 7,
        fix: { find: 'schedulerType', replace: 'scheduler-type', key: true },
      },
    ])
    const typo = {
      jobs: {
        build: {
          ssh: { remoteHost: '10.0.0.1' },
          steps: [
            {
              name: 'agent',
              uses: 'example/scheduler-agent',
              with: { schedulerType: 'pbs' },
            },
          ],
        },
      },
    }
    const e = editor({ readSource: () => dumpYaml(typo), settingsView: 'form' })
    try {
      render(<DependencyGraphPreview yml={typo} editor={e} />)
      fireEvent.click(within(jobRow('build')).getByRole('button', { name: 'Build' }))
      fireEvent.click(screen.getByTestId('agent'))
      fireEvent.click(screen.getByRole('button', { name: 'Use scheduler-type' }))
      fireEvent.click(screen.getByRole('button', { name: 'Save' }))
      expect(e.onEdit).toHaveBeenLastCalledWith(
        expect.objectContaining({
          type: 'updateStep',
          set: { with: { 'scheduler-type': 'pbs' } },
        }),
      )
    } finally {
      delete window.validateWorkflow
    }
  })
})

// A section's fold is decided once, as its dialog opens; after that it stays as the user leaves it.
describe('dialog sections', () => {
  const section = (title: string) => {
    const found = [...document.querySelectorAll('details')].find(
      (details) => details.querySelector('summary')?.textContent === title,
    )
    if (!found) {
      throw new Error(`no ${title} section`)
    }
    return found
  }
  const toggle = (details: HTMLDetailsElement) => {
    details.open = !details.open
    fireEvent(details, new Event('toggle'))
  }

  it('stays open while what opened it is taken away', () => {
    const retrying = {
      jobs: {
        build: {
          steps: [{ name: 'compile', run: 'make', retry: { 'max-retries': 2 } }],
        },
      },
    }
    render(<DependencyGraphPreview yml={retrying} editor={editor({ settingsView: 'form' })} />)
    fireEvent.click(within(jobRow('build')).getByRole('button', { name: 'Build' }))
    fireEvent.click(screen.getByTestId('compile'))
    expect(section('Retry').open).toBe(true)
    fireEvent.click(screen.getByLabelText('Try again if it fails'))
    expect(section('Retry').open).toBe(true)
  })

  it('keeps how the user left it across the YAML view', async () => {
    render(
      <DependencyGraphPreview
        yml={yml}
        editor={editor({ readSource: () => YML_TEXT, settingsView: 'form' })}
      />,
    )
    fireEvent.contextMenu(jobRow('mac'), { clientX: 5, clientY: 5 })
    fireEvent.click(screen.getByText('Edit job'))
    expect(section('Outputs').open).toBe(false)
    toggle(section('Outputs'))
    toggle(section('Dependencies and condition'))
    fireEvent.click(screen.getByRole('button', { name: 'YAML' }))
    await screen.findByLabelText('file:///workflow-job.yaml')
    fireEvent.click(screen.getByRole('button', { name: 'Form' }))
    expect(section('Outputs').open).toBe(true)
    expect(section('Dependencies and condition').open).toBe(false)
  })
})
