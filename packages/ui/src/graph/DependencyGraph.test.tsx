// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import {
  act,
  cleanup,
  createEvent,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import type { ReactNode, Ref } from 'react'
import { afterEach, describe, expect, it, onTestFinished, vi } from 'vitest'
import { testEngine } from '../test/engine'

// jsdom lacks these; the graph relies on them for connector recompute + fit.
global.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver
// No-op: the graph schedules connector recompute via rAF; running it
// synchronously here would re-enter render. Geometry isn't asserted in jsdom.
global.requestAnimationFrame = (() => 0) as typeof requestAnimationFrame
global.cancelAnimationFrame = (() => {}) as typeof cancelAnimationFrame
Element.prototype.getAnimations = () => []

// Pan/zoom + animation wrappers reduced to plain passthroughs (no layout in jsdom).
vi.mock('../components/Provider', async (importOriginal) =>
  (await import('../test/engine')).mockEngineHooks(importOriginal),
)

// The view bar zooms through the library's handle and learns the scale from its onTransform.
const panZoom = vi.hoisted(() => ({
  onTransform: undefined as ((ref: unknown, state: { scale: number }) => void) | undefined,
  onWheel: undefined as (() => void) | undefined,
  setTransform: vi.fn(),
  state: { positionX: 0, positionY: 0, scale: 0.6 },
}))
vi.mock('react-zoom-pan-pinch', async () => {
  const { forwardRef, useImperativeHandle } = await import('react')
  return {
    TransformWrapper: forwardRef(function TransformWrapper(
      {
        children,
        onTransform,
        onWheel,
      }: {
        children: ReactNode | (() => ReactNode)
        onTransform?: (ref: unknown, state: { scale: number }) => void
        onWheel?: () => void
      },
      ref: Ref<unknown>,
    ) {
      panZoom.onTransform = onTransform
      panZoom.onWheel = onWheel
      useImperativeHandle(ref, () => ({
        instance: { state: panZoom.state },
        setTransform: panZoom.setTransform,
      }))
      return typeof children === 'function' ? children() : children
    }),
    TransformComponent: ({ children }: { children: unknown }) => children,
  }
})
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

// Heavy leaf that only appears inside the log modal; render the log it was
// handed so the modal's message states are assertable.
vi.mock('../logviewer', () => ({
  LogViewer: ({
    log,
    additionalBottomLeftBarComponents,
    additionalBottomRightBarComponents,
  }: {
    log: string
    additionalBottomLeftBarComponents?: React.ReactNode
    additionalBottomRightBarComponents?: React.ReactNode
  }) => (
    <>
      <pre data-testid="log">{log}</pre>
      <div data-testid="log-footer">
        {additionalBottomLeftBarComponents}
        {additionalBottomRightBarComponents}
      </div>
    </>
  ),
}))
vi.mock('./AnnotationBanner', () => ({ AnnotationBanner: () => null }))

import { detectMatrixGroups, emptyLayout, layoutFromCols } from '@parallelworks/workflow-parser'
import { type RunFileResult, UIProvider } from '../components/Provider'
import DependencyGraph, {
  addCleanupSteps,
  computeGraphLayout,
  DependencyGraphPreview,
  intoView,
} from './DependencyGraph'
import type { DependencyGraphEditor } from './editorApi'
import { COLUMN_PITCH, SLOT_PITCH } from './gridSpacing'
import type { WorkflowJob } from './types'

const run = {
  id: 'run-1',
  number: 1,
  slug: 'wf-1',
  workflowName: 'wf',
  status: 'completed',
  executedJobs: {
    build: {
      status: 'completed',
      steps: [
        { name: 'compile', status: 'completed' },
        {
          name: 'run-deploy',
          status: 'completed',
          subworkflow: {
            jobs: {
              prep: {
                status: 'completed',
                steps: [{ name: 'prep-step', status: 'completed' }],
              },
              publish: {
                status: 'completed',
                needs: ['prep'],
                steps: [{ name: 'publish-step', status: 'completed' }],
              },
            },
          },
        },
      ],
    },
    notify: {
      status: 'completed',
      needs: ['build'],
      steps: [{ name: 'notify-step', status: 'completed' }],
    },
  },
}

afterEach(cleanup)

