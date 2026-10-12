// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'

// The full monaco bundle registers browser commands jsdom lacks, so it loads after these;
// only the text model is needed here.
document.queryCommandSupported ??= () => false
globalThis.CSS ??= { escape: (value: string) => value } as typeof CSS
window.matchMedia ??= () =>
  ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  }) as unknown as MediaQueryList
const monaco = await import('monaco-editor')
const { holdListeners, modelFor } = await import('./editorModel')

afterEach(() => {
  for (const model of monaco.editor.getModels()) {
    model.dispose()
  }
})

describe('modelFor', () => {
  const step = monaco.Uri.parse('file:///workflow-step.yaml')

  it('refills a YAML path’s model, so its version moves on from the last editor’s', () => {
    const first = modelFor(step, 'name: Step 1\nrun: echo one\n', 'yaml')
    const version = first.getVersionId()
    const heard: string[] = []
    holdListeners(first, [first.onDidChangeContent(() => heard.push('first'))])

    const next = modelFor(step, 'name: Step 2\nuses: marketplace/x\n', 'yaml')
    expect(next).toBe(first)
    expect(next.getValue()).toBe('name: Step 2\nuses: marketplace/x\n')
    expect(next.getVersionId()).toBeGreaterThan(version)
    next.applyEdits([{ range: new monaco.Range(3, 1, 3, 1), text: 'id: two\n' }])
    expect(heard).toEqual([])
  })

  it('drops the markers of the text a refill replaces', () => {
    const model = modelFor(step, 'name: Step 1\nbogus: 1\n', 'yaml')
    const marker = {
      severity: monaco.MarkerSeverity.Warning,
      message: 'Property bogus is not allowed.',
      startLineNumber: 2,
      startColumn: 1,
      endLineNumber: 2,
      endColumn: 6,
    }
    monaco.editor.setModelMarkers(model, 'yaml', [marker])
    monaco.editor.setModelMarkers(model, 'workflowlint', [marker])
    modelFor(step, 'name: Step 1\n', 'yaml')
    expect(monaco.editor.getModelMarkers({ resource: step })).toEqual([])
  })

  it('guesses a refilled model’s indentation from its new text', () => {
    modelFor(step, 'with:\n    a: 1\n', 'yaml')
    const next = modelFor(step, 'with:\n  a: 1\n', 'yaml')
    expect(next.getOptions().tabSize).toBe(2)
  })

  it('makes other languages’ models anew, as before', () => {
    const uri = monaco.Uri.parse('file:///default')
    const first = modelFor(uri, 'echo one', 'shell')
    const next = modelFor(uri, 'echo two', 'shell')
    expect(next).not.toBe(first)
    expect(first.isDisposed()).toBe(true)
    const json = modelFor(step, '{}', 'json')
    expect(json.getLanguageId()).toBe('json')
    expect(modelFor(step, 'a: 1', 'yaml')).not.toBe(json)
  })
})
