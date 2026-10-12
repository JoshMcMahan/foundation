import type { GraphEdit, GraphEditResult } from '../editing'
import type { Box } from './editorPrimitives'
import type { ListedProblem } from './ProblemsButton'
import type { SettingsView } from './settingsViews'

export type { Box }

export interface EditorProblem {
  message: string
  line: number
  job?: string
  step?: number
  input?: string[]
  /** In a workflow-level setting the settings dialog edits. */
  setting?: boolean
}

/** What to show in the YAML beside the graph: a job, one of its steps, or a line. */
export type RevealTarget = { job: string; step?: number } | { line: number }

/** Build-page callbacks that turn the dependency graph into an editor. */
export interface DependencyGraphEditor {
  onEdit: (edit: GraphEdit) => GraphEditResult | undefined
  canUndo: boolean
  canRedo: boolean
  onUndo: () => void
  onRedo: () => void
  /** `uses` values offered in the step editor, such as the user's own workflows. */
  usesSuggestions?: string[]
  /** Opens the workflow-level settings: env, permissions, sessions and more. */
  onOpenSettings?: () => void
  /** The YAML the edits apply to, for editing a job or step as text. */
  readSource?: () => string
  /** The view the job, step and input dialogs open in; YAML when not given. */
  settingsView?: SettingsView
  onSettingsViewChange?: (view: SettingsView) => void
  /** False adds a new job, step or input with its defaults, without opening its dialog. */
  openOnAdd?: boolean
  onOpenOnAddChange?: (open: boolean) => void
  /** Problems in the workflow, marked on the jobs, steps and inputs they're in. */
  problems?: EditorProblem[]
  /** The problems this pane's toolbar counts and lists. */
  listedProblems?: ListedProblem[]
  /** Hands the page this pane's way to bring a problem into view, false where it can't; returns its undo. */
  registerShow?: (show: (problem: EditorProblem) => boolean) => () => void
  /** Shows a job's, step's or line's YAML, when the YAML editor is beside the graph. */
  onReveal?: (target: RevealTarget) => void
}

const TEXT_INPUT = 'input, textarea, select, [contenteditable="true"]'

export const typing = (target: EventTarget | null) =>
  target instanceof Element && !!target.closest(TEXT_INPUT)

export function overlaps(rect: DOMRect, box: Box): boolean {
  return (
    rect.left <= box.right &&
    rect.right >= box.left &&
    rect.top <= box.bottom &&
    rect.bottom >= box.top
  )
}