describe('DependencyGraph inline subworkflows', () => {
  it('renders the top-level jobs and hides subworkflow jobs until expanded', () => {
    render(<DependencyGraph run={run} preview />)
    expect(screen.getByText('Build')).toBeInTheDocument()
    expect(screen.getByText('Notify')).toBeInTheDocument()
    expect(screen.queryByText('Prep')).not.toBeInTheDocument()
    expect(screen.queryByText('Publish')).not.toBeInTheDocument()
  })

  it('expands a subworkflow graph inline and collapses it again', () => {
    const { container } = render(<DependencyGraph run={run} preview />)
    fireEvent.click(screen.getByText('Build'))
    fireEvent.click(screen.getByText('run-deploy'))
    // The subworkflow's own job nodes now render nested in the graph.
    expect(screen.getByText('Prep')).toBeInTheDocument()
    expect(screen.getByText('Publish')).toBeInTheDocument()
    // Collapsing hides them. The reveal unmounts its content when the grid-row
    // transition ends, which jsdom never fires — dispatch it to finish the collapse.
    fireEvent.click(screen.getByText('run-deploy'))
    for (const grid of container.querySelectorAll('.grid')) {
      const ended = createEvent.transitionEnd(grid)
      Object.defineProperty(ended, 'propertyName', {
        value: 'grid-template-rows',
      })
      fireEvent(grid, ended)
    }
    expect(screen.queryByText('Prep')).not.toBeInTheDocument()
  })

  it('re-roots the graph via the "open in new graph" action', () => {
    render(<DependencyGraph run={run} preview />)
    fireEvent.click(screen.getByText('Build'))
    fireEvent.click(screen.getByRole('button', { name: 'Open in new graph' }))
    // The subworkflow is now the whole graph: its jobs are top-level nodes and
    // the parent jobs are gone.
    expect(screen.getByText('Prep')).toBeInTheDocument()
    expect(screen.getByText('Publish')).toBeInTheDocument()
    expect(screen.queryByText('Notify')).not.toBeInTheDocument()
  })

  it('steps back and forward between a subworkflow opened in its own graph and the run, from the view bar', () => {
    render(<DependencyGraph run={run} preview />)
    fireEvent.click(screen.getByText('Build'))
    fireEvent.click(screen.getByRole('button', { name: 'Open in new graph' }))
    const back = screen.getByRole('button', {
      name: 'Back to the previous graph',
    })
    const forward = screen.getByRole('button', {
      name: 'Forward to the next graph',
    })
    expect(forward).toBeDisabled()
    // In the same bar as the other view buttons, ahead of them.
    const bar = back.parentElement as HTMLElement
    expect(bar).toContainElement(forward)
    expect(bar).toContainElement(screen.getByRole('button', { name: 'Reset View' }))
    fireEvent.click(back)
    expect(screen.getByText('Notify')).toBeInTheDocument()
    expect(back).toBeDisabled()
    fireEvent.click(forward)
    expect(screen.getByText('Prep')).toBeInTheDocument()
    expect(screen.queryByText('Notify')).not.toBeInTheDocument()
  })

  it('places a subworkflow’s jobs by their position inline, as its own graph does', () => {
    const placedRun = {
      ...run,
      executedJobs: {
        build: {
          status: 'completed',
          steps: [
            {
              name: 'run-deploy',
              status: 'completed',
              subworkflow: {
                jobs: {
                  prep: { status: 'completed', position: { column: 1, row: 0 }, steps: [] },
                  publish: { status: 'completed', position: { column: 0, row: 0 }, steps: [] },
                },
              },
            },
          ],
        },
      },
    }
    render(<DependencyGraph run={placedRun} preview />)
    const jobsOf = (ids: string[]) => ids.map((id) => id.split('/').pop())
    fireEvent.click(screen.getByRole('button', { name: 'Expand All' }))
    expect(jobsOf(nodeIds().filter((id) => id.includes('subworkflows/')))).toEqual([
      'publish',
      'prep',
    ])
    fireEvent.click(screen.getByRole('button', { name: 'Open in new graph' }))
    expect(jobsOf(nodeIds())).toEqual(['publish', 'prep'])
  })

  it('reveals every nested subworkflow via "Expand All"', () => {
    render(<DependencyGraph run={run} preview />)
    // Nothing expanded initially.
    expect(screen.queryByText('Prep')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Expand All' }))
    expect(screen.getByText('Prep')).toBeInTheDocument()
    expect(screen.getByText('Publish')).toBeInTheDocument()
  })

  it('opens matrix groups and their nested subworkflows via "Expand All"', () => {
    const matrixRun = {
      number: 0,
      workflowName: '',
      executedJobs: {
        run_0: {
          status: 'completed',
          _matrix: { originaljob: 'run', index: 0, totalingroup: 2 },
          steps: [
            {
              name: 'deploy-sub',
              status: 'completed',
              subworkflow: {
                jobs: {
                  inner: {
                    status: 'completed',
                    steps: [{ name: 'inner-step', status: 'completed' }],
                  },
                },
              },
            },
          ],
        },
        run_1: {
          status: 'completed',
          _matrix: { originaljob: 'run', index: 1, totalingroup: 2 },
          steps: [{ name: 'noop', status: 'completed' }],
        },
      },
    }
    render(<DependencyGraph run={matrixRun} preview />)
    // The matrix is collapsed, so the subworkflow nested in a member is hidden.
    expect(screen.queryByText('Inner')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Expand All' }))
    // Expand All opened the matrix group, its member's steps, and the subworkflow.
    expect(screen.getByText('Inner')).toBeInTheDocument()
  })
})

describe('DependencyGraph view bar', () => {
  it('zooms by a step, and disables each zoom button at its limit', () => {
    render(<DependencyGraph run={run} preview />)
    const zoomIn = screen.getByRole('button', { name: 'Zoom in' })
    const zoomOut = screen.getByRole('button', { name: 'Zoom out' })
    // A graph opens at its closest zoom.
    expect(zoomIn).toBeDisabled()
    fireEvent.click(zoomOut)
    expect(panZoom.setTransform).toHaveBeenLastCalledWith(
      expect.any(Number),
      expect.any(Number),
      0.6 * Math.exp(-0.25),
      expect.any(Number),
      'easeOut',
    )
    act(() => panZoom.onTransform?.(null, { scale: 0.4 }))
    expect(zoomIn).toBeEnabled()
    expect(zoomOut).toBeEnabled()
    act(() => panZoom.onTransform?.(null, { scale: 0.2 }))
    expect(zoomOut).toBeDisabled()
  })

  it('goes back to the run from a subworkflow opened in its own graph on Reset View', () => {
    render(<DependencyGraph run={run} preview />)
    fireEvent.click(screen.getByText('Build'))
    fireEvent.click(screen.getByRole('button', { name: 'Open in new graph' }))
    expect(screen.queryByText('Notify')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Reset View' }))
    expect(screen.getByText('Notify')).toBeInTheDocument()
    expect(screen.queryByText('Prep')).not.toBeInTheDocument()
  })
})

describe('DependencyGraph sidebar', () => {
  const subRun = {
    id: 'r',
    number: 1,
    slug: 's',
    workflowName: 'wf',
    status: 'completed',
    executedJobs: {
      build: {
        status: 'completed',
        steps: [
          { name: 'compile', status: 'completed' },
          {
            name: 'run-deploy',
            status: 'completed',
            uses: 'workflow/deploy-pipeline',
            subworkflow: {
              jobs: {
                prep: { status: 'completed', steps: [] },
                publish: { status: 'completed', needs: ['prep'], steps: [] },
              },
            },
          },
        ],
      },
      notify: { status: 'completed', needs: ['build'], steps: [] },
    },
  }

  it('expands a subworkflow inline in the sidebar without switching the graph', () => {
    render(<DependencyGraph run={subRun} />)
    expect(screen.queryByText('Prep')).not.toBeInTheDocument()
    // Sidebar is first in the DOM; open the job's steps, then the subworkflow step.
    fireEvent.click(screen.getAllByText('Build')[0]!)
    fireEvent.click(screen.getAllByText('run-deploy')[0]!)
    // The subworkflow's jobs are revealed inline...
    expect(screen.getAllByText('Prep').length).toBeGreaterThan(0)
    // ...and the graph did NOT switch — the parent's sibling is still present.
    expect(screen.getAllByText('Notify').length).toBeGreaterThan(0)
  })

  it('collapses matrix members into one group instead of listing each', () => {
    const matrixRun = {
      id: 'm',
      number: 1,
      slug: 'm',
      workflowName: 'wf',
      status: 'completed',
      executedJobs: {
        'build-0': {
          status: 'completed',
          _matrix: { originaljob: 'build', index: 0, totalingroup: 2 },
          steps: [],
        },
        'build-1': {
          status: 'completed',
          _matrix: { originaljob: 'build', index: 1, totalingroup: 2 },
          steps: [],
        },
        notify: {
          status: 'completed',
          needs: ['build-0', 'build-1'],
          steps: [],
        },
      },
    }
    render(<DependencyGraph run={matrixRun} />)
    // The two members collapse into a single group summary (like the graph),
    // not one row per member; "(N jobs)" is unique to the sidebar summary item.
    expect(screen.getByText('(2 jobs)')).toBeInTheDocument()
    expect(screen.queryByText('Build (1/2)')).not.toBeInTheDocument()
    // Expanding the group reveals the members.
    fireEvent.click(screen.getByText('(2 jobs)'))
    expect(screen.getAllByText('Build (1/2)').length).toBeGreaterThan(0)
  })

  it('lists a matrix that ran as one job as that job, with its status and steps', () => {
    const oneRun = {
      id: 'o',
      number: 1,
      slug: 'o',
      workflowName: 'wf',
      status: 'error',
      executedJobs: {
        'build-0': {
          status: 'error',
          _matrix: { originaljob: 'build', index: 0, totalingroup: 1 },
          steps: [{ name: 'compile', status: 'error' }],
        },
      },
    }
    render(<DependencyGraph run={oneRun} />)
    // The sidebar comes first in the page.
    const row = screen.getAllByText('Build')[0]?.closest('button') as HTMLElement
    expect(within(row).getByTestId('failed-indicator')).toBeInTheDocument()
    fireEvent.click(row)
    expect(screen.getAllByTestId('compile').length).toBeGreaterThan(0)
  })

  it('places a run’s matrix by the position its jobs carry', () => {
    const member = (index: number) => ({
      status: 'completed',
      needs: ['setup'],
      position: { column: 1, row: 0 },
      _matrix: { originaljob: 'build', index, totalingroup: 2 },
      steps: [],
    })
    const placedRun = {
      id: 'p',
      number: 1,
      slug: 'p',
      workflowName: 'wf',
      status: 'completed',
      executedJobs: {
        setup: { status: 'completed', position: { column: 0, row: 0 }, steps: [] },
        'build-0': member(0),
        'build-1': member(1),
        lint: {
          status: 'completed',
          needs: ['setup'],
          position: { column: 1, row: 1 },
          steps: [],
        },
      },
    }
    render(<DependencyGraph run={placedRun} />)
    expect(nodeIds()).toEqual(['node_setup', 'node_build', 'node_lint'])
    expect(document.getElementById('node_lint')?.style.marginTop).toBe('')
  })

  it('draws a matrix that ran as one job as that job, in its stored slot', () => {
    const executedJobs: Record<string, WorkflowJob> = {
      setup: { status: 'completed', steps: [] },
      'build-0': {
        status: 'completed',
        needs: ['setup'],
        _matrix: {
          originaljob: 'build',
          index: 0,
          totalingroup: 1,
          groupjobs: ['build-0'],
          values: { os: 'linux' },
          failfast: true,
          maxparallel: 0,
        },
        steps: [],
      },
    }
    const oneRun = {
      id: 'o',
      number: 1,
      slug: 'o',
      workflowName: 'wf',
      status: 'completed',
      executedJobs,
    }
    render(<DependencyGraph run={oneRun} />)
    expect(screen.queryByText(/Matrix:/)).not.toBeInTheDocument()
    expect(screen.getAllByText('Build').length).toBeGreaterThan(0)
    const slots = emptyLayout()
    slots['setup'] = { column: 0, row: 0 }
    slots['build'] = { column: 2, row: 1 }
    const laidOut = computeGraphLayout(
      testEngine,
      executedJobs,
      detectMatrixGroups(executedJobs),
      slots,
    )
    expect(laidOut.dependencyCols).toEqual([[['setup']], [['build-0']]])
    expect(laidOut.colSlots).toEqual([0, 2])
    expect(laidOut.rowSlots).toEqual([[0], [1]])
  })
})

describe('DependencyGraph step log states', () => {
  const withRunFile = (result: Partial<RunFileResult>) =>
    render(
      <UIProvider
        data={{
          useRunFile: () => ({
            data: undefined,
            isLoading: false,
            error: undefined,
            ...result,
          }),
        }}
      >
        <DependencyGraph run={run} />
      </UIProvider>,
    )

  const openGeneralLog = () => fireEvent.click(screen.getByRole('button', { name: 'General log' }))

  it('words a log it could not fetch differently from an empty one', () => {
    withRunFile({ error: new Error('boom') })
    openGeneralLog()
    expect(screen.getByTestId('log')).toHaveTextContent('Log could not be loaded')
    expect(screen.queryByText('No log found')).not.toBeInTheDocument()
  })

  it('renders the log itself once the fetch succeeds', () => {
    withRunFile({ data: 'banana' })
    openGeneralLog()
    expect(screen.getByTestId('log')).toHaveTextContent('banana')
  })
})

describe('DependencyGraph general log', () => {
  // The reason a run ended is the host's to phrase; the graph only places it.
  const renderGraph = (r: object) =>
    render(
      <UIProvider
        strings={{
          dag: {
            statusReason: (reason) => (reason ? `why: ${reason}` : undefined),
          },
        }}
      >
        <DependencyGraph run={r} />
      </UIProvider>,
    )

  // A run rejected before it could write a log left this pane saying only
  // "No log found", which is where someone looks to find out what went wrong.
  it('shows why the run ended when it never wrote a general log', () => {
    renderGraph({
      ...run,
      status: 'error',
      statusReason: 'insufficientDiskSpace',
    })
    fireEvent.click(screen.getByRole('button', { name: 'General log' }))
    expect(screen.getByTestId('log')).toHaveTextContent('why: insufficientDiskSpace')
  })

  it('reports a missing log when the run offers no reason', () => {
    renderGraph(run)
    fireEvent.click(screen.getByRole('button', { name: 'General log' }))
    expect(screen.getByTestId('log')).toHaveTextContent('No log found')
  })

  // A step's own missing log says nothing about how the run ended.
  it('does not explain the run in place of a missing step log', () => {
    renderGraph({
      ...run,
      status: 'error',
      statusReason: 'insufficientDiskSpace',
    })
    // Sidebar is first in the DOM; open the job's steps, then the step's log.
    fireEvent.click(screen.getAllByText('Build')[0]!)
    fireEvent.click(screen.getAllByText('compile')[0]!)
    expect(screen.getByTestId('log')).toHaveTextContent('No log found')
  })

  const footerButtons = () =>
    [...screen.getByTestId('log-footer').querySelectorAll('button')].map((b) =>
      b.textContent?.trim(),
    )

  // The run's logs.out belongs to no job or step, so paging off it read step_ off
  // undefined and threw inside the click handler.
  it('offers no step paging on the run own general log', () => {
    renderGraph(run)
    fireEvent.click(screen.getByRole('button', { name: 'General log' }))
    expect(footerButtons()).toEqual([])
  })

  // A subworkflow's general log IS its parent step's log file, so paging and the
  // script toggle do belong there.
  it('keeps step paging on a subworkflow general log', () => {
    renderGraph(run)
    fireEvent.click(screen.getAllByText('Build')[0]!)
    fireEvent.click(screen.getAllByRole('button', { name: 'Open in new graph' })[0]!)
    fireEvent.click(screen.getByRole('button', { name: 'General log' }))
    expect(footerButtons()).toEqual(['Prev', 'Next', 'Show Script'])
    // And paging still resolves to a real step rather than throwing.
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    expect(footerButtons()).toEqual(['Prev', 'Next', 'Show Script'])
  })
})

describe('addCleanupSteps', () => {
  it('moves cleanup off the step that declared it, not the one mirrored from the end', () => {
    const { build } = addCleanupSteps({
      jobs: {
        build: {
          status: 'completed',
          steps: [
            { name: 'setup', status: 'completed', cleanup: 'teardown' },
            { name: 'compile', status: 'completed' },
            { name: 'publish', status: 'completed' },
          ],
          cleanup: [
            { name: 'notify', status: 'completed', cleanup: 'unnotify' },
            { name: 'archive', status: 'completed' },
          ],
        },
      },
    })

    const steps = build?.steps ?? []
    expect(steps.map((s) => s.name)).toEqual([
      'setup',
      'compile',
      'publish',
      'POST setup',
      'notify',
      'archive',
      'POST notify',
    ])
    // Only the POST steps run the cleanup; the steps that declared it no longer carry it.
    expect(steps.filter((s) => s.cleanup !== undefined)).toEqual([])
  })
})

function job(needs: string[] = [], extra: Record<string, unknown> = {}) {
  return {
    status: 'completed',
    steps: [{ name: 'step', status: 'completed' }],
    needs,
    ...extra,
  } as unknown as WorkflowJob
}

function emptyLayoutWith(entries: Record<string, [number, number]>) {
  return layoutFromCols(
    [],
    Object.fromEntries(
      Object.entries(entries).map(([job, [column, row]]) => [job, { column, row }]),
    ),
  )
}

describe('computeGraphLayout with a stored layout', () => {
  const graphs: Record<string, Record<string, WorkflowJob>> = {
    diamond: { a: job(), b: job(['a']), c: job(['a']), d: job(['b', 'c']) },
    fanOut: {
      setup: job(),
      linux: job(['setup']),
      mac: job(['setup']),
      windows: job(['setup']),
      lint: job(),
      package: job(['linux', 'mac', 'windows']),
    },
    longSpan: {
      a: job(),
      b: job(['a']),
      c: job(['b']),
      d: job(['a', 'c']),
      loose: job(),
    },
  }

  for (const [name, jobs] of Object.entries(graphs)) {
    it(`draws the captured grid of ${name} exactly as before`, () => {
      const drawn = computeGraphLayout(testEngine, jobs, {}).dependencyCols
      const replayed = computeGraphLayout(testEngine, jobs, {}, layoutFromCols(drawn))
      expect(replayed.dependencyCols).toEqual(drawn)
    })
  }

  it('keeps jobs with the same dependencies in one box', () => {
    const cols = computeGraphLayout(testEngine, graphs['fanOut']!, {}).dependencyCols
    expect(cols[1]).toEqual([['linux', 'mac', 'windows']])
  })

  it('follows a stored column and pushes dependents right', () => {
    const jobs = graphs['diamond']!
    const layout = layoutFromCols([[['a']], [['b']], [['c']], [['d']]])
    expect(computeGraphLayout(testEngine, jobs, {}, layout).dependencyCols).toEqual([
      [['a']],
      [['b']],
      [['c']],
      [['d']],
    ])
  })

  it('draws matrix `:any` needs from the job they name', () => {
    const jobs = { build: job(), deploy: job(['build:any']) }
    const { dependencyCols, directDeps } = computeGraphLayout(testEngine, jobs, {})
    expect(dependencyCols).toEqual([[['build']], [['deploy']]])
    expect(directDeps['deploy']).toEqual(['build'])
  })

  it('draws a need on a job once, however many ways it is named', () => {
    const jobs = { build: job(), deploy: job(['build', 'build:any']) }
    expect(computeGraphLayout(testEngine, jobs, {}).directDeps['deploy']).toEqual(['build'])
  })
})

describe('nodes a stored layout forms', () => {
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

  it('draws jobs in separate slots of one column as separate nodes', () => {
    const layout = layoutFromCols([[['a']], [['b'], ['c']]])
    const { dependencyCols, rowSlots } = computeGraphLayout(testEngine, jobs, {}, layout)
    expect(dependencyCols).toEqual([[['a']], [['b'], ['c']]])
    expect(rowSlots).toEqual([[0], [0, 1]])
  })

  it('draws jobs sharing a slot as one node only when they need, and are needed by, the same jobs', () => {
    // b and c both need a, but only b feeds x.
    const mixed = { a: job(), b: job(['a']), c: job(['a']), x: job(['b']) }
    const layout = emptyLayoutWith({ a: [0, 0], b: [1, 0], c: [1, 0], x: [2, 0] })
    const split = computeGraphLayout(testEngine, mixed, {}, layout)
    expect(split.dependencyCols[1]).toEqual([['b'], ['c']])
    expect(split.rowSlots[1]).toEqual([0, 1])
    const both = { ...mixed, x: job(['b', 'c']) }
    expect(computeGraphLayout(testEngine, both, {}, layout).dependencyCols[1]).toEqual([['b', 'c']])
  })

  it('leaves the rows above a node empty', () => {
    const layout = emptyLayoutWith({
      a: [0, 0],
      b: [1, 0],
      c: [1, 3],
    })
    const { rowSlots } = computeGraphLayout(testEngine, jobs, {}, layout)
    expect(rowSlots).toEqual([[0], [0, 3]])
    render(<DependencyGraphPreview yml={graph} layout={layout} />)
    // Two empty rows between b and c.
    expect(document.getElementById('node_c')?.style.marginTop).toContain(`${2 * SLOT_PITCH}px`)
    expect(document.getElementById('node_b')?.style.marginTop).toBe('')
  })
})

const pipeline = {
  jobs: {
    build: { steps: [{ name: 'compile', run: 'make' }] },
    linux: { needs: ['build'], steps: [{ run: 'x' }] },
    mac: { needs: ['build'], steps: [{ run: 'y' }] },
  },
}

const nodeIds = () => [...document.querySelectorAll('[id^="node_"]')].map((el) => el.id)

describe('the editor’s view', () => {
  it('moves a graph that fits by the least that shows it, and leaves one too big to fit', () => {
    expect(intoView(100, 500, 20, 980)).toBe(0)
    expect(intoView(-100, 500, 20, 980)).toBe(120)
    expect(intoView(600, 1200, 20, 980)).toBe(-220)
    expect(intoView(-500, 1500, 20, 980)).toBe(0)
    expect(intoView(-300, 900, 20, 980)).toBe(0)
  })

  it('keeps a view the user zoomed through the edits after it', async () => {
    // Fits wait for a frame; this test lets frames run.
    vi.stubGlobal('requestAnimationFrame', (run: FrameRequestCallback) =>
      window.setTimeout(() => run(performance.now()), 0),
    )
    onTestFinished(() => {
      vi.unstubAllGlobals()
    })
    const editor = {
      onEdit: vi.fn(),
      canUndo: false,
      canRedo: false,
      onUndo: vi.fn(),
      onRedo: vi.fn(),
    } as unknown as DependencyGraphEditor
    const one = { jobs: { a: { steps: [{ run: 'x' }] } } }
    const two = { jobs: { ...one.jobs, b: { steps: [{ run: 'y' }] } } }
    const { rerender } = render(<DependencyGraphPreview yml={one} editor={editor} />)
    await waitFor(() => expect(document.getElementById('node_a')).not.toBeNull())
    act(() => panZoom.onWheel?.())
    panZoom.setTransform.mockClear()
    rerender(<DependencyGraphPreview yml={two} editor={editor} />)
    await waitFor(() => expect(panZoom.setTransform).toHaveBeenCalledWith(0, 0, 0.6, 0))
  })
})

describe('DependencyGraphPreview', () => {
  it('places each job where its position in the YAML says', () => {
    const placed = {
      jobs: {
        a: { position: { column: 1, row: 0 }, steps: [{ run: 'a' }] },
        b: { position: { column: 0, row: 0 }, steps: [{ run: 'b' }] },
      },
    }
    render(<DependencyGraphPreview yml={placed} />)
    expect(nodeIds()).toEqual(['node_b', 'node_a'])
    cleanup()
    // A host's layout that holds no job leaves them to their own.
    render(<DependencyGraphPreview yml={placed} layout={emptyLayout()} />)
    expect(nodeIds()).toEqual(['node_b', 'node_a'])
  })

  it('leaves the columns between nodes empty', () => {
    const apart = {
      jobs: {
        a: { position: { column: 0, row: 0 }, steps: [{ run: 'a' }] },
        b: { position: { column: 2, row: 0 }, steps: [{ run: 'b' }] },
      },
    }
    render(<DependencyGraphPreview yml={apart} />)
    expect(document.getElementById('node_a')?.parentElement?.style.marginLeft).toBe('')
    expect(document.getElementById('node_b')?.parentElement?.style.marginLeft).toBe(
      `${COLUMN_PITCH}px`,
    )
  })

  /** Evaluates each object `evaluated` answers for, finding expressions wherever a `${{` is. */
  function evaluatesTo(
    evaluated: (obj: Record<string, unknown>, inputs: Record<string, unknown>) => unknown,
  ) {
    const evaluate = vi.mocked(testEngine.evaluate)
    const dependencies = vi.mocked(testEngine.inputDependencies)
    onTestFinished(() => {
      evaluate.mockImplementation(
        (({ obj }: { obj: unknown }) => obj) as unknown as typeof testEngine.evaluate,
      )
      dependencies.mockImplementation(() => ({
        inputDeps: new Set<string>(),
        hasExpressions: false,
      }))
    })
    dependencies.mockImplementation((obj?: unknown) => ({
      inputDeps: new Set<string>(),
      hasExpressions: JSON.stringify(obj).includes('${{'),
    }))
    evaluate.mockImplementation(
      (({ inputs, obj }: { inputs: Record<string, unknown>; obj: Record<string, unknown> }) =>
        evaluated(obj, inputs) ?? obj) as unknown as typeof testEngine.evaluate,
    )
  }

  it('draws a matrix expressions give as a run expands it, from the inputs’ defaults', () => {
    evaluatesTo((obj, inputs) =>
      'matrix' in obj
        ? {
            matrix: {
              os: String(inputs['oses']).split(','),
              value: Array.from({ length: Number(inputs['count']) }, (_, i) => i),
            },
          }
        : undefined,
    )
    const ranged = {
      on: {
        execute: {
          inputs: {
            count: { type: 'number', default: 3 },
            oses: { type: 'string', default: 'linux,mac' },
          },
        },
      },
      jobs: {
        build: {
          strategy: {
            matrix: {
              os: "${{ split(inputs.oses, ',') }}",
              value: '${{ 0 range inputs.count }}',
            },
          },
          steps: [{ run: 'make' }],
        },
      },
    }
    render(<DependencyGraphPreview yml={ranged} />)
    expect(screen.getByText('6 jobs')).toBeInTheDocument()
  })

  it('loads the expression runtime only for a strategy or needs a run evaluates', () => {
    evaluatesTo(() => undefined)
    const init = vi.mocked(testEngine.init)
    init.mockClear()
    render(<DependencyGraphPreview yml={pipeline} />)
    expect(init).not.toHaveBeenCalled()
    cleanup()
    const waits = { jobs: { ...pipeline.jobs, mac: { needs: '${{ inputs.after }}', steps: [] } } }
    render(<DependencyGraphPreview yml={waits} />)
    expect(init).toHaveBeenCalled()
  })

  it('loads no expression runtime for a strategy when the engine expands no matrix', () => {
    evaluatesTo(() => undefined)
    const { editing } = testEngine
    Object.assign(testEngine, { editing: undefined })
    onTestFinished(() => {
      Object.assign(testEngine, { editing })
    })
    const init = vi.mocked(testEngine.init)
    init.mockClear()
    const sharded = {
      jobs: { train: { strategy: { matrix: { shard: '${{ 0 range inputs.n }}' } }, steps: [] } },
    }
    const evaluate = vi.mocked(testEngine.evaluate)
    evaluate.mockClear()
    render(<DependencyGraphPreview yml={sharded} />)
    expect(init).not.toHaveBeenCalled()
    expect(evaluate).not.toHaveBeenCalled()
  })

  it('draws the jobs a needs expression names as a run waits on them', () => {
    evaluatesTo((obj, inputs) => ('needs' in obj ? { needs: inputs['after'] } : undefined))
    const waits = {
      on: {
        execute: {
          inputs: {
            after: { type: 'multi-dropdown', options: ['build', 'lint'], default: ['build'] },
          },
        },
      },
      jobs: {
        deploy: { needs: '${{ inputs.after }}', steps: [{ run: 'ship' }] },
        build: { steps: [{ run: 'make' }] },
      },
    }
    render(<DependencyGraphPreview yml={waits} />)
    expect(nodeIds()).toEqual(['node_build', 'node_deploy'])
  })
})
