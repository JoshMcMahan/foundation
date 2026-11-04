import * as monaco from 'monaco-editor/editor/editor.api'
import type { CodedProblem } from '../components/Provider'

/** A marker to set, and the coded problem its message was worded from, when it has a code. */
export interface ProblemMarker {
  marker: monaco.editor.IMarkerData
  problem?: CodedProblem | undefined
}

// Monaco keeps only a marker's own fields, so each coded problem is kept here by its model, its
// owner, and where and how its marker reads.
const coded = new Map<string, Map<string, Map<string, CodedProblem>>>()

const keyOf = (marker: { startLineNumber: number; startColumn: number; message: string }) =>
  `${marker.startLineNumber}:${marker.startColumn}:${marker.message}`

/** Records which of `markers` came from coded problems, and sets them on the model when they changed. */
export function setProblemMarkers(
  model: monaco.editor.ITextModel,
  owner: string,
  markers: ProblemMarker[],
  same?: (
    current: monaco.editor.IMarker[],
    wanted: monaco.editor.IMarkerData[],
  ) => boolean | undefined,
): void {
  const uri = String(model.uri)
  const owners = coded.get(uri) ?? new Map<string, Map<string, CodedProblem>>()
  const problems = new Map<string, CodedProblem>()
  for (const { marker, problem } of markers) {
    if (problem?.code) {
      problems.set(keyOf(marker), problem)
    }
  }
  if (problems.size > 0) {
    owners.set(owner, problems)
    coded.set(uri, owners)
  } else {
    owners.delete(owner)
    if (owners.size === 0) {
      coded.delete(uri)
    }
  }
  const wanted = markers.map(({ marker }) => marker)
  if (!same?.(monaco.editor.getModelMarkers({ resource: model.uri, owner }), wanted)) {
    monaco.editor.setModelMarkers(model, owner, wanted)
  }
}

/** The coded problem a marker's message was worded from, when it had a code. */
export function markerProblem(marker: monaco.editor.IMarker): CodedProblem | undefined {
  return coded.get(String(marker.resource))?.get(marker.owner)?.get(keyOf(marker))
}
