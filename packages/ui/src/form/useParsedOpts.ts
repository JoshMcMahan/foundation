import { useRef } from 'react'
import { useWorkflowEngine } from '../components/Provider'
import type { WorkflowVariables } from '../engine'
import { shareEqual } from './utils/shareEqual'

interface Cache {
  rawOptions: object | null
  orgVars: WorkflowVariables | undefined
  userVars: Record<string, string> | null
  secretKeys: string[] | null
  remoteVars: Record<string, string | undefined> | null
  converted: Record<string, unknown>
  inputDeps: Set<string>
  hasExpressions: boolean
  /** The inputs the schema reads, as text: a form store can change a value in place, so a kept
   * reference would always look unchanged. */
  relevant: string
  result: unknown
  /** The last parse, whose unchanged parts the next one reuses. */
  shared: unknown
}

// Stable empty defaults so an omitted userVars/secretKeys keeps the same
// identity across renders — otherwise the cache invalidates on every call.
const EMPTY_VARS: Record<string, string> = {}
const EMPTY_KEYS: string[] = []

/**
 * Parses a schema against the form's values, again only when an input it reads changes: a keystroke
 * elsewhere in the form gets the last parse back. A parse keeps each part of the last one it equals, so
 * a field whose schema the change left alone keeps its identity. Defaults `userVars`/`secretKeys` to empty — callers in React scope should pass them from `useUserVars()` so the parser leaves `${{ var.SECRET }}` literal during template eval (otherwise the recursive substitution turns `"https://${{ var.PAT }}@host/"` into `"https://@host/"`).
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
    relevant: '',
    result: null,
    shared: null,
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

  const relevant = JSON.stringify([...c.inputDeps].map((key) => values[key]))
  if (c.result !== null && relevant === c.relevant) {
    return c.result as T
  }

  const parsed = engine.evaluate({
    inputs: values,
    obj: c.converted,
    orgVars: organizationVariables,
    userVars,
    secretKeys,
    remoteVars,
  }) as T
  c.result = c.shared = shareEqual(c.shared, parsed)
  c.relevant = relevant
  return c.result as T
}
