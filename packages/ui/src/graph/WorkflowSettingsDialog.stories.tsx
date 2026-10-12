import type { Meta, StoryObj } from '@storybook/react-vite'
import { useWorkflowEditing } from '../components/Provider'
import { asRecord } from './editorFields'
import type { SettingsView } from './settingsViews'
import { WorkflowSettingsDialog } from './WorkflowSettingsDialog'

const meta: Meta<{ view: SettingsView }> = {
  title: 'UI/Workflow/WorkflowSettingsDialog',
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
          'The workflow’s own settings, everything but its jobs and trigger: environment, time ' +
          'limit, permissions, sessions, links, variables, and where the input form puts its ' +
          'labels and whether it is split into pages.',
      },
    },
  },
}
export default meta

const SETTINGS_WORKFLOW = `env:
  LOG_LEVEL: info
timeout: 4h
permissions:
  - '*'
sessions:
  notebook:
    type: link
    redirect: true
needs:
  organizationVariables: [LICENSE_SERVER]
jobs:
  main:
    steps:
      - run: echo hi
`

const PAGES_WORKFLOW = `links:
  docs:
    url: https://docs.example.com
  dashboard:
    endpoint: /dashboard
    redirect: true
sessions:
  notebook:
    redirect: true
needs:
  userVariables: [API_TOKEN, REGION]
on:
  execute:
    inputs:
      $meta:
        wizard:
          mode: wizard
          submitLabel: Launch
          flatten: false
      cluster:
        type: step
        title: Cluster
        options:
          nodes:
            type: number
            default: 2
jobs:
  main:
    steps:
      - run: echo \${{ inputs.cluster.nodes }}
`

function Settings({ view, source = SETTINGS_WORKFLOW }: { view: SettingsView; source?: string }) {
  const editing = useWorkflowEditing()
  const workflow = asRecord(editing.loadYaml(source))
  return (
    <WorkflowSettingsDialog
      workflow={workflow}
      source={source}
      view={view}
      onEdit={() => {}}
      onClose={() => {}}
    />
  )
}

export const Form: StoryObj<typeof meta> = {
  render: ({ view }) => <Settings view={view} />,
}

/** The same settings as YAML; switching to the form carries the edits across. */
export const Yaml: StoryObj<typeof meta> = {
  args: { view: 'yaml' },
  render: ({ view }) => <Settings view={view} />,
}

/**
 * A form split into pages that keep their names, links beside a session, variables each user
 * supplies, and two of them set to open when the run starts, which only one can.
 */
export const PagesLinksAndVariables: StoryObj<typeof meta> = {
  render: ({ view }) => <Settings view={view} source={PAGES_WORKFLOW} />,
}
