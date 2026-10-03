// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, createEvent, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

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

// Pan/zoom + animation wrappers reduced to plain passthroughs (no layout in jsdom).
vi.mock('../components/Provider', async (importOriginal) =>
  (await import('../test/engine')).mockEngineHooks(importOriginal),
)

vi.mock('react-zoom-pan-pinch', () => ({
  TransformWrapper: ({ children }: { children: unknown }) =>
    typeof children === 'function' ? (children as () => unknown)() : children,
  TransformComponent: ({ children }: { children: unknown }) => children,
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

import { type RunFileResult, UIProvider } from '../components/Provider'
import DependencyGraph from './DependencyGraph'

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

  it('reveals every nested subworkflow via "Expand all"', () => {
    render(<DependencyGraph run={run} preview />)
    // Nothing expanded initially.
    expect(screen.queryByText('Prep')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Expand all' }))
    expect(screen.getByText('Prep')).toBeInTheDocument()
    expect(screen.getByText('Publish')).toBeInTheDocument()
  })

  it('opens matrix groups and their nested subworkflows via "Expand all"', () => {
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
    fireEvent.click(screen.getByRole('button', { name: 'Expand all' }))
    // Expand all opened the matrix group, its member's steps, and the subworkflow.
    expect(screen.getByText('Inner')).toBeInTheDocument()
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
