import type { Environment } from 'monaco-editor'

// Shared by both Monaco editors so load order can't leave an inconsistent global.
const monacoEnvironment: Environment = {
  getWorker(_moduleId, label) {
    if (label === 'json') {
      return new Worker(
        new URL('monaco-editor/esm/vs/language/json/json.worker.js', import.meta.url),
        { type: 'module' },
      )
    }
    if (label === 'yaml') {
      return new Worker(new URL('monaco-yaml/yaml.worker.js', import.meta.url), { type: 'module' })
    }
    return new Worker(new URL('monaco-editor/esm/vs/editor/editor.worker.js', import.meta.url), {
      type: 'module',
    })
  },
}

/**
 * Points window.MonacoEnvironment at the bundled workers. Idempotent, and a
 * host that already configured its own MonacoEnvironment wins — the editor
 * calls this on first load only when nothing is configured.
 */
export function setupMonacoWorkers(): void {
  if (window.MonacoEnvironment) {
    return
  }
  window.MonacoEnvironment = monacoEnvironment
}
