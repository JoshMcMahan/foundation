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

import * as accessDrawer from './access/AccessDrawer.stories'
import * as breadcrumbs from './components/Breadcrumbs.stories'
import * as callout from './components/Callout.stories'
import * as combobox from './components/Combobox.stories'
import * as copy from './components/CopyButton.stories'
import * as controls from './components/controls.stories'
import * as descriptionList from './components/DescriptionList.stories'
import * as errorPage from './components/ErrorPage.stories'
import * as fields from './components/fields.stories'
import * as loading from './components/loading.stories'
import * as markdown from './components/Markdown.stories'
import * as menus from './components/Menu.stories'
import * as overlays from './components/overlays.stories'
import * as pageHeader from './components/pageHeader.stories'
import * as primitives from './components/primitives.stories'
import * as sections from './components/sections.stories'
import * as tabs from './components/Tabs.stories'
import * as themeEditor from './components/ThemeEditor.stories'
import * as toasts from './components/Toast.stories'
import * as toggleGroup from './components/ToggleGroup.stories'
import * as fileExplorer from './file-explorer/FileExplorer.stories'
import * as form from './form/DynamicForm.stories'
import * as layoutShowcase from './form/LayoutShowcase.stories'
import * as annotations from './graph/AnnotationBanner.stories'
import * as workflow from './graph/DependencyGraph.stories'
import * as editorDialogs from './graph/GraphEditorDialogs.stories'
import * as inputDialog from './graph/InputDialog.stories'
import * as inputsEditor from './graph/InputsEditor.stories'
import * as problemsButton from './graph/ProblemsButton.stories'
import * as runGraph from './graph/RunGraph.stories'
import * as runViews from './graph/runViews.stories'
import * as stepSummary from './graph/StepSummary.stories'
import * as settingsDialog from './graph/WorkflowSettingsDialog.stories'
import * as icons from './icons.stories'
import * as appShell from './list/appShell.stories'
import * as filterBar from './list/filterBar.stories'
import * as list from './list/ListTable.stories'
import * as listControls from './list/listControls.stories'
import * as listPage from './list/listPage.stories'
import * as stickyHeaders from './list/stickyHeaders.stories'
import * as userHoverCard from './list/UserHoverCard.stories'
import * as logviewer from './logviewer/LogViewer.stories'
import * as themeGenerator from './theme/theme.stories'

// jsdom lacks these; the DAG and explorer rely on them for layout plumbing.
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
  accessDrawer,
  breadcrumbs,
  callout,
  icons,
  sections,
  descriptionList,
  errorPage,
  tabs,
  loading,
  markdown,
  combobox,
  controls,
  copy,
  fields,
  menus,
  overlays,
  toasts,
  toggleGroup,
  pageHeader,
  logviewer,
  list,
  listControls,
  filterBar,
  listPage,
  stickyHeaders,
  appShell,
  userHoverCard,
  form,
  layoutShowcase,
  workflow,
  annotations,
  editorDialogs,
  inputDialog,
  inputsEditor,
  problemsButton,
  settingsDialog,
  runViews,
  runGraph,
  stepSummary,
  fileExplorer,
  themeEditor,
  themeGenerator,
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
