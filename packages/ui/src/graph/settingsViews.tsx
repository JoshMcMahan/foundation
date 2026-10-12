import { lazy, Suspense } from 'react'
import Loader from '../components/Loader'
import { TOOLTIP_ID } from '../components/Tooltip'
import type { WorkflowEditing } from '../editing'
import type { EditorMarker } from '../editor/Monaco'
import type { NestedWorkflowText } from '../editor/nestedText'
import { ChoiceButtons, FieldError, type Strings } from './editorFields'
import { useGraphEditorStrings } from './editorStrings'
import { ProblemList, type ScopedProblem } from './fieldProblems'

const MonacoEditor = lazy(() => import('../editor/Monaco'))

/** Which view the job, step, input and settings dialogs open in. */
export type SettingsView = 'form' | 'yaml'

export function yamlProblem(
  yaml: string,
  t: Strings,
  editing: WorkflowEditing,
): string | undefined {
  const problem = editing.settingsYamlProblem(yaml)
  return !problem
    ? undefined
    : problem.kind === 'syntax'
      ? t.yamlSyntax(problem.message)
      : t.yamlNotMap
}

export function ViewSwitch({
  yaml,
  onForm,
  onYaml,
}: {
  yaml: boolean
  onForm: () => void
  onYaml: () => void
}) {
  const t = useGraphEditorStrings()
  return (
    <div data-tooltip-id={TOOLTIP_ID} data-tooltip-content={t.help.view}>
      <ChoiceButtons
        options={[
          { value: 'yaml', label: t.viewYaml },
          { value: 'form', label: t.viewForm },
        ]}
        value={yaml ? 'yaml' : 'form'}
        onChange={(view) => (view === 'yaml' ? onYaml() : onForm())}
      />
    </div>
  )
}

export interface ScopedProblems {
  markers: EditorMarker[]
  problems: ScopedProblem[]
}

export const NO_SCOPED: ScopedProblems = { markers: [], problems: [] }

export function YamlPane({
  path,
  value,
  onChange,
  problem,
  scoped,
  nested,
}: {
  path: string
  value: string
  onChange: (value: string) => void
  problem: string | undefined
  scoped: ScopedProblems
  nested?: NestedWorkflowText | undefined
}) {
  // Schema problems show as squiggles and, as in the workflow editor, don't block saving.
  return (
    <div className="flex flex-col gap-1.5">
      <div className="h-[50vh] overflow-hidden rounded-md border theme-border">
        <Suspense fallback={<Loader />}>
          <MonacoEditor
            path={path}
            language="yaml"
            value={value}
            height="100%"
            // A few lines of settings would otherwise scroll a whole pane past their end.
            scrollBeyondLastLine={false}
            onChange={onChange}
            markers={scoped.markers}
            {...(nested ? { nested } : {})}
          />
        </Suspense>
      </div>
      <FieldError message={problem} />
      <ProblemList problems={scoped.problems} />
    </div>
  )
}
