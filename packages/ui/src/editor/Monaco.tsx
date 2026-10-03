import cx from 'classnames'
import * as monaco from 'monaco-editor'
import { useEffect, useLayoutEffect, useRef } from 'react'
import { useCssIsDark } from '../components/useCssIsDark'
import { defineEditorThemes, getThemeName } from './themes'
import { setupMonacoWorkers } from './workers'
import { ensureYamlLanguage } from './yamlLanguage'

setupMonacoWorkers()

export type ISchemaError = monaco.editor.IMarker

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
  ...options
}: IEditorProps) {
  const isDark = useCssIsDark()
  const readOnly = disabled || options.readOnly
  const monacoRef = useRef<ReturnType<typeof monaco.editor.create>>(null)
  const isSyncingValueRef = useRef(false)

  // Update theme when the scheme or disabled state changes
  useEffect(() => {
    if (!monacoRef.current) {
      return
    }
    defineEditorThemes(monaco.editor)
    monaco.editor.setTheme(getThemeName(isDark, disabled))
    monacoRef.current.updateOptions(readOnly === undefined ? {} : { readOnly })
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
      model.setValue(options.value)
    } finally {
      isSyncingValueRef.current = false
    }
  }, [options.value])

  // Dispose only the editor on unmount; the YAML service and completion providers
  // are global and outlive every editor.
  useEffect(() => {
    return () => {
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
          const disp = monaco.editor.getModel(monaco.Uri.parse(path))
          disp?.dispose()
          defineEditorThemes(monaco.editor)
          monaco.editor.setTheme(getThemeName(isDark, disabled))
          const model = monaco.editor.createModel(
            options.value ?? '',
            options.language,
            monaco.Uri.parse(path),
          )
          const editor = monaco.editor.create(ref, {
            automaticLayout: true,
            model,
            ...options,
            ...(readOnly === undefined ? {} : { readOnly }),
            fixedOverflowWidgets: true,
            suggest: {
              preview: true,
              // prevents the variable names from being shown as completion suggestions
              showWords: false,
              showInlineDetails: true,
            },
            //acceptSuggestionOnEnter: 'off'
          })

          model.onDidChangeContent(() => {
            // Skip onChange for programmatic setValue calls (value prop sync)
            // to avoid an infinite re-render loop.
            if (isSyncingValueRef.current) {
              return
            }
            onChangeWrapper(editor.getValue())
          })

          model.onDidChangeDecorations(() => {
            const markers = monaco.editor.getModelMarkers({
              resource: model.uri,
            })
            onValidate(markers)
          })

          ensureYamlLanguage()
          monacoRef.current = editor
        }
      }}
    />
  )
}
