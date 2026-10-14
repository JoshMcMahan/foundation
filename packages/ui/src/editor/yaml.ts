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

/**
 * Adds JSON schemas that validate and complete YAML models whose URI matches. A schema with the
 * `uri` of one already added replaces it, so calling this again, as a reload or a second mount
 * does, adds nothing twice. Returns a function that removes these schemas.
 */
export function configureEditorYaml(added: SchemasSettings[]): () => void {
  const uris = new Set(added.map((schema) => schema.uri))
  schemas = [...schemas.filter((schema) => !uris.has(schema.uri)), ...added]
  apply?.(schemas)
  return () => {
    schemas = schemas.filter((schema) => !added.includes(schema))
    apply?.(schemas)
  }
}

/** Lets the loaded editor pick up schemas added before or after it loads. */
export function onYamlSchemas(listener: (schemas: SchemasSettings[]) => void): void {
  apply = listener
  listener(schemas)
}
