import type { Meta, StoryObj } from '@storybook/react-vite'
import { DependencyGraphPreview } from './DependencyGraph'

const meta: Meta<typeof DependencyGraphPreview> = {
  title: 'UI/Workflow/DependencyGraphPreview',
  component: DependencyGraphPreview,
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
