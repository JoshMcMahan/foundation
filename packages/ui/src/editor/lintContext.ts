import { useEffect, useMemo, useState } from 'react'
import {
  useLoadedWorkflowEngine,
  useRepoSuggestions,
  useSecretVariablesResolver,
  useWorkflowActions,
  useWorkflowEditing,
  useWorkflowJsonResolver,
} from '../components/Provider'
import type { WorkflowEditing, WorkflowLintContext } from '../editing'
import { asRecord } from '../graph/records'
import {
  DEFAULT_GITLAB_HOST,
  DEFAULT_REPO_YAML,
  loadUsesInputs,
  type UsesSources,
} from '../graph/usesInputs'

export { HOST_MARKER_OWNER, LINT_OWNER } from './lintOwner'

export interface LintSources extends UsesSources {
  secrets?: (() => Promise<string[]>) | undefined
  /** `uses` values the host runs itself, which have no workflow to read inputs from. */
  actions?: Record<string, unknown> | undefined
}

// The checks run on every edit, so what they read is kept a while and fetched again once stale: a minute
// for what arrived, a few seconds for what couldn't be read (null), which says nothing about the workflow.
const KEEP_MS = 60_000
const KEEP_FAILED_MS = 10_000

interface Kept<T> {
  value: T | null
  at: number
}

const stale = (kept: Kept<unknown> | undefined) =>
  !kept || Date.now() - kept.at > (kept.value === null ? KEEP_FAILED_MS : KEEP_MS)

// A read that failed keeps what the last one brought, tried again as soon as a failure would be.
function failed<T>(kept: Kept<T> | undefined): Kept<T> {
  return kept?.value
    ? { value: kept.value, at: Date.now() - KEEP_MS + KEEP_FAILED_MS }
    : { value: null, at: Date.now() }
}

const targets = new Map<string, Kept<Record<string, unknown>>>()
let secretNames: Kept<string[]> | undefined
// The checks waiting on each fetch under way, each told when it lands.
const waiting = new Map<string, Set<() => void>>()
const SECRETS = '\u0000secrets'

function fetchOnce(key: string, onMore: () => void, load: () => Promise<void>) {
  const waiters = waiting.get(key)
  if (waiters) {
    waiters.add(onMore)
    return
  }
  const told = new Set([onMore])
  waiting.set(key, told)
  void load().finally(() => {
    waiting.delete(key)
    for (const tell of told) {
      tell()
    }
  })
}

const text = (value: unknown, fallback: string) =>
  typeof value === 'string' && value ? value : fallback

/**
 * What the linter can't read from `source`: the inputs of each workflow a step uses, and which
 * of the user's variables are secret, as far as they have arrived. `onMore` runs when more does.
 */
export function lintContext(
  editing: WorkflowEditing,
  source: string,
  sources: LintSources,
  onMore: () => void,
): WorkflowLintContext {
  let doc: unknown
  try {
    doc = editing.loadYaml(source)
  } catch {
    doc = undefined
  }
  // The linter keys targets by `uses` alone, so a target two steps read from different files is skipped.
  const wanted = new Map<string, Set<string>>()
  for (const job of Object.values(asRecord(asRecord(doc)['jobs']))) {
    const steps = asRecord(job)['steps']
    for (const step of Array.isArray(steps) ? steps : []) {
      const uses = asRecord(step)['uses']
      if (
        typeof uses !== 'string' ||
        uses.includes('${{') ||
        Object.hasOwn(sources.actions ?? {}, uses.trim())
      ) {
        continue
      }
      const withBlock = asRecord(asRecord(step)['with'])
      const key = [
        uses.trim(),
        text(withBlock['$yaml'], DEFAULT_REPO_YAML),
        text(withBlock['$host'], DEFAULT_GITLAB_HOST),
      ].join('\n')
      wanted.set(uses.trim(), (wanted.get(uses.trim()) ?? new Set()).add(key))
    }
  }
  const usesInputs: Record<string, unknown> = {}
  for (const [uses, keys] of wanted) {
    const key = keys.size === 1 ? [...keys][0] : undefined
    if (key === undefined) {
      continue
    }
    const kept = targets.get(key)
    if (kept?.value) {
      usesInputs[uses] = kept.value
    }
    if (stale(kept)) {
      const [, yamlPath = DEFAULT_REPO_YAML, host = DEFAULT_GITLAB_HOST] = key.split('\n')
      fetchOnce(key, onMore, () =>
        loadUsesInputs(editing, uses, { yamlPath, host }, sources).then(
          (inputs) => {
            targets.set(key, { value: inputs, at: Date.now() })
          },
          () => {
            targets.set(key, failed(targets.get(key)))
          },
        ),
      )
    }
  }
  const secrets = sources.secrets
  if (secrets && stale(secretNames)) {
    fetchOnce(SECRETS, onMore, () =>
      secrets().then(
        (names) => {
          secretNames = { value: names, at: Date.now() }
        },
        () => {
          secretNames = failed(secretNames)
        },
      ),
    )
  }
  return { usesInputs, ...(secretNames?.value ? { secretVars: secretNames.value } : {}) }
}

export function useLintSources(): LintSources {
  const resolve = useWorkflowJsonResolver()
  const repos = useRepoSuggestions()
  const secrets = useSecretVariablesResolver()
  const actions = useWorkflowActions()
  return useMemo(() => ({ resolve, repos, secrets, actions }), [resolve, repos, secrets, actions])
}

/** lintContext for a component, which renders again when more of it arrives. */
export function useLintContext(source: string | undefined): WorkflowLintContext {
  const editing = useWorkflowEditing()
  const sources = useLintSources()
  const [arrivals, setArrivals] = useState(0)
  // biome-ignore lint/correctness/useExhaustiveDependencies: each arrival reads the context again.
  return useMemo(
    () =>
      source === undefined
        ? {}
        : lintContext(editing, source, sources, () => setArrivals((n) => n + 1)),
    [editing, source, sources, arrivals],
  )
}

/**
 * The engine's editing once its checks have loaded, rendering again when they have; undefined
 * before then, without an engine that edits, or with `load` false.
 */
export function useLintEditing(load = true): WorkflowEditing | undefined {
  const engine = useLoadedWorkflowEngine()
  const [ready, setReady] = useState(() => !!engine?.isReady())
  useEffect(() => {
    if (!load || !engine?.editing) {
      return
    }
    if (engine.isReady()) {
      setReady(true)
      return
    }
    engine.init()
    return engine.onReady((loaded) => {
      if (loaded) {
        setReady(true)
      }
    })
  }, [load, engine])
  return load && ready ? engine?.editing : undefined
}
