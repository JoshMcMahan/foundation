import type { Meta, StoryObj } from '@storybook/react-vite'
import type { GraphLayout } from '../editing'
import { DependencyGraphPreview } from './DependencyGraph'
import type { EditorProblem } from './editorApi'
import type { ListedProblem } from './ProblemsButton'
import { SAMPLE_WORKFLOW, useStoryWorkflow } from './stories/harness'

const meta: Meta<typeof DependencyGraphPreview> = {
  title: 'UI/Workflow/DependencyGraphPreview',
  component: DependencyGraphPreview,
  argTypes: {
    height: {
      control: 'text',
      description: 'A fixed panel height; without one the panel is only as tall as the graph.',
    },
    layout: {
      control: 'object',
      description:
        'Where each job sits on the grid, as a host stores it; rows and columns left out stay empty.',
    },
    editor: {
      control: false,
      description: 'The callbacks that make the graph an editor; the Editable stories pass them.',
    },
  },
}
export default meta

// Mirrors the shapes exercised by DependencyGraph.test.tsx.
const PIPELINE_YML = {
  jobs: {
    build: {
      steps: [
        { name: 'compile', run: 'make build' },
        {
          name: 'run-deploy',
          uses: 'workflow/deploy-pipeline',
          subworkflow: {
            jobs: {
              prep: { steps: [{ name: 'prep-step', run: 'make prep' }] },
              publish: {
                needs: ['prep'],
                steps: [{ name: 'publish-step', run: 'make publish' }],
              },
            },
          },
        },
      ],
    },
    notify: {
      needs: ['build'],
      steps: [{ name: 'notify-step', run: './notify.sh' }],
    },
  },
}

const MATRIX_YML = {
  jobs: {
    run_0: {
      _matrix: { originaljob: 'run', index: 0, totalingroup: 2 },
      steps: [{ name: 'train shard 0', run: 'python train.py --shard 0' }],
    },
    run_1: {
      _matrix: { originaljob: 'run', index: 1, totalingroup: 2 },
      steps: [{ name: 'train shard 1', run: 'python train.py --shard 1' }],
    },
    merge: {
      needs: ['run_0', 'run_1'],
      steps: [{ name: 'merge shards', run: 'python merge.py' }],
    },
  },
}

export const WithSubworkflow: StoryObj<typeof DependencyGraphPreview> = {
  args: { yml: PIPELINE_YML },
}

export const WithMatrixGroup: StoryObj<typeof DependencyGraphPreview> = {
  args: { yml: MATRIX_YML },
}

/** A matrix as written: the preview lists each combination, as a run would. */
export const MatrixFromYaml: StoryObj<typeof DependencyGraphPreview> = {
  args: {
    yml: {
      jobs: {
        test: {
          strategy: { matrix: { os: ['linux', 'mac'], python: ['3.12', '3.13'] } },
          steps: [{ name: 'test', run: 'pytest' }],
        },
        report: { needs: ['test'], steps: [{ name: 'report', run: './report.sh' }] },
      },
    },
  },
}

/** A matrix an expression gives: the preview evaluates it with the inputs' defaults, as a run would. */
export const MatrixFromExpression: StoryObj<typeof DependencyGraphPreview> = {
  args: {
    yml: {
      on: { execute: { inputs: { shards: { type: 'number', label: 'Shards', default: 4 } } } },
      jobs: {
        train: {
          // biome-ignore lint/suspicious/noTemplateCurlyInString: a workflow expression
          strategy: { matrix: { shard: '${{ 0 range inputs.shards }}' } },
          // biome-ignore lint/suspicious/noTemplateCurlyInString: a workflow expression
          steps: [{ name: 'train', run: 'python train.py --shard ${{ matrix.shard }}' }],
        },
        merge: { needs: ['train'], steps: [{ name: 'merge', run: 'python merge.py' }] },
      },
    },
  },
}

