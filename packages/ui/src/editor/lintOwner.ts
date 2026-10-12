// Lint markers carry their own owner, so they can be told apart from the schema's.
export const LINT_OWNER = 'workflowlint'
// The problems a host marks through the editor's `markers`, apart from the lint's and the schema's.
export const HOST_MARKER_OWNER = 'workflowmarkers'
