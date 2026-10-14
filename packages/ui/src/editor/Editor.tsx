import { lazy, Suspense } from 'react'
import { Loader } from '../components/Loader'
import type { EditorProps } from './Monaco'

const MonacoEditor = lazy(() => import('./Monaco'))

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
      <MonacoEditor {...props} />
    </Suspense>
  )
}
