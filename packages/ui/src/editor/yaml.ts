/** A JSON schema for the YAML models whose URI matches one of `fileMatch`. */
export interface SchemasSettings {
  /** Identifies the schema; fetched from here when `schema` is not given. */
  uri: string
  /** Globs matched against model URIs, such as `**\/workflow.yaml`. */
  fileMatch?: string[]
  /** The schema itself, used instead of fetching `uri`. */
  schema?: object
}

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
