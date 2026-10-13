// The page the benchmark measures: a production build of one dependency graph, which `?shape=`
// picks and `window.mount` draws again from nothing.
import '../dist/styles/fonts.css'
import '../dist/styles.css'
import * as parser from '@parallelworks/workflow-parser'
import { createRoot } from 'react-dom/client'
import { UIProvider } from '../src/components/Provider'
import { DependencyGraphPreview } from '../src/graph/DependencyGraph'
import { layeredJobs, nestedJobs } from '../src/graph/stories/generate'
import { TEST_ACTIONS } from '../src/test/actions'
import { applyTheme, DEFAULT_THEME, deriveTheme, schemeFor } from '../src/theme/index'

const engine = { ...parser.createWorkflowEngine(), editing: parser }
const shapes: Record<string, () => Record<string, unknown>> = {
  thousand: () => layeredJobs(1000),
  'three-thousand': () => layeredJobs(3000, { columns: 40 }),
  nested: () => nestedJobs(3, 12),
}
const shape = new URLSearchParams(location.search).get('shape') ?? 'thousand'
applyTheme(document.documentElement, deriveTheme(schemeFor(DEFAULT_THEME, 'light')))
const root = createRoot(document.getElementById('root') as HTMLElement)
let mounts = 0
const mount = () => {
  mounts++
  root.render(
    <UIProvider engine={engine as never} data={{ workflowActions: TEST_ACTIONS }}>
      <DependencyGraphPreview key={mounts} yml={{ jobs: shapes[shape]?.() ?? {} }} height="720px" />
    </UIProvider>,
  )
}
Object.assign(window, { mount })
mount()
