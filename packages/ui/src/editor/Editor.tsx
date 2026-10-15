import { lazy, Suspense, use } from 'react'
import { Loader } from '../components/Loader'
import { editorLanguagesLoading } from './languages'
import type { EditorProps } from './Monaco'

const loadMonaco = () => import('./Monaco')
const MonacoEditor = lazy(loadMonaco)

function LoadedEditor(props: EditorProps) {
  const languages = editorLanguagesLoading()
  if (languages) {
    // Fetched alongside the host's languages rather than after them.
    void loadMonaco()
    use(languages)
  }
  return <MonacoEditor {...props} />
}

/** A Monaco code editor, loaded on first render so Monaco stays out of the host's first bundle. */
export function Editor(props: EditorProps) {
  const { width = '100%', height = '100%' } = props
  return (
    // The fallback takes the editor's size, so nothing moves when Monaco arrives.
    <Suspense
      fallback={
        <div style={{ width, height }} className="flex items-center justify-center">
          <Loader />
        </div>
      }
    >
      <LoadedEditor {...props} />
    </Suspense>
  )
}
