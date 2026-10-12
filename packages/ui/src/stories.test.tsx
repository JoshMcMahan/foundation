// @vitest-environment jsdom
// Portable-stories smoke test: every composed story must render under the
// provider defaults the preview decorator supplies. The Editor stories are
// excluded — monaco does not run in jsdom; the editor's own tests cover it —
// and the workflow dialogs' YAML views render nothing in its place.
import '@testing-library/jest-dom/vitest'
import { composeStories } from '@storybook/react-vite'
import { cleanup, render } from '@testing-library/react'
import type React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import * as primitives from './components/primitives.stories'
import * as fileExplorer from './file-explorer/FileExplorer.stories'
import * as form from './form/DynamicForm.stories'
import * as layoutShowcase from './form/LayoutShowcase.stories'
import * as workflow from './graph/DependencyGraph.stories'
import * as inputDialog from './graph/InputDialog.stories'
import * as inputsEditor from './graph/InputsEditor.stories'
import * as problemsButton from './graph/ProblemsButton.stories'
import * as appShell from './list/appShell.stories'
import * as list from './list/ListTable.stories'
import * as listControls from './list/listControls.stories'
import * as userHoverCard from './list/UserHoverCard.stories'
import * as logviewer from './logviewer/LogViewer.stories'

// jsdom lacks these; the DAG and explorer rely on them for layout plumbing.
global.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver
global.requestAnimationFrame = (() => 0) as typeof requestAnimationFrame
global.cancelAnimationFrame = (() => {}) as typeof cancelAnimationFrame

vi.mock('./components/Provider', async (importOriginal) =>
  (await import('./test/engine')).mockEngineHooks(importOriginal),
)

vi.mock('./editor/Monaco', () => ({ default: () => null }))

vi.mock('react-zoom-pan-pinch', () => ({
  TransformWrapper: ({ children }: { children: unknown }) =>
    typeof children === 'function' ? (children as () => unknown)() : children,
  TransformComponent: ({ children }: { children: unknown }) => children,
}))

const SUITES = {
  primitives,
  logviewer,
  list,
  listControls,
  appShell,
  userHoverCard,
  form,
  layoutShowcase,
  workflow,
  inputDialog,
  inputsEditor,
  problemsButton,
  fileExplorer,
} as const

afterEach(cleanup)

for (const [name, mod] of Object.entries(SUITES)) {
  describe(`${name} stories`, () => {
    const stories = composeStories(mod)
    const entries = Object.entries(stories) as [string, React.ComponentType][]
    for (const [storyName, Story] of entries) {
      it(`renders ${storyName}`, () => {
        const { container } = render(<Story />)
        expect(container).toBeInTheDocument()
      })
    }
  })
}
