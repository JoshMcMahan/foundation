import * as monaco from 'monaco-editor/editor/editor.api'
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { useFieldLabelledControl } from '../components/Field'
import { useStrings } from '../components/Provider'
import { useCssIsDark } from '../components/useCssIsDark'
import { cx } from '../cx'
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
import './monacoFeatures'
import { registerRevealer } from './reveal'
import { defineEditorThemes, followThemeTokens, getThemeName } from './themes'
import { setupMonacoWorkers } from './workers'
import { ensureYamlLanguage } from './yamlLanguage'

setupMonacoWorkers()

/** A problem Monaco or the YAML service found in the text, as `onValidate` reports it. */
export type ValidationMarker = monaco.editor.IMarker

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

// Narrower than this, as on a phone, the minimap would take room the text needs.
const MINIMAP_MIN_WIDTH = 480
// A touch keyboard opens when the text is tapped; this button over the text, for touch
// keyboards on tablets, only covers lines.
const TOUCH_KEYBOARD_BUTTON = 'editor.contrib.iPadShowKeyboard'

const DISABLED_BACKGROUNDS = [
  '--vscode-editor-background',
  '--vscode-editorGutter-background',
  '--vscode-editorStickyScroll-background',
  '--vscode-minimap-background',
  '--vscode-editorOverviewRuler-background',
]

export interface EditorProps extends monaco.editor.IStandaloneEditorConstructionOptions {
  className?: string
  /** Shows the text greyed out and read-only, as a disabled field does. */
  disabled?: boolean | undefined
  /**
   * Shows the text to read rather than edit: it stays selectable, copyable and reachable by
   * keyboard, announces itself read-only, and shows no cursor, current line or quick fixes. The
   * view ends at the last line, and the wheel scrolls the page once the text has none left.
   */
  readOnly?: boolean
  /** The text as the person edits it, with carriage returns removed. */
  onChange?: (value: string) => void
  /** Every marker on the text, each time they change: the schema's, the lint's and the host's. */
  onValidate?: (markers: ValidationMarker[]) => void
  width?: string | number
  height?: string | number
  /**
   * The model's URI. A YAML schema registered with `configureEditorYaml` applies where its
   * `fileMatch` matches this path, and `revealLines` finds the editor by it. Each editor gets one
   * of its own when left out. It is read once: give the editor a `key` to edit another path.
   */
  path?: string
  /** Apply outside `value` changes as undoable edits instead of resetting the undo history. */
  preserveUndo?: boolean
  /** Checks a whole workflow for what the schema can't, such as needs read but never listed. */
  lint?: boolean
  /** Problems found elsewhere to mark in the text, such as a job's in the workflow around it. */
  markers?: EditorMarker[]
  /** Set when the text is one job or step, for completions that touch the rest of the workflow. */
  nested?: NestedWorkflowText
}

// The edit that turns `from` into `to`, touching only what differs, so a cursor or selection
// outside it stays where it is.
function minimalEdit(
  model: monaco.editor.ITextModel,
  from: string,
  to: string,
): monaco.editor.IIdentifiedSingleEditOperation {
  let start = 0
  const shortest = Math.min(from.length, to.length)
  while (start < shortest && from[start] === to[start]) {
    start++
  }
  let end = 0
  while (end < shortest - start && from[from.length - 1 - end] === to[to.length - 1 - end]) {
    end++
  }
  const a = model.getPositionAt(start)
  const b = model.getPositionAt(from.length - end)
  return {
    range: new monaco.Range(a.lineNumber, a.column, b.lineNumber, b.column),
    text: to.slice(start, to.length - end),
  }
}

