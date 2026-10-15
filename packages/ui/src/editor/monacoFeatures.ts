/// <reference path="./monacoShell.d.ts" />
// `monaco-editor`'s main entry adds the TypeScript, CSS and HTML language services to its
// languages, with workers of megabytes in every host's build, and asks this package's workers for
// services they can't run. The editor imports Monaco's API alone and this beside it: the editor's
// features, and the coloring of every language, each tokenizer a chunk fetched only when a model
// shows its language, so a file of any kind reads colored. A host adds a service with
// `addEditorLanguages`.
import 'monaco-editor/features/register.all'
// What the main entry has beyond the features entry, so the editor behaves as it did on it.
// monacoFeatures.test.ts fails when a Monaco upgrade changes that list.
import 'monaco-editor/editor/contrib/caretOperations/browser/caretOperations'
import 'monaco-editor/editor/contrib/dropOrPasteInto/browser/copyPasteContribution'
import 'monaco-editor/editor/contrib/gotoError/browser/markerSelectionStatus'
import 'monaco-editor/editor/contrib/semanticTokens/browser/documentSemanticTokens'
import 'monaco-editor/languages/definitions/register.all'
import 'monaco-editor/languages/features/json/register'
import { languages } from 'monaco-editor/editor/editor.api'

// Workflow fields suggest `bash`, which Monaco knows only as an alias of `shell`, and an
// editor opened on an unknown language shows plain text. It colors as shell does.
const shell = () => import('monaco-editor/languages/definitions/shell/shell')
languages.register({ id: 'bash', aliases: ['Bash', 'bash'] })
languages.registerTokensProviderFactory('bash', {
  create: async () => (await shell()).language,
})
languages.onLanguageEncountered('bash', async () => {
  languages.setLanguageConfiguration('bash', (await shell()).conf)
})
