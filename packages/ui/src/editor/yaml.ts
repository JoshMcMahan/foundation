import type { SchemasSettings } from 'monaco-yaml'

let schemas: SchemasSettings[] = []
let apply: ((schemas: SchemasSettings[]) => void) | undefined

/** Adds JSON schemas that validate and complete YAML models whose URI matches. */
export function configureEditorYaml(added: SchemasSettings[]): void {
  schemas = [...schemas, ...added]
  apply?.(schemas)
}

/** Lets the loaded editor pick up schemas added before or after it loads. */
export function onYamlSchemas(listener: (schemas: SchemasSettings[]) => void): void {
  apply = listener
  listener(schemas)
}
