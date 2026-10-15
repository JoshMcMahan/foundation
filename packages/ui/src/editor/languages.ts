// Kept free of Monaco imports: the editor's entry imports it eagerly, and a host calls
// `addEditorLanguages` at startup, long before the first editor pulls Monaco in.

/** Languages a host adds to the ones the editor carries. */
export interface EditorLanguages {
  /**
   * Imports Monaco's registration for the languages, such as
   * `() => import('monaco-editor/languages/definitions/ruby/register')`. It runs when the next
   * editor mounts, so Monaco still loads only once an editor needs it.
   */
  load: () => Promise<unknown>
  /**
   * A worker for each language service the registration brings, by the label Monaco asks for,
   * such as `typescript` and `javascript`. Basic languages color text on the page and need none.
   */
  workers?: Record<string, () => Worker>
}

const workers = new Map<string, () => Worker>()
let waiting: EditorLanguages['load'][] = []
let loading: Promise<unknown> | undefined

/**
 * Adds language services with their workers, such as TypeScript's, or languages of the host's
 * own, to the coloring the editor has for every Monaco language. Call it once at startup, before
 * the first editor mounts; an editor that mounts while they load waits for them.
 */
export function addEditorLanguages({ load, workers: added = {} }: EditorLanguages): void {
  for (const [label, create] of Object.entries(added)) {
    workers.set(label, create)
  }
  waiting.push(load)
}

/** The languages still loading, starting any added since, or undefined once all have. */
export function editorLanguagesLoading(): Promise<unknown> | undefined {
  if (waiting.length > 0) {
    const loads = waiting
    waiting = []
    const started = Promise.all([
      loading,
      ...loads.map((load) =>
        // A language that fails to load leaves its text uncolored rather than taking every
        // editor on the page down with it.
        load().catch((error: unknown) => console.error('An editor language failed to load', error)),
      ),
    ]).finally(() => {
      if (loading === started) {
        loading = undefined
      }
    })
    loading = started
  }
  return loading
}

/** The host's worker for a Monaco worker label, if it added one. */
export function hostEditorWorker(label: string): (() => Worker) | undefined {
  return workers.get(label)
}
