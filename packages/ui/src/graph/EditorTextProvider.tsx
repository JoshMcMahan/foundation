import { type ReactNode, useContext, useMemo } from 'react'
import { type EditorText, EditorTextContext } from './editorStrings'

/** The visual editors' text for everything below it, over UIProvider's. A host that
 *  translates the editors here, on the page that shows one, loads that text with the page
 *  instead of with every page. */
export function EditorTextProvider({
  graphEditor,
  inputsEditor,
  children,
}: EditorText & { children: ReactNode }) {
  const outer = useContext(EditorTextContext)
  const value = useMemo(
    () => ({
      graphEditor: { ...outer.graphEditor, ...graphEditor },
      inputsEditor: { ...outer.inputsEditor, ...inputsEditor },
    }),
    [outer, graphEditor, inputsEditor],
  )
  return <EditorTextContext value={value}>{children}</EditorTextContext>
}
