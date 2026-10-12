import type { EditRefusalReason, WorkflowEditing } from '../editing'
import { GRAPH_EDITOR_STRINGS, type GraphEditorStrings } from './editorStrings'

/** A refusal in the host's words, or the engine's English when the host gives none. */
export function refusalText(
  t: GraphEditorStrings,
  editing: WorkflowEditing,
  reason: EditRefusalReason,
): string {
  return t.refusal === GRAPH_EDITOR_STRINGS.refusal
    ? editing.refusalMessage(reason)
    : t.refusal(reason)
}

/** What to tell the person when an edit throws: why it was refused, or the error itself. */
export function editErrorText(
  t: GraphEditorStrings,
  editing: WorkflowEditing,
  error: unknown,
): string {
  if (error instanceof editing.EditRefusal) {
    return refusalText(t, editing, error.reason)
  }
  return error instanceof Error ? error.message : String(error)
}
