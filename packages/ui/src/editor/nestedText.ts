/** An editor holding one job or step of a workflow, whose inputs live outside its text. */
export interface NestedWorkflowText {
  /** The workflow's inputs, so a new group is named clear of them. */
  inputs: () => Record<string, unknown>
  /** Adds the group of inputs a `with:` completion's expressions read. */
  addInputs: (name: string, definition: Record<string, unknown>) => void
}

const published = new Map<string, { current: NestedWorkflowText | undefined }>()

/** Lets completions reach the workflow around the editor of model `uri`; returns the undo. */
export function publishNestedText(
  uri: string,
  text: { current: NestedWorkflowText | undefined },
): () => void {
  published.set(uri, text)
  return () => {
    if (published.get(uri) === text) {
      published.delete(uri)
    }
  }
}

/** The workflow around the editor of model `uri`, or undefined when its text is a whole workflow. */
export function nestedWorkflowText(uri: string): NestedWorkflowText | undefined {
  return published.get(uri)?.current
}
