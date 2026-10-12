import cx from 'classnames'
import * as monaco from 'monaco-editor'
import { useEffect, useLayoutEffect, useRef } from 'react'
import { useCssIsDark } from '../components/useCssIsDark'
import type { WorkflowEditing } from '../editing'
import { holdListeners, modelFor } from './editorModel'
import {
  HOST_MARKER_OWNER,
  LINT_OWNER,
  type LintSources,
  lintContext,
  useLintEditing,
  useLintSources,
} from './lintContext'
import { type NestedWorkflowText, publishNestedText } from './nestedText'
import { registerRevealer } from './reveal'
import { defineEditorThemes, getThemeName } from './themes'
import { setupMonacoWorkers } from './workers'
import { ensureYamlLanguage } from './yamlLanguage'

setupMonacoWorkers()

export type ISchemaError = monaco.editor.IMarker

// yaml-language-server's code for a schema it couldn't load, which says nothing about the text.
const SCHEMA_UNREADABLE = '768'

/** A problem to mark on one line of the editor. */
export interface EditorMarker {
  line: number
  message: string
}

function lintMarker(
  model: monaco.editor.ITextModel,
  { line, message }: EditorMarker,
): monaco.editor.IMarkerData {
  const at = Math.min(Math.max(line || 1, 1), model.getLineCount())
  return {
    severity: monaco.MarkerSeverity.Error,
    message,
    startLineNumber: at,
    startColumn: model.getLineFirstNonWhitespaceColumn(at) || 1,
    endLineNumber: at,
    endColumn: model.getLineMaxColumn(at),
  }
}

function sameMarkers(
  a: readonly { message: string; startLineNumber: number }[],
  b: readonly { message: string; startLineNumber: number }[],
): boolean {
  return (
    a.length === b.length &&
    a.every(
      (marker, i) =>
        marker.message === b[i]?.message && marker.startLineNumber === b[i]?.startLineNumber,
    )
  )
}

// Setting markers runs the check again through the marker listener; leaving equal ones stops the loop.
function setMarkers(
  model: monaco.editor.ITextModel,
  owner: string,
  wanted: monaco.editor.IMarkerData[],
) {
  if (!sameMarkers(monaco.editor.getModelMarkers({ resource: model.uri, owner }), wanted)) {
    monaco.editor.setModelMarkers(model, owner, wanted)
  }
}

function editorText(value: string): string {
  return value.replace(/\r/g, '')
}

const noop = () => {}
export interface IEditorProps extends monaco.editor.IStandaloneEditorConstructionOptions {
  className?: string
  disabled?: boolean | undefined
  onChange?: (value: string) => void
  onValidate?: (errors: ISchemaError[]) => void
  width?: string | number
  height?: string | number
  path?: 'file:///workflow.yaml' | string
  /** Apply outside `value` changes as undoable edits instead of resetting the undo history. */
  preserveUndo?: boolean
  /** Checks a whole workflow for what the schema can't, such as needs read but never listed. */
  lint?: boolean
  /** Problems found elsewhere to mark in the text, such as a job's in the workflow around it. */
  markers?: EditorMarker[]
  /** Set when the text is one job or step, for completions that touch the rest of the workflow. */
  nested?: NestedWorkflowText
}

