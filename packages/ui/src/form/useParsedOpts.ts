import deepEqual from 'fast-deep-equal'
import { useRef } from 'react'
import { useWorkflowEngine } from '../components/Provider'
import type { WorkflowVariables } from '../engine'

interface Cache {
  rawOptions: object | null
  orgVars: WorkflowVariables | undefined
  userVars: Record<string, string> | null
  secretKeys: string[] | null
  remoteVars: Record<string, string | undefined> | null
  converted: Record<string, unknown>
  inputDeps: Set<string>
  hasExpressions: boolean
  relevantSnapshot: Record<string, unknown>
  result: unknown
}

// Stable empty defaults so an omitted userVars/secretKeys keeps the same
// identity across renders — otherwise the cache invalidates on every call.
const EMPTY_VARS: Record<string, string> = {}
const EMPTY_KEYS: string[] = []

/**
 * useMemo won't work here — Formik values changes on every keystroke, so this hook extracts which inputs.* keys the schema references and re-parses only when those change. Defaults `userVars`/`secretKeys` to empty — callers in React scope should pass them from `useUserVars()` so the parser leaves `${{ var.SECRET }}` literal during template eval (otherwise the recursive substitution turns `"https://${{ var.PAT }}@host/"` into `"https://@host/"`).
 */
export function useParsedOpts<T extends object = Record<string, unknown>>(
  rawOptions: T,
  values: Record<string, unknown>,
  organizationVariables: WorkflowVariables | undefined,
  userVars: Record<string, string> = EMPTY_VARS,
  secretKeys: string[] = EMPTY_KEYS,
  remoteVars: Record<string, string | undefined> = EMPTY_VARS,
): T {
  const engine = useWorkflowEngine()
  const cache = useRef<Cache>({
    rawOptions: null,
    orgVars: undefined,
    userVars: null,
    secretKeys: null,
    remoteVars: null,
    converted: {},
    inputDeps: new Set(),
    hasExpressions: false,
    relevantSnapshot: {},
    result: null,
  })

  const c = cache.current

  if (rawOptions !== c.rawOptions) {
    c.rawOptions = rawOptions
    c.converted = engine.convertInputs(rawOptions as Record<string, unknown>)
    const { inputDeps, hasExpressions } = engine.inputDependencies(c.converted)
    c.inputDeps = inputDeps
    c.hasExpressions = hasExpressions
    c.result = null
  }

  // Each arrives from its own query, after the form's first render — re-parse on any
  // identity change or secrets stay unredacted and a remote's repo/branch read empty.
  if (
    organizationVariables !== c.orgVars ||
    userVars !== c.userVars ||
    secretKeys !== c.secretKeys ||
    remoteVars !== c.remoteVars
  ) {
    c.orgVars = organizationVariables
    c.userVars = userVars
    c.secretKeys = secretKeys
    c.remoteVars = remoteVars
    c.result = null
  }

  if (c.result !== null) {
    if (c.inputDeps.size === 0) {
      return c.result as T
    }
    let inputsChanged = false
    for (const key of c.inputDeps) {
      if (!deepEqual(values[key], c.relevantSnapshot[key])) {
        inputsChanged = true
        break
      }
    }
    if (!inputsChanged) {
      return c.result as T
    }
  }

  const parsed = engine.evaluate({
    inputs: values,
    obj: c.converted,
    orgVars: organizationVariables,
    userVars,
    secretKeys,
    remoteVars,
  }) as T
  c.result = parsed

  c.relevantSnapshot = {}
  for (const key of c.inputDeps) {
    c.relevantSnapshot[key] = values[key]
  }

  return parsed
}
