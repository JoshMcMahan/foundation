// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { useState } from 'react'
import { AnnotationBanner } from './AnnotationBanner'
import { GraphNode } from './GraphNode'
import { Lineage, LineageContext } from './lineage'
import { Reveal } from './Reveal'
import { PIPELINE_JOBS, RUN_JOBS } from './stories/runFixtures'
import TreeView from './TreeView'

const runFile = vi.hoisted(() => vi.fn(() => ({ data: 'log', isLoading: false, error: undefined })))

vi.mock('../components/Provider', async (importOriginal) => ({
  ...(await (await import('../test/engine')).mockEngineHooks(importOriginal)),
  useRunFile: runFile,
}))
vi.mock('../logviewer', () => ({ LogViewer: () => <div>log</div> }))

const reducedMotion = vi.hoisted(() => ({ on: false }))
vi.mock('../reducedMotion', () => ({
  useReducedMotion: () => reducedMotion.on,
  prefersReducedMotion: () => reducedMotion.on,
}))

describe('AnnotationBanner', () => {
  it('says what it controls and what each count counts', () => {
    render(<AnnotationBanner executedJobs={RUN_JOBS} />)
    const toggle = screen.getByRole('button', { name: /Annotations/ })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(toggle).toHaveAccessibleName('Annotations: 1 error, 1 warning, 1 notice')

    fireEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    const list = document.getElementById(toggle.getAttribute('aria-controls') ?? '')
    expect(list).not.toBeNull()
    // Errors first, then warnings, then notices.
    expect(
      within(list as HTMLElement)
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual([
      expect.stringContaining('Test failed'),
      expect.stringContaining('Loss plateaued'),
      expect.stringContaining('Coverage report'),
    ])
  })
})

// A row by the name it starts with; a job's dependents name it too, after "depends on".
const row = (name: string) => {
  const found = screen
    .getAllByRole('button')
    .find((button) => button.textContent?.toLowerCase().startsWith(name))
  if (!found) {
    throw new Error(`no row ${name}`)
  }
  return found
}

function Tree() {
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  return (
    <TreeView jobs={RUN_JOBS} slug="run" expandedJobs={expanded} setExpandedJobs={setExpanded} />
  )
}

describe('TreeView', () => {
  it('expands every job and the matrix around its jobs, then collapses them', () => {
    render(<Tree />)
    fireEvent.click(screen.getByRole('button', { name: 'Expand all' }))
    expect(screen.getByRole('button', { name: /Matrix: train/ })).toHaveAttribute(
      'aria-expanded',
      'true',
    )
    expect(row('checkout')).toHaveAttribute('aria-expanded', 'true')
    fireEvent.click(screen.getByRole('button', { name: 'Collapse all' }))
    expect(screen.getByRole('button', { name: /Matrix: train/ })).toHaveAttribute(
      'aria-expanded',
      'false',
    )
  })

  it('marks a skipped job as having nothing to open', () => {
    render(<Tree />)
    const deploy = row('deploy')
    expect(deploy).toHaveAttribute('aria-disabled', 'true')
    expect(deploy).not.toHaveAttribute('aria-expanded')
  })

  it('gives each tree its own panel ids', () => {
    render(
      <>
        <Tree />
        <Tree />
      </>,
    )
    const [a, b] = screen.getAllByRole('button', { name: /Matrix: train/ })
    expect(a?.getAttribute('aria-controls')).not.toBe(b?.getAttribute('aria-controls'))
  })

  it('names a job in full where its name is cut short, and wraps what it depends on whole', () => {
    function Pipeline() {
      const [expanded, setExpanded] = useState<Set<string>>(new Set())
      return (
        <TreeView
          jobs={PIPELINE_JOBS}
          slug="run"
          expandedJobs={expanded}
          setExpandedJobs={setExpanded}
        />
      )
    }
    render(<Pipeline />)
    const merge = row('merge-bams')
    expect(within(merge).getByText('Merge-bams')).toHaveAttribute('title', 'Merge-bams')
    const lane = within(merge).getByText('Align-lane-4')
    expect(lane).toHaveClass('whitespace-nowrap')
    expect(lane.parentElement).toHaveClass('flex-wrap')
    // The name's column takes all the room the time leaves; no spacer splits it.
    expect(merge.querySelector(':scope > .flex-1:empty')).toBeNull()
  })

  it('fetches a finished step’s log once instead of polling it', () => {
    render(<Tree />)
    fireEvent.click(row('checkout'))
    fireEvent.click(row('clone'))
    expect(runFile).toHaveBeenLastCalledWith('run', expect.any(String), { refreshInterval: 0 })
  })
})

describe('GraphNode', () => {
  it('keeps its lineage while focus moves between its own buttons', () => {
    const lineage = new Lineage(() => new Map([['a', 0]]), { animT: 0 })
    render(
      <LineageContext value={lineage}>
        <GraphNode id="n" job="a" rowsAbove={0} zBase={0}>
          <button type="button">one</button>
          <button type="button">two</button>
        </GraphNode>
        <button type="button">outside</button>
      </LineageContext>,
    )
    act(() => screen.getByRole('button', { name: 'one' }).focus())
    act(() => screen.getByRole('button', { name: 'two' }).focus())
    expect(lineage.hovering).toBe(true)
    act(() => screen.getByRole('button', { name: 'outside' }).focus())
    expect(lineage.hovering).toBe(false)
  })
})

describe('Reveal', () => {
  it('settles at once when the person asked for less motion', () => {
    reducedMotion.on = true
    const settled = vi.fn()
    const { rerender } = render(
      <Reveal open onSettled={settled}>
        <p>inside</p>
      </Reveal>,
    )
    rerender(
      <Reveal open={false} onSettled={settled}>
        <p>inside</p>
      </Reveal>,
    )
    // No transition runs, so nothing waits for its end: closed, its children go.
    expect(settled).toHaveBeenCalled()
    expect(screen.queryByText('inside')).not.toBeInTheDocument()
    reducedMotion.on = false
  })
})