export default function MonacoEditor({
  className,
  disabled,
  onChange = noop,
  onValidate = noop,
  width = '100%',
  height = '100%',
  // `path` is for multi-model editors, but we also use it to determine
  // if we should use the workflow schema or not.
  path = 'file:///default',
  preserveUndo = false,
  lint = false,
  markers,
  nested,
  ...options
}: IEditorProps) {
  const isDark = useCssIsDark()
  // Always a boolean: Monaco keeps the last readOnly it was given, so leaving it unset once
  // `disabled` turns false would keep an editor that opened disabled locked.
  const readOnly = Boolean(disabled || options.readOnly)
  const monacoRef = useRef<ReturnType<typeof monaco.editor.create>>(null)
  const isSyncingValueRef = useRef(false)
  const lintSources = useLintSources()
  const lintSourcesRef = useRef<LintSources>(lintSources)
  lintSourcesRef.current = lintSources
  const runLintRef = useRef<(() => void) | null>(null)
  const unregisterRevealRef = useRef<(() => void) | null>(null)
  const listenersRef = useRef<monaco.IDisposable[]>([])
  const nestedRef = useRef(nested)
  nestedRef.current = nested
  const isNested = nested !== undefined

  // The checks load with the engine, on demand; the text is checked again once they have, and
  // cleared when they're turned off.
  const lintEditing = useLintEditing(lint)
  const lintEditingRef = useRef<WorkflowEditing | undefined>(lintEditing)
  lintEditingRef.current = lintEditing
  const lintRef = useRef(lint)
  lintRef.current = lint
  useEffect(() => {
    const model = monacoRef.current?.getModel()
    if (!lint && model) {
      setMarkers(model, LINT_OWNER, [])
    } else if (lint && lintEditing) {
      runLintRef.current?.()
    }
  }, [lint, lintEditing])

  useEffect(() => {
    const model = monacoRef.current?.getModel()
    if (model) {
      setMarkers(
        model,
        HOST_MARKER_OWNER,
        (markers ?? []).map((marker) => lintMarker(model, marker)),
      )
    }
  }, [markers])

  useEffect(() => {
    if (!isNested) {
      return
    }
    return publishNestedText(monaco.Uri.parse(path).toString(), nestedRef)
  }, [path, isNested])

  // Update theme when the scheme or disabled state changes
  useEffect(() => {
    if (!monacoRef.current) {
      return
    }
    defineEditorThemes(monaco.editor)
    monaco.editor.setTheme(getThemeName(isDark, disabled))
    monacoRef.current.updateOptions({ readOnly })
  }, [disabled, isDark, readOnly])

  // Reconcile before paint so an older passive effect cannot overwrite a new edit.
  useLayoutEffect(() => {
    const model = monacoRef.current?.getModel()
    if (
      !model ||
      options.value === undefined ||
      editorText(model.getValue()) === editorText(options.value)
    ) {
      return
    }
    isSyncingValueRef.current = true
    try {
      if (preserveUndo) {
        const editor = monacoRef.current
        editor?.pushUndoStop()
        model.pushEditOperations(
          [],
          [{ range: model.getFullModelRange(), text: options.value }],
          () => null,
        )
        editor?.pushUndoStop()
      } else {
        model.setValue(options.value)
      }
    } finally {
      isSyncingValueRef.current = false
    }
  }, [options.value, preserveUndo])

  // Dispose only the editor on unmount; the YAML service and completion providers
  // are global and outlive every editor.
  useEffect(() => {
    return () => {
      unregisterRevealRef.current?.()
      for (const listener of listenersRef.current) {
        listener.dispose()
      }
      monacoRef.current?.dispose()
      monacoRef.current = null
    }
  }, [])

  /** Strips CR (\r) — Windows line endings break bash scripts. */
  const onChangeWrapper = (value: string) => {
    value = editorText(value)
    onChange(value)
  }

  return (
    <div
      style={{ width, height }}
      className={cx('relative border rounded', className)}
      ref={(ref) => {
        if (ref && !monacoRef.current) {
          defineEditorThemes(monaco.editor)
          monaco.editor.setTheme(getThemeName(isDark, disabled))
          const model = modelFor(monaco.Uri.parse(path), options.value ?? '', options.language)
          const editor = monaco.editor.create(ref, {
            automaticLayout: true,
            model,
            ...options,
            readOnly,
            fixedOverflowWidgets: true,
            suggest: {
              preview: true,
              // prevents the variable names from being shown as completion suggestions
              showWords: false,
              showInlineDetails: true,
            },
          })

          // A refilled model may still hold the last editor's markers; the lint's come back once it runs.
          setMarkers(
            model,
            HOST_MARKER_OWNER,
            (markers ?? []).map((marker) => lintMarker(model, marker)),
          )
          setMarkers(model, LINT_OWNER, [])
          // The cross-reference checks read a shape they can only take for granted once the
          // schema is satisfied, so the schema's problems come first and alone.
          const runLint = () => {
            const editing = lintEditingRef.current
            if (!lintRef.current || !editing || model.isDisposed()) {
              return
            }
            const schema = monaco.editor
              .getModelMarkers({ resource: model.uri })
              .filter(
                (marker) =>
                  marker.owner !== LINT_OWNER &&
                  marker.owner !== HOST_MARKER_OWNER &&
                  String(marker.code ?? '') !== SCHEMA_UNREADABLE,
              )
            const source = model.getValue()
            setMarkers(
              model,
              LINT_OWNER,
              schema.length > 0
                ? []
                : editing
                    .lintWorkflow(
                      source,
                      lintContext(editing, source, lintSourcesRef.current, runLint),
                    )
                    .map((problem) => lintMarker(model, problem)),
            )
          }
          runLintRef.current = runLint
          let lintTimer: number | undefined
          const validate = () => {
            runLint()
            onValidate(monaco.editor.getModelMarkers({ resource: model.uri }))
          }
          const modelListeners = [
            model.onDidChangeContent(() => {
              if (lintRef.current) {
                window.clearTimeout(lintTimer)
                lintTimer = window.setTimeout(runLint, 300)
              }
              // Skip onChange for programmatic setValue calls (value prop sync)
              // to avoid an infinite re-render loop.
              if (isSyncingValueRef.current) {
                return
              }
              onChangeWrapper(editor.getValue())
            }),
            // Markers rather than decorations: a model's markers can clear without its decorations changing.
            monaco.editor.onDidChangeMarkers((resources) => {
              const uri = model.uri.toString()
              if (resources.some((resource) => resource.toString() === uri)) {
                validate()
              }
            }),
            { dispose: () => window.clearTimeout(lintTimer) },
          ]
          holdListeners(model, modelListeners)
          listenersRef.current = modelListeners
          validate()
          unregisterRevealRef.current = registerRevealer(path, (start, end) => {
            const last = Math.min(Math.max(start, end), model.getLineCount())
            editor.revealLinesInCenterIfOutsideViewport(start, last)
            editor.setPosition({
              lineNumber: start,
              column: model.getLineFirstNonWhitespaceColumn(start) || 1,
            })
            const flash = editor.createDecorationsCollection([
              {
                range: new monaco.Range(start, 1, last, 1),
                options: { isWholeLine: true, className: 'bg-(--theme-element)/20' },
              },
            ])
            window.setTimeout(() => flash.clear(), 1500)
          })

          ensureYamlLanguage()
          monacoRef.current = editor
        }
      }}
    />
  )
}
