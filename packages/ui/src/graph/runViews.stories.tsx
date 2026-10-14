import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { AnnotationBanner } from './AnnotationBanner'
import { RUN_JOBS } from './stories/runFixtures'
import TreeView from './TreeView'

const meta: Meta = {
  title: 'UI/Workflow/Run views',
  parameters: {
    docs: {
      description: {
        component:
          'Parts of a run page that `DependencyGraph` composes: the annotations its steps wrote, and the list of jobs and steps it shows in place of the graph.',
      },
    },
  },
}
export default meta

/** The run's annotations, folded to a count of each kind; it opens to list them, errors first. */
export const Annotations: StoryObj = {
  render: () => (
    <div className="max-w-2xl">
      <AnnotationBanner executedJobs={RUN_JOBS} />
    </div>
  ),
}

/** The jobs as a list: a matrix under one row, a failed job, and a skipped one that has nothing to open. */
export const JobTree: StoryObj = {
  render: function Render() {
    const [expanded, setExpanded] = useState<Set<string>>(new Set(['test']))
    return (
      <div className="max-w-2xl rounded-lg border border-(--theme-border) bg-(--theme-panel-bg)">
        <TreeView
          jobs={RUN_JOBS}
          slug="run-1"
          expandedJobs={expanded}
          setExpandedJobs={setExpanded}
        />
      </div>
    )
  },
}
