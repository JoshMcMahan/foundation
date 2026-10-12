import type { Meta, StoryObj } from '@storybook/react-vite'
import { useWorkflowEditing } from '../components/Provider'
import { asRecord } from './editorFields'
import { JobDialog, StepDialog } from './GraphEditorDialogs'
import type { SettingsView } from './settingsViews'
import { SAMPLE_WORKFLOW } from './stories/harness'

const meta: Meta<{ view: SettingsView }> = {
  title: 'UI/Workflow/Job and step dialogs',
  args: { view: 'form' },
  argTypes: {
    view: {
      control: 'inline-radio',
      options: ['form', 'yaml'],
      description: 'The view the dialog opens in; a host passes the one its user last picked.',
    },
  },
  parameters: {
    docs: {
      description: {
        component:
          'The dialogs the graph editor opens for a job or a step. Each edits its settings as a ' +
          'form or as YAML, and Save sends them as one undoable edit.',
      },
    },
  },
}
export default meta

const COMPUTE_TARGET = `jobs:
  simulate:
    runs-on:
      mode: environment
      targetId: hpc-cluster
      environmentId: gpu-partition
      schedulingParams:
        walltime: '02:00:00'
    steps:
      - name: run
        run: ./simulate.sh
`

const STEP_KINDS = `jobs:
  build:
    steps:
      - name: build tools
        uses: github/example/tools@main
        with:
          $yaml: flows/build.yaml
      - name: deploy
        uses: workflow/deploy
        with:
          region: us-east
          hosts: [web-1, web-2]
      - name: on the login node
        run: hostname
        ssh:
          remoteHost: login.example.com
          jumpNodeHost: bastion.example.com
          disconnect-timeout: 30
`

function Dialog({
  source,
  job,
  step,
  view = 'form',
}: {
  source: string
  job: string
  step?: number
  view?: SettingsView
}) {
  const editing = useWorkflowEditing()
  const workflow = asRecord(editing.loadYaml(source))
  const jobs = asRecord(workflow['jobs'])
  const inputs = asRecord(asRecord(asRecord(workflow['on'])['execute'])['inputs'])
  const shared = {
    inputs,
    workflow,
    source,
    view,
    onEdit: () => {},
    onClose: () => {},
  }
  if (step === undefined) {
    return <JobDialog {...shared} job={job} jobs={jobs} />
  }
  const steps = asRecord(jobs[job])['steps']
  return (
    <StepDialog
      {...shared}
      job={job}
      index={step}
      steps={Array.isArray(steps) ? steps : []}
      usesSuggestions={['workflow/deploy', 'marketplace/notify']}
    />
  )
}

/** A job's needs, condition, remote host, compute environment, matrix, env and outputs. */
export const EditJob: StoryObj<typeof meta> = {
  render: ({ view }) => <Dialog source={SAMPLE_WORKFLOW} job="build" view={view} />,
}

/** A matrix job opens as Edit matrix, with its variables in a section of their own. */
export const EditMatrixJob: StoryObj<typeof meta> = {
  render: ({ view }) => <Dialog source={SAMPLE_WORKFLOW} job="train" view={view} />,
}

/** A job that runs on a compute target, as a compute target input writes it. */
export const ComputeTarget: StoryObj<typeof meta> = {
  render: ({ view }) => <Dialog source={COMPUTE_TARGET} job="simulate" view={view} />,
}

/** A job's settings as YAML, checked against the job's part of the workflow schema. */
export const EditJobAsYaml: StoryObj<typeof meta> = {
  args: { view: 'yaml' },
  render: ({ view }) => <Dialog source={SAMPLE_WORKFLOW} job="build" view={view} />,
}

/** A step that runs a script, with what it can read a click away. */
export const EditRunStep: StoryObj<typeof meta> = {
  render: ({ view }) => <Dialog source={SAMPLE_WORKFLOW} job="build" step={0} view={view} />,
}

/** A step that uses a built-in action, with the action's own inputs. */
export const EditActionStep: StoryObj<typeof meta> = {
  render: ({ view }) => <Dialog source={SAMPLE_WORKFLOW} job="checkout" step={0} view={view} />,
}

/** A step that runs a workflow from a repository: its address, branch and file. */
export const EditRepositoryStep: StoryObj<typeof meta> = {
  render: ({ view }) => <Dialog source={STEP_KINDS} job="build" step={0} view={view} />,
}

/** A step that runs another of your workflows, handing it inputs; a list is typed as JSON. */
export const EditSubworkflowStep: StoryObj<typeof meta> = {
  render: ({ view }) => <Dialog source={STEP_KINDS} job="build" step={1} view={view} />,
}

/** A step that runs on another host, reached through a jump host. */
export const EditRemoteHostStep: StoryObj<typeof meta> = {
  render: ({ view }) => <Dialog source={STEP_KINDS} job="build" step={2} view={view} />,
}
