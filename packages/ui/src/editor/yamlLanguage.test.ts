import type { SchemasSettings } from './yaml'

interface Message {
  jsonrpc?: '2.0'
  id?: number
  method?: string
  params?: unknown
  result?: unknown
}

// Stands in for the language server: records what the client posts and lets a
// test speak back as the server would.
class FakeWorker {
  readonly posted: Message[] = []
  private listener: ((event: { data: Message }) => void) | undefined

  addEventListener(_type: string, listener: (event: { data: Message }) => void) {
    this.listener = listener
  }
  postMessage(message: Message) {
    this.posted.push(message)
  }
  deliver(message: Message) {
    this.listener?.({ data: message })
  }
  sent(method: string): Message[] {
    return this.posted.filter((message) => message.method === method)
  }
}

interface FakeModel {
  uri: { toString: () => string }
  getLanguageId: () => string
  getVersionId: () => number
  getValue: () => string
  isDisposed: () => boolean
  onDidChangeLanguage: () => void
  onDidChangeContent: () => void
  onWillDispose: () => void
}

const worker = new FakeWorker()
const setModelMarkers = vi.fn()
const models: FakeModel[] = []

function model(uri: string, languageId: string, text: string): FakeModel {
  return {
    uri: { toString: () => uri },
    getLanguageId: () => languageId,
    getVersionId: () => 1,
    getValue: () => text,
    isDisposed: () => false,
    onDidChangeLanguage: () => {},
    onDidChangeContent: () => {},
    onWillDispose: () => {},
  }
}

vi.mock('./workers', () => ({ createYamlWorker: () => worker }))
vi.mock('monaco-editor', () => ({
  MarkerSeverity: { Error: 8, Warning: 4, Info: 2, Hint: 1 },
  languages: {
    CompletionItemKind: {},
    CompletionItemInsertTextRule: { InsertAsSnippet: 4 },
    registerCompletionItemProvider: () => {},
    registerHoverProvider: () => {},
    registerDocumentFormattingEditProvider: () => {},
  },
  editor: {
    getModels: () => models,
    onDidCreateModel: () => {},
    setModelMarkers: (...args: unknown[]) => setModelMarkers(...args),
  },
}))

const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

const SCHEMA: SchemasSettings = {
  uri: 'https://example.com/pipeline.schema.json',
  fileMatch: ['**/pipeline.yaml'],
  schema: { type: 'object' },
}

describe('ensureYamlLanguage', () => {
  beforeAll(async () => {
    models.push(
      model('file:///pipeline.yaml', 'yaml', 'jobs: {}\n'),
      model('file:///script.sh', 'shell', 'echo hi\n'),
    )
    const { configureEditorYaml } = await import('./yaml')
    configureEditorYaml([SCHEMA])
    const { ensureYamlLanguage } = await import('./yamlLanguage')
    ensureYamlLanguage()
    // A second call must not start a second server.
    ensureYamlLanguage()
    const [initialize] = worker.sent('initialize')
    worker.deliver({ jsonrpc: '2.0', id: initialize?.id ?? -1, result: { capabilities: {} } })
    await flush()
  })

  it('starts the server before speaking JSON-RPC to it', () => {
    expect(worker.posted[0]).toEqual({})
    expect(worker.posted[1]?.method).toBe('initialize')
    expect(worker.sent('initialize')).toHaveLength(1)
  })

  it('sends the schema list as a single argument', () => {
    // An unwrapped array is read as positional arguments, and the server then
    // takes the first schema's keys for schema URIs.
    expect(worker.sent('json/schemaAssociations')[0]?.params).toEqual([[SCHEMA]])
  })

  it('opens yaml models only', () => {
    const opened = worker.sent('textDocument/didOpen').map((message) => message.params)
    expect(opened).toEqual([
      {
        textDocument: {
          uri: 'file:///pipeline.yaml',
          languageId: 'yaml',
          version: 1,
          text: 'jobs: {}\n',
        },
      },
    ])
  })

  it('answers the configuration the server pulls', async () => {
    worker.deliver({
      jsonrpc: '2.0',
      id: 7,
      method: 'workspace/configuration',
      params: { items: [{ section: 'yaml' }, { section: 'http' }] },
    })
    await flush()
    const answer = worker.posted.find((message) => message.id === 7 && 'result' in message)
    expect(answer?.result).toEqual([
      expect.objectContaining({ validate: true, schemaStore: { enable: false } }),
      null,
    ])
  })

  it('turns diagnostics into markers on the model they name', () => {
    worker.deliver({
      jsonrpc: '2.0',
      method: 'textDocument/publishDiagnostics',
      params: {
        uri: 'file:///pipeline.yaml',
        diagnostics: [
          {
            range: { start: { line: 2, character: 4 }, end: { line: 2, character: 11 } },
            severity: 1,
            message: 'Property timeout is not allowed.',
          },
        ],
      },
    })
    expect(setModelMarkers).toHaveBeenCalledWith(models[0], 'yaml', [
      {
        startLineNumber: 3,
        startColumn: 5,
        endLineNumber: 3,
        endColumn: 12,
        severity: 8,
        message: 'Property timeout is not allowed.',
      },
    ])
  })
})
