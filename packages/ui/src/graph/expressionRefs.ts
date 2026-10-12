import type { WorkflowEditing } from '../editing'
import { asRecord, type Json } from './editorFields'
import { inputRefs, refExpression } from './inputRefs'

export type RefGroup = 'inputs' | 'outputs' | 'matrix' | 'variables' | 'sessions' | 'env'

/** Something a `${{ }}` expression can read, as the parser names it. */
export interface ExpressionRef {
  group: RefGroup
  /** The name the parser reads, such as needs.build.outputs.version. */
  label: string
  expression: string
}

const ref = (group: RefGroup, label: string): ExpressionRef => ({
  group,
  label,
  expression: `\${{ ${label} }}`,
})

function names(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === 'string')
  }
  return Object.keys(asRecord(value))
}

/** Everything an expression in `job` can read; without a job, only what the whole workflow has. */
export function expressionRefs(
  editing: WorkflowEditing,
  workflow: Json | undefined,
  job?: string,
): ExpressionRef[] {
  const root = asRecord(workflow)
  const jobs = asRecord(root['jobs'])
  const own = job === undefined ? {} : asRecord(jobs[job])
  const out: ExpressionRef[] = inputRefs(editing, editing.workflowInputsSchema(root)).map(
    (input) => ({
      group: 'inputs',
      label: `inputs.${input.path.join('.')}`,
      expression: refExpression(input.path),
    }),
  )
  // The parser reads another job's outputs only through a job this one needs.
  const needs = Array.isArray(own['needs']) ? own['needs'] : []
  for (const need of needs) {
    if (typeof need !== 'string') {
      continue
    }
    const target = editing.needTarget(need)
    for (const output of Object.keys(asRecord(asRecord(jobs[target])['outputs']))) {
      out.push(ref('outputs', `needs.${target}.outputs.${output}`))
    }
  }
  for (const variable of editing.matrixNames(own) ?? []) {
    out.push(ref('matrix', `matrix.${variable}`))
  }
  const declared = asRecord(root['needs'])
  for (const name of names(declared['organizationVariables'])) {
    out.push(ref('variables', `org.${name}`))
  }
  for (const name of names(declared['userVariables'])) {
    out.push(ref('variables', `var.${name}`))
  }
  for (const name of Object.keys(asRecord(root['sessions']))) {
    out.push(ref('sessions', `sessions.${name}`))
  }
  const env = new Set([...Object.keys(asRecord(root['env'])), ...Object.keys(asRecord(own['env']))])
  for (const key of env) {
    out.push(ref('env', `env.${key}`))
  }
  return out
}
