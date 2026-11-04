import { SingleYAMLDocument } from 'yaml-language-server/out/src/languageservice/parser/yaml-documents.js'

type Diagnostics = { code: unknown }[]

/**
 * Has the YAML service report each syntax error with the YAML parser's own code, such as
 * `DUPLICATE_KEY`, where it reports none, so the editor can word the error in the reader's
 * language. Runs in the service's worker, before it starts.
 */
export function keepSyntaxCodes(): void {
  for (const name of ['errors', 'warnings'] as const) {
    const own = Object.getOwnPropertyDescriptor(SingleYAMLDocument.prototype, name)?.get
    if (!own) {
      continue
    }
    Object.defineProperty(SingleYAMLDocument.prototype, name, {
      configurable: true,
      get(this: SingleYAMLDocument) {
        const diagnostics = own.call(this) as Diagnostics
        // The service makes one diagnostic from each of the parser's errors, in order.
        const parsed: { code?: unknown }[] | undefined = this.internalDocument?.[name]
        if (!Array.isArray(parsed) || parsed.length !== diagnostics.length) {
          return diagnostics
        }
        return diagnostics.map((diagnostic, i) => {
          const code = parsed[i]?.code
          return typeof code === 'string' ? { ...diagnostic, code } : diagnostic
        })
      },
    })
  }
}
