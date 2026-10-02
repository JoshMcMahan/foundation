import * as monaco from 'monaco-editor'
import { useEffect, useRef } from 'react'
import { useCssIsDark } from '../../components/useCssIsDark'
import { defineEditorThemes, getThemeName, setupMonacoWorkers } from '../../editor'

interface CodePreviewEditorProps {
  value: string
  language: string
}

const OPTIONS: monaco.editor.IStandaloneEditorConstructionOptions = {
  readOnly: true,
  domReadOnly: true,
  automaticLayout: true,
  minimap: { enabled: false },
  scrollBeyondLastLine: false,
  renderLineHighlight: 'none',
  overviewRulerLanes: 0,
  hideCursorInOverviewRuler: true,
  lineNumbers: 'on',
  wordWrap: 'off',
  fontSize: 12,
  scrollbar: { alwaysConsumeMouseWheel: false },
}

setupMonacoWorkers()

export default function CodePreviewEditor({ value, language }: CodePreviewEditorProps) {
  const isDark = useCssIsDark()
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null)

  useEffect(() => {
    return () => {
      editorRef.current?.getModel()?.dispose()
      editorRef.current?.dispose()
      editorRef.current = null
    }
  }, [])

  useEffect(() => {
    const model = editorRef.current?.getModel()
    if (model && model.getValue() !== value) {
      model.setValue(value)
    }
  }, [value])

  useEffect(() => {
    const model = editorRef.current?.getModel()
    if (model) {
      monaco.editor.setModelLanguage(model, language)
    }
  }, [language])

  useEffect(() => {
    if (editorRef.current) {
      defineEditorThemes(monaco.editor)
      monaco.editor.setTheme(getThemeName(isDark))
    }
  }, [isDark])

  return (
    <div
      className="h-full w-full"
      ref={(container) => {
        if (container && !editorRef.current) {
          defineEditorThemes(monaco.editor)
          const model = monaco.editor.createModel(value, language)
          editorRef.current = monaco.editor.create(container, {
            ...OPTIONS,
            model,
          })
          monaco.editor.setTheme(getThemeName(isDark))
        }
      }}
    />
  )
}
