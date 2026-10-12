/** Editors holding one job's, step's or input's settings, each checked against that part of the workflow schema. */
export const JOB_YAML_PATH = 'file:///workflow-job.yaml'
export const STEP_YAML_PATH = 'file:///workflow-step.yaml'
export const INPUT_YAML_PATH = 'file:///workflow-input.yaml'
export const SETTINGS_YAML_PATH = 'file:///workflow-settings.yaml'

export type JsonSchema = Record<string, unknown>

const record = (value: unknown): JsonSchema =>
  typeof value === 'object' && value !== null ? (value as JsonSchema) : {}

// Keeps the workflow's $defs so refs still resolve, and its $schema so the same draft applies.
export function settingsSchemas(workflow: JsonSchema): {
  job: JsonSchema
  step: JsonSchema
  input: JsonSchema
  settings: JsonSchema
} {
  const patterns = record(record(record(workflow['properties'])['jobs'])['patternProperties'])
  const job = record(Object.values(patterns)[0])
  const step = record(record(record(job['properties'])['steps'])['items'])
  const inputs = record(record(record(workflow['$defs'])['inputs'])['patternProperties'])
  const input = record(Object.values(inputs)[0])
  const shared = { $schema: workflow['$schema'], $defs: workflow['$defs'] }
  // The workflow's own settings: every top-level key but the jobs and the trigger.
  const { jobs: _jobs, on: _on, ...settings } = record(workflow['properties'])
  return {
    job: { ...job, ...shared },
    step: { ...step, ...shared },
    input: { ...input, ...shared },
    settings: {
      type: 'object',
      properties: settings,
      additionalProperties: false,
      ...shared,
    },
  }
}
