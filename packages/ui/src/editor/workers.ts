import type { Environment } from 'monaco-editor'
import { hostEditorWorker } from './languages'

// Shared by both Monaco editors so load order can't leave an inconsistent global. Monaco asks
// for every worker here once one is configured, with no fallback of its own, so a label the
// editor can't serve fails loudly rather than getting a worker that answers nothing it asks.
const monacoEnvironment: Environment = {
  getWorker(_moduleId, label) {
    const host = hostEditorWorker(label)
    if (host) {
      return host()
    }
    if (label === 'json') {
      return new Worker(new URL('monaco-editor/language/json/json.worker.js', import.meta.url), {
        type: 'module',
      })
    }
    if (label === 'editorWorkerService') {
      return new Worker(new URL('monaco-editor/editor/editor.worker.js', import.meta.url), {
        type: 'module',
      })
    }
    throw new Error(
      `The editor has no worker for Monaco's "${label}" service: pass one to addEditorLanguages.`,
    )
  },
}

/**
 * Points window.MonacoEnvironment at the bundled workers and those a host added with
 * `addEditorLanguages`. Idempotent, and a host that already configured its own
 * MonacoEnvironment wins — the editor calls this on first load only when nothing is configured.
 */
export function setupMonacoWorkers(): void {
  if (window.MonacoEnvironment) {
    return
  }
  window.MonacoEnvironment = monacoEnvironment
}

/**
 * Starts the YAML language server. It is not a Monaco worker, so a host's own
 * MonacoEnvironment never has to provide it.
 */
export function createYamlWorker(): Worker {
  return new Worker(new URL('./yaml.worker.ts', import.meta.url), { type: 'module' })
}
