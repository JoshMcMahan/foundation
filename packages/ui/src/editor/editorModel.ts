import * as monaco from 'monaco-editor'

const listeners = new WeakMap<monaco.editor.ITextModel, monaco.IDisposable[]>()

/** The model a new editor on `uri` edits, holding `value`. */
export function modelFor(
  uri: monaco.Uri,
  value: string,
  language: string | undefined,
): monaco.editor.ITextModel {
  const existing = monaco.editor.getModel(uri)
  // A YAML model is refilled rather than made anew: a new one starts over at version 1, and the
  // YAML service keeps one parse per path by version, so it would answer for the last editor's text.
  if (existing && language === 'yaml' && existing.getLanguageId() === 'yaml') {
    for (const listener of listeners.get(existing) ?? []) {
      listener.dispose()
    }
    // Its markers describe the text being replaced, and nothing else clears them all.
    const owners = new Set(
      monaco.editor.getModelMarkers({ resource: uri }).map((marker) => marker.owner),
    )
    for (const owner of owners) {
      monaco.editor.setModelMarkers(existing, owner, [])
    }
    existing.setValue(value)
    // Guessed from the new text with Monaco's defaults, as a new model's is.
    existing.detectIndentation(true, 4)
    return existing
  }
  existing?.dispose()
  return monaco.editor.createModel(value, language, uri)
}

/** An editor's listeners on its model, dropped when the next editor takes the model over. */
export function holdListeners(
  model: monaco.editor.ITextModel,
  disposables: monaco.IDisposable[],
): void {
  listeners.set(model, disposables)
}