/** A run's matrix that made one job draws as that job, under the job's own name. */
export const MatrixOfOne: StoryObj<typeof DependencyGraphPreview> = {
  args: {
    yml: {
      jobs: {
        build_0: {
          _matrix: { originaljob: 'build', index: 0, totalingroup: 1 },
          steps: [{ name: 'compile', run: 'make' }],
        },
        ship: { needs: ['build_0'], steps: [{ name: 'ship', run: './ship.sh' }] },
      },
    },
  },
}

/** A stored layout keeps its empty column and row, and puts two jobs in one node. */
export const StoredLayout: StoryObj<typeof DependencyGraphPreview> = {
  args: {
    yml: {
      jobs: {
        lint: { steps: [{ name: 'lint', run: 'make lint' }] },
        build: { steps: [{ name: 'compile', run: 'make' }] },
        docs: { steps: [{ name: 'docs', run: 'make docs' }] },
        release: {
          needs: ['lint', 'build', 'docs'],
          steps: [{ name: 'publish', run: './release.sh' }],
        },
      },
    },
    layout: {
      lint: { column: 0, row: 0 },
      build: { column: 0, row: 0 },
      docs: { column: 0, row: 2 },
      release: { column: 2, row: 1 },
    } satisfies GraphLayout,
  },
}

/** Jobs placed by their own `position` in the YAML: the empty column and row stay. */
export const YamlPositions: StoryObj<typeof DependencyGraphPreview> = {
  args: {
    yml: {
      jobs: {
        checkout: { position: { column: 0, row: 0 }, steps: [{ name: 'clone', run: 'git clone' }] },
        build: {
          needs: ['checkout'],
          position: { column: 2, row: 0 },
          steps: [{ name: 'compile', run: 'make' }],
        },
        lint: {
          needs: ['checkout'],
          position: { column: 2, row: 2 },
          steps: [{ name: 'lint', run: 'make lint' }],
        },
        release: {
          needs: ['build', 'lint'],
          position: { column: 3, row: 0 },
          steps: [{ name: 'publish', run: './release.sh' }],
        },
      },
    },
  },
}

function EditableGraph({
  source,
  layout,
  height = '420px',
  problems,
}: {
  source: string
  layout?: GraphLayout | undefined
  height?: string | undefined
  problems?: EditorProblem[]
}) {
  const story = useStoryWorkflow(source, layout)
  const listed: ListedProblem[] | undefined = problems?.map((problem) => ({
    ...problem,
    pick: () => {},
  }))
  // In a padded panel without its own border, as an app's editing page shows it.
  return (
    <div className="relative p-4 panel">
      <DependencyGraphPreview
        yml={story.workflow}
        layout={story.layout}
        height={height}
        removeBorder
        editor={story.editor({
          ...(problems ? { problems } : {}),
          ...(listed ? { listedProblems: listed } : {}),
          usesSuggestions: ['workflow/deploy', 'marketplace/notify'],
        })}
      />
    </div>
  )
}

/**
 * The graph as an editor: drag a job to move it or onto the trash, drag from a node's circles
 * to connect jobs, shift-drag to select, and right-click for a job's menu. Edits undo.
 */
export const Editable: StoryObj<typeof DependencyGraphPreview> = {
  render: (args) => <EditableGraph source={SAMPLE_WORKFLOW} height={args.height} />,
}

/** Problems mark their job or step, and the toolbar counts and lists them. */
export const EditableWithProblems: StoryObj<typeof DependencyGraphPreview> = {
  render: (args) => (
    <EditableGraph
      source={SAMPLE_WORKFLOW}
      height={args.height}
      problems={[
        {
          message: 'inputs.taget is read, but the workflow has no input called taget.',
          line: 31,
          job: 'build',
          step: 0,
        },
        { message: 'deploy reads needs.build, which it does not list.', line: 51, job: 'deploy' },
      ]}
    />
  ),
}

/** A workflow without jobs yet: the toolbar adds the first one. */
export const EditableEmpty: StoryObj<typeof DependencyGraphPreview> = {
  render: (args) => <EditableGraph source={'jobs: {}\n'} height={args.height ?? '240px'} />,
}
