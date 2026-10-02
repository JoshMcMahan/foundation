import { lazy, Suspense } from 'react'
import Loader from '../components/Loader'
import type { IEditorProps } from './Monaco'

const MonacoEditor = lazy(() => import('./Monaco'))

/*
The point of this wrapper is so you don't have to remember to import MonacoEditor using dynamic
*/
export default function Editor({ ...props }: IEditorProps) {
  return (
    <Suspense fallback={<Loader text="Loading editor..." />}>
      <MonacoEditor {...props} />
    </Suspense>
  )
}
