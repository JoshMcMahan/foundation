import { createRequire } from 'node:module'
import { getLanguageService } from 'yaml-language-server'
import { YAML_PROBLEM_CODES, yamlProblem, yamlProblemBundle } from './yamlProblems'
import { keepSyntaxCodes } from './yamlSyntaxCodes'

// The server's own translation module and text documents, as its worker loads them.
const server = createRequire(require.resolve('yaml-language-server/package.json'))
const l10n = server('@vscode/l10n') as { config: (config: { contents: object }) => void }
const { TextDocument } = server('vscode-languageserver-textdocument') as {
  TextDocument: {
    create: (uri: string, language: string, version: number, text: string) => unknown
  }
}

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    name: { type: 'string', minLength: 3 },
    mode: { enum: ['fast', 'safe'] },
    retries: { type: 'integer', maximum: 5 },
    tag: { type: 'string', pattern: '^v[0-9]+$' },
    steps: {
      type: 'array',
      items: { type: 'object', required: ['run'], properties: { run: { type: 'string' } } },
    },
  },
}

let version = 0
async function problems(text: string) {
  const service = getLanguageService({
    schemaRequestService: () => Promise.resolve('{}'),
    workspaceContext: { resolveRelativePath: (relative: string) => relative },
  } as unknown as Parameters<typeof getLanguageService>[0])
  service.configure({
    validate: true,
    schemas: [{ uri: 'file:///schema.json', fileMatch: ['*.yaml'], schema: SCHEMA }],
  })
  const document = TextDocument.create('file:///test.yaml', 'yaml', ++version, text)
  const diagnostics = await service.doValidation(
    document as Parameters<typeof service.doValidation>[0],
    false,
  )
  return diagnostics.map((diagnostic) =>
    yamlProblem({ ...diagnostic, message: String(diagnostic.message) }),
  )
}

describe('yamlProblem', () => {
  afterEach(() => l10n.config({ contents: {} }))

  it('gives each schema problem its code and params, and the English the service would have written', async () => {
    const english = await problems(
      'name: ab\nmode: slow\nretries: many\ntag: latest\ncolor: red\nsteps:\n  - name: x\n',
    )
    l10n.config({ contents: yamlProblemBundle() })
    const coded = await problems(
      'name: ab\nmode: slow\nretries: many\ntag: latest\ncolor: red\nsteps:\n  - name: x\n',
    )
    expect(coded.map(({ message }) => message)).toEqual(english.map(({ message }) => message))
    expect(coded).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'yaml_min_length', params: { min: 3 } }),
        expect.objectContaining({ code: 'yaml_enum', params: { values: '"fast", "safe"' } }),
        expect.objectContaining({ code: 'yaml_wrong_type', params: { type: 'integer' } }),
        expect.objectContaining({ code: 'yaml_pattern', params: { pattern: '^v[0-9]+$' } }),
        expect.objectContaining({
          code: 'yaml_property_not_allowed',
          params: { property: 'color' },
        }),
        expect.objectContaining({ code: 'yaml_missing_property', params: { property: 'run' } }),
      ]),
    )
  })

  it('gives a syntax error the parser always words one way its code', async () => {
    keepSyntaxCodes()
    const [duplicate] = await problems('name: one\nname: two\n')
    expect(duplicate).toEqual({
      code: 'yaml_duplicate_key',
      params: {},
      message: 'Map keys must be unique',
    })
  })

  it('leaves a syntax error the parser words several ways with its own text', async () => {
    keepSyntaxCodes()
    const [unclosed] = await problems('name: "one\n')
    expect(unclosed?.code).toBeUndefined()
    expect(unclosed?.message).toMatch(/quote/)
  })

  it('keeps the text of a problem it has no code for', () => {
    expect(
      yamlProblem({ message: 'When slider is enabled, min, max, and step are all required' }),
    ).toEqual({ message: 'When slider is enabled, min, max, and step are all required' })
  })

  it('lists every code with the params its message reads', () => {
    expect(YAML_PROBLEM_CODES['yaml_missing_property']).toEqual(['property'])
    expect(YAML_PROBLEM_CODES['yaml_dependent_required']).toEqual(['property', 'requiredBy'])
    expect(YAML_PROBLEM_CODES['yaml_duplicate_key']).toEqual([])
  })
})
