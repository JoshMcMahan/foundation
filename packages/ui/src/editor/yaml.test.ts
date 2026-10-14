import { configureEditorYaml, onYamlSchemas, type SchemasSettings } from './yaml'

test('a schema added again under its uri replaces the first, and removing it drops it', () => {
  let seen: SchemasSettings[] = []
  onYamlSchemas((schemas) => {
    seen = schemas
  })
  const first = configureEditorYaml([{ uri: 'https://example.com/a.json', fileMatch: ['a.yaml'] }])
  const again = configureEditorYaml([{ uri: 'https://example.com/a.json', fileMatch: ['b.yaml'] }])
  expect(seen).toEqual([{ uri: 'https://example.com/a.json', fileMatch: ['b.yaml'] }])

  // Removing the replaced one leaves the one that replaced it.
  first()
  expect(seen).toHaveLength(1)
  again()
  expect(seen).toEqual([])
})
