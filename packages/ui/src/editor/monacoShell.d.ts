// Monaco ships no types for a language's tokenizer module, only for its registration.
declare module 'monaco-editor/languages/definitions/shell/shell' {
  import type { languages } from 'monaco-editor/editor/editor.api'

  export const conf: languages.LanguageConfiguration
  export const language: languages.IMonarchLanguage
}
