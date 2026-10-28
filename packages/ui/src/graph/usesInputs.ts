import type { UIData, WorkflowJsonRef } from '../components/Provider'
import type { WorkflowEditing } from '../editing'
import { asRecord, type Json } from './records'

/** The file a repository `uses` reads when its step names no `$yaml`. */
export const DEFAULT_REPO_YAML = 'workflow.yaml'

/** The host a GitLab `uses` reads from when its step names no `$host`. */
export const DEFAULT_GITLAB_HOST = 'gitlab.com'

export interface UsesSources {
  resolve?: ((ref: WorkflowJsonRef) => Promise<unknown>) | undefined
  repos?: UIData['repoSuggestions']
  savedInputs?: UIData['resolveSavedInputs']
}

export function splitAtRef(value: string): [string, string] {
  const at = value.lastIndexOf('@')
  return at === -1 ? [value, ''] : [value.slice(0, at), value.slice(at + 1)]
}

/** The workflow a `marketplace/` or `workflow/` uses names, as the host reads it. */
function workflowRef(uses: string): WorkflowJsonRef | undefined {
  if (!/^(marketplace|workflow)\//.test(uses)) {
    return undefined
  }
  const rest = uses.slice(uses.indexOf('/') + 1)
  if (!uses.startsWith('marketplace/')) {
    return { kind: 'workflow', name: rest }
  }
  // The engine reads marketplace/SLUG/VERSION, or SLUG@VERSION when there's no slash.
  const [slug = '', version = ''] = rest.includes('/') ? rest.split('/', 2) : rest.split('@', 2)
  return { kind: 'marketplace', slug, version: version || 'latest' }
}

async function loadTarget(
  editing: WorkflowEditing,
  uses: string,
  where: { yamlPath: string; host: string },
  { resolve, repos }: UsesSources,
): Promise<unknown> {
  const workflow = workflowRef(uses)
  if (workflow && resolve) {
    return resolve(workflow)
  }
  const github = uses.startsWith('github/')
  if ((github || uses.startsWith('gitlab/')) && repos) {
    const [path, ref] = splitAtRef(uses.slice(uses.indexOf('/') + 1))
    if (!path || !ref) {
      return undefined
    }
    const repo = github ? path : `https://${where.host}/${path}`
    const text = await repos.file(repo, ref, where.yamlPath)
    return text ? editing.loadYaml(text) : undefined
  }
  return undefined
}

/** What a step can pass the workflow its `uses` names. */
export interface UsesTarget {
  inputs: Json
  /** The saved inputs the step's `$configuration` can name: those under its `configurations`,
   *  then the reader's own for it. */
  configurations: string[]
}

/** The inputs and saved inputs of the workflow `uses` names; null when it can't be read. */
export async function loadUsesTarget(
  editing: WorkflowEditing,
  uses: string,
  where: { yamlPath: string; host: string },
  sources: UsesSources,
): Promise<UsesTarget | null> {
  const ref = workflowRef(uses)
  const [doc, own] = await Promise.all([
    loadTarget(editing, uses, where, sources),
    // The reader's own are only suggestions, so failing to list them leaves the workflow's.
    ref && sources.savedInputs ? sources.savedInputs(ref).catch(() => []) : [],
  ])
  if (!doc) {
    return null
  }
  const workflow = asRecord(doc)
  return {
    inputs: asRecord(editing.workflowInputsSchema(workflow)),
    configurations: [...new Set([...Object.keys(asRecord(workflow['configurations'])), ...own])],
  }
}

/** The inputs of the workflow a step's `uses` names; null when it can't be read. */
export async function loadUsesInputs(
  editing: WorkflowEditing,
  uses: string,
  where: { yamlPath: string; host: string },
  sources: UsesSources,
): Promise<Json | null> {
  const doc = await loadTarget(editing, uses, where, sources)
  return doc ? asRecord(editing.workflowInputsSchema(asRecord(doc))) : null
}