export default function MonacoEditor({
  className,
  disabled,
  onChange = noop,
  onValidate = noop,
  width = '100%',
  height = '100%',
  path: pathProp,
  preserveUndo = false,
  lint = false,
  markers,
  nested,
  value,
  language,
  ...options
}: EditorProps) {
  const { common: t } = useStrings()
  // In a Field, the label names the editor and its description and help describe it.
  const field = useFieldLabelledControl()
  // Editors that shared one URI would share one model, and a second would take the first's text.
  const ownPath = `file:///editor/${useId().replace(/[^\w-]/g, '')}`
  const pathRef = useRef(pathProp ?? ownPath)
  const path = pathRef.current
  const isDark = useCssIsDark()
  const isDarkRef = useRef(isDark)
  isDarkRef.current = isDark
  // Always a boolean: Monaco keeps the last readOnly it was given, so leaving it unset once
  // `disabled` turns false would keep an editor that opened disabled locked.
  const readOnly = Boolean(disabled || options.readOnly)
  const containerRef = useRef<HTMLDivElement>(null)
  // Whether the editor is wide enough for a minimap, when the host leaves the minimap to it.
  const [roomy, setRoomy] = useState(true)
  const minimapOwnedRef = useRef(false)
  minimapOwnedRef.current = options.minimap === undefined
  const monacoRef = useRef<ReturnType<typeof monaco.editor.create>>(null)
  const isSyncingValueRef = useRef(false)
  const lintSources = useLintSources()
  const lintSourcesRef = useRef<LintSources>(lintSources)
  lintSourcesRef.current = lintSources
  const runLintRef = useRef<(() => void) | null>(null)
  const nestedRef = useRef(nested)
  nestedRef.current = nested
  const isNested = nested !== undefined
  // The editor is made once; its listeners call whatever the host passes now.
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange
  const onValidateRef = useRef(onValidate)
  onValidateRef.current = onValidate
  const markersRef = useRef(markers)
  markersRef.current = markers
  // Everything Monaco takes as an option, compared by value: hosts pass these inline.
  // Each is given whether or not the editor is read-only, as Monaco keeps the last value it got.
  const editorOptions: monaco.editor.IEditorOptions = {
    ariaLabel: t.codeEditor,
    ...(field?.['aria-required'] && { ariaRequired: true }),
    readOnlyMessage: { value: t.readOnlyText },
    // Keeps a touch device's keyboard from opening over text nobody can type into.
    domReadOnly: readOnly,
    hideCursorInOverviewRuler: readOnly,
    lightbulb: {
      enabled: readOnly
        ? monaco.editor.ShowLightbulbIconMode.Off
        : monaco.editor.ShowLightbulbIconMode.OnCode,
    },
    scrollBeyondLastLine: !readOnly,
    ...(options.minimap === undefined && { minimap: { enabled: roomy } }),
    ...options,
    // Text to read sits in a page, which should go on scrolling once the text reaches its end.
    scrollbar: { alwaysConsumeMouseWheel: !readOnly, ...options.scrollbar },
    readOnly,
    // A disabled editor shows no current line, as a disabled field shows no caret.
    renderLineHighlight: disabled
      ? 'none'
      : (options.renderLineHighlight ?? (readOnly ? 'none' : 'line')),
  }
  const optionsKey = JSON.stringify(editorOptions)
  const optionsRef = useRef(editorOptions)
  optionsRef.current = editorOptions
  const initialRef = useRef({ value, language })

  // The checks load with the engine, on demand; the text is checked again once they have, and
  // cleared when they're turned off.
  const lintEditing = useLintEditing(lint)
  const lintEditingRef = useRef<WorkflowEditing | undefined>(lintEditing)
  lintEditingRef.current = lintEditing
  const lintRef = useRef(lint)
  lintRef.current = lint

  // Made and disposed in one effect, so StrictMode's second mount makes a fresh editor rather
  // than keeping one whose listeners were torn down.
  useLayoutEffect(() => {
    const container = containerRef.current
    if (!container) {
      return
    }
    defineEditorThemes(monaco.editor)
    monaco.editor.setTheme(getThemeName(isDarkRef.current))
    const { value: initial, language: initialLanguage } = initialRef.current
    const model = modelFor(monaco.Uri.parse(path), initial ?? '', initialLanguage)
    // A hidden editor, 0 wide, keeps what it had until it shows.
    const fitsMinimap = (width: number, had: boolean) =>
      width === 0 ? had : width >= MINIMAP_MIN_WIDTH
    const roomyAtFirst = fitsMinimap(container.clientWidth, true)
    const editor = monaco.editor.create(container, {
      automaticLayout: true,
      model,
      ...optionsRef.current,
      ...(minimapOwnedRef.current && { minimap: { enabled: roomyAtFirst } }),
      fixedOverflowWidgets: true,
      suggest: {
        preview: true,
        // prevents the variable names from being shown as completion suggestions
        showWords: false,
        showInlineDetails: true,
      },
    })

    setRoomy(roomyAtFirst)
    editor.onDidLayoutChange(({ width }) => setRoomy((had) => fitsMinimap(width, had)))
    editor.getContribution(TOUCH_KEYBOARD_BUTTON)?.dispose()

    // A refilled model may still hold the last editor's markers; the lint's come back once it runs.
    setMarkers(
      model,
      HOST_MARKER_OWNER,
      (markersRef.current ?? []).map((marker) => lintMarker(model, marker)),
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
              .lintWorkflow(source, lintContext(editing, source, lintSourcesRef.current, runLint))
              .map((problem) => lintMarker(model, problem)),
      )
    }
    runLintRef.current = runLint
    let lintTimer: number | undefined
    const validate = () => {
      runLint()
      onValidateRef.current(monaco.editor.getModelMarkers({ resource: model.uri }))
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
        // Windows line endings break bash scripts.
        onChangeRef.current(editorText(editor.getValue()))
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
    validate()
    const unregisterReveal = registerRevealer(path, (start, end) => {
      const last = Math.min(Math.max(start, end), model.getLineCount())
      editor.revealLinesInCenterIfOutsideViewport(start, last)
      editor.setPosition({
        lineNumber: start,
        column: model.getLineFirstNonWhitespaceColumn(start) || 1,
      })
      const flash = editor.createDecorationsCollection([
        {
          range: new monaco.Range(start, 1, last, 1),
          options: { isWholeLine: true, className: 'bg-(--theme-accent)/20' },
        },
      ])
      window.setTimeout(() => flash.clear(), 1500)
    })
    const unfollow = followThemeTokens(monaco.editor, () => getThemeName(isDarkRef.current))

    ensureYamlLanguage()
    monacoRef.current = editor
    return () => {
      unfollow()
      unregisterReveal()
      for (const listener of modelListeners) {
        listener.dispose()
      }
      editor.dispose()
      monacoRef.current = null
      runLintRef.current = null
      // The YAML service and completion providers are global and outlive every editor. A YAML
      // model stays for the next editor on its path, since the service keeps its parse by
      // version; any other model goes with its editor.
      if (!model.isDisposed() && model.getLanguageId() !== 'yaml') {
        model.dispose()
      }
    }
  }, [path])

  useEffect(() => {
    if (monacoRef.current) {
      defineEditorThemes(monaco.editor)
      monaco.editor.setTheme(getThemeName(isDark))
    }
  }, [isDark])

  // Monaco has one theme for the whole page, so a disabled editor greys out by its own colors
  // rather than switching a theme every other editor would follow. They go inline on the
  // editor's node: Monaco's stylesheet sets them there, outside the package's layer.
  useEffect(() => {
    const node = monacoRef.current?.getDomNode()
    for (const name of DISABLED_BACKGROUNDS) {
      if (disabled) {
        node?.style.setProperty(name, 'var(--theme-input-disabled-bg)')
      } else {
        node?.style.removeProperty(name)
      }
    }
  }, [disabled])

  // Monaco marks its input readonly only for the textarea it falls back to, and never says so to
  // a screen reader on the EditContext node it focuses where the browser has one. A Field's label
  // and description reach that node the same way: it is a div where the browser has EditContext,
  // which no label's `for` can name, so the label names it by id.
  const fieldId = field?.id
  const labelledBy = field?.['aria-labelledby']
  const describedBy = field?.['aria-describedby']
  const invalid = field?.['aria-invalid']
  // biome-ignore lint/correctness/useExhaustiveDependencies: a new path makes a new editor to mark.
  useEffect(() => {
    const input = monacoRef.current
      ?.getDomNode()
      ?.querySelector('textarea.inputarea, .native-edit-context')
    if (!input) {
      return
    }
    input.setAttribute('aria-readonly', String(readOnly))
    const attributes = {
      id: fieldId,
      'aria-labelledby': labelledBy,
      'aria-describedby': describedBy,
      'aria-invalid': invalid && 'true',
    }
    for (const [name, value] of Object.entries(attributes)) {
      if (value) {
        input.setAttribute(name, value)
      } else {
        input.removeAttribute(name)
      }
    }
  }, [readOnly, path, fieldId, labelledBy, describedBy, invalid])

  // biome-ignore lint/correctness/useExhaustiveDependencies: optionsKey stands for the options by value.
  useEffect(() => {
    monacoRef.current?.updateOptions(optionsRef.current)
  }, [optionsKey])

  useEffect(() => {
    const model = monacoRef.current?.getModel()
    if (model && language && model.getLanguageId() !== language) {
      monaco.editor.setModelLanguage(model, language)
    }
  }, [language])

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

  // Reconcile before paint so an older passive effect cannot overwrite a new edit. Only what
  // differs is replaced, so the cursor, selection and scroll stay put when the host hands back
  // text that differs elsewhere or not at all.
  useLayoutEffect(() => {
    const editor = monacoRef.current
    const model = editor?.getModel()
    if (!editor || !model || value === undefined) {
      return
    }
    const current = model.getValue()
    if (editorText(current) === editorText(value)) {
      return
    }
    isSyncingValueRef.current = true
    try {
      if (preserveUndo) {
        editor.pushUndoStop()
        model.pushEditOperations([], [minimalEdit(model, current, value)], () => null)
        editor.pushUndoStop()
      } else {
        // Outside text starts a new history: undoing past it would bring back text the host replaced.
        const view = editor.saveViewState()
        model.setValue(value)
        if (view) {
          editor.restoreViewState(view)
        }
      }
    } finally {
      isSyncingValueRef.current = false
    }
  }, [value, preserveUndo])

  return (
    <div
      ref={containerRef}
      style={{ width, height }}
      data-disabled={disabled ? '' : undefined}
      data-read-only={readOnly ? '' : undefined}
      className={cx(
        'relative rounded border border-(--theme-border)',
        'focus-within:border-(--theme-focus) focus-within:ring-1 focus-within:ring-(--theme-focus)',
        // Monaco has no option to hide the cursor; the selection still shows where the keys are.
        'data-read-only:[&_.cursors-layer]:hidden data-disabled:[&_.view-lines]:opacity-60',
        className,
      )}
    />
  )
}
