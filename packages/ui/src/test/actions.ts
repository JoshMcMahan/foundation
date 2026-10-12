import type { WorkflowAction } from '../editing'

const SCHEDULER = {
  choices: ['slurm', 'pbs'],
  expression: true,
  refTypes: ['compute-clusters', 'compute-resources'],
  suffix: 'schedulerType',
}

/** Built-in actions as a host lists them, for tests and stories. */
export const TEST_ACTIONS: Record<string, WorkflowAction> = {
  'example/checkout': {
    description: 'Check out a Git repository',
    inputs: [
      {
        key: 'repo',
        kind: 'text',
        label: 'Repository',
        description: 'The address of the Git repository to copy.',
        required: true,
      },
      {
        key: 'branch',
        kind: 'text',
        label: 'Branch',
        description: 'The branch, tag or commit to check out.',
        required: true,
      },
      {
        key: 'sparse_checkout',
        kind: 'list',
        label: 'Paths to check out',
        description: 'Check out only these folders or files instead of the whole repository.',
      },
      {
        key: 'path',
        kind: 'text',
        label: 'Destination',
        description: 'The folder to put the repository in.',
      },
    ],
  },
  'example/scheduler-agent': {
    description: 'Submit a scheduler job that runs an agent',
    inputs: [
      {
        key: 'scheduler-type',
        kind: 'choice',
        label: 'Scheduler',
        description: 'The scheduler to send the agent job to.',
        ...SCHEDULER,
      },
      {
        key: 'scheduler-flags',
        kind: 'flags',
        label: 'Scheduler flags',
        description: 'Options passed to the scheduler.',
      },
      {
        key: 'wait',
        kind: 'bool',
        label: 'Wait for the agent',
        description: 'Wait until the agent is running before the next step starts.',
        fallback: true,
      },
    ],
  },
  'example/update-session': {
    description: 'Update a session with its connection details',
    inputs: [
      {
        key: 'name',
        kind: 'any',
        label: 'Session',
        description: 'The session to update.',
        required: true,
      },
      {
        key: 'type',
        kind: 'choice',
        label: 'Type',
        description: 'link opens an address; tunnel forwards a port.',
        choices: ['link', 'tunnel'],
      },
      {
        key: 'targetInfo',
        kind: 'target',
        label: 'Kubernetes target',
        description: 'A Kubernetes resource to forward to.',
        fields: [
          { key: 'name', label: 'Kubernetes cluster', description: 'The cluster.' },
          { key: 'namespace', label: 'Namespace', description: 'The resource’s namespace.' },
        ],
      },
    ],
  },
}
