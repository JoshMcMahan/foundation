import * as monaco from 'monaco-editor/editor/editor.api'
import type { CodedProblem } from '../components/Provider'
import { setProblemMarkers } from './problemMarkers'
import { createYamlWorker } from './workers'
import { onYamlSchemas, type SchemasSettings } from './yaml'
import { yamlProblem, yamlProblemBundle } from './yamlProblems'

// The subset of the Language Server Protocol this client speaks. Declared here
// rather than imported so the emitted .d.ts files need no protocol package.
interface Position {
  line: number
  character: number
}
interface Range {
  start: Position
  end: Position
}
interface TextEdit {
  range: Range
  newText: string
}
interface InsertReplaceEdit {
  newText: string
  insert: Range
  replace: Range
}
interface MarkupContent {
  kind: 'markdown' | 'plaintext'
  value: string
}
type MarkedString = string | { language: string; value: string }
interface Diagnostic {
  range: Range
  severity?: 1 | 2 | 3 | 4
  code?: number | string
  source?: string
  message: string
}
interface CompletionItem {
  label: string
  kind?: number
  detail?: string
  documentation?: string | MarkupContent
  sortText?: string
  filterText?: string
  insertText?: string
  insertTextFormat?: 1 | 2
  textEdit?: TextEdit | InsertReplaceEdit
  additionalTextEdits?: TextEdit[]
  commitCharacters?: string[]
  command?: { title: string; command: string; arguments?: unknown[] }
}
interface CompletionList {
  isIncomplete: boolean
  items: CompletionItem[]
}
interface Hover {
  contents: MarkupContent | MarkedString | MarkedString[]
  range?: Range
}
interface Message {
  jsonrpc: '2.0'
  id?: number | string | null
  method?: string
  params?: unknown
  result?: unknown
  error?: { code: number; message: string }
}

const LANGUAGE_ID = 'yaml'
const MARKER_OWNER = 'yaml'

// The server reads these when it starts and whenever the configuration changes.
// The schema store is off: it would fetch a public catalog and match unrelated
// schemas against our models by file name.
const YAML_SETTINGS = {
  validate: true,
  hover: true,
  completion: true,
  format: { enable: true },
  schemaStore: { enable: false },
}

/** JSON-RPC over postMessage, the transport the server's web worker build expects. */
class WorkerConnection {
  private nextId = 0
  private readonly pending = new Map<
    number,
    { resolve: (result: unknown) => void; reject: (error: Error) => void }
  >()
  private readonly notificationHandlers = new Map<string, (params: unknown) => void>()

  private readonly worker: Worker
  private readonly onRequest: (method: string, params: unknown) => unknown

  constructor(worker: Worker, onRequest: (method: string, params: unknown) => unknown) {
    this.worker = worker
    this.onRequest = onRequest
    worker.addEventListener('message', (event: MessageEvent<Message>) => this.receive(event.data))
  }

  request<T>(method: string, params: unknown, token?: monaco.CancellationToken): Promise<T> {
    const id = this.nextId++
    const result = new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (result: unknown) => void, reject })
    })
    this.send({ jsonrpc: '2.0', id, method, params })
    token?.onCancellationRequested(() => this.notify('$/cancelRequest', { id }))
    return result
  }

  notify(method: string, params: unknown): void {
    this.send({ jsonrpc: '2.0', method, params })
  }

  onNotification(method: string, handler: (params: unknown) => void): void {
    this.notificationHandlers.set(method, handler)
  }

  private send(message: Message): void {
    this.worker.postMessage(message)
  }

  private receive(message: Message): void {
    if (message.method === undefined) {
      const waiter = typeof message.id === 'number' ? this.pending.get(message.id) : undefined
      if (!waiter || typeof message.id !== 'number') {
        return
      }
      this.pending.delete(message.id)
      if (message.error) {
        waiter.reject(new Error(message.error.message))
      } else {
        waiter.resolve(message.result)
      }
      return
    }
    if (message.id === undefined) {
      this.notificationHandlers.get(message.method)?.(message.params)
      return
    }
    // The server only waits on what we answer; requests we don't handle get
    // null, which every optional client feature accepts.
    Promise.resolve()
      .then(() => this.onRequest(message.method ?? '', message.params))
      .then(
        (result) => this.send({ jsonrpc: '2.0', id: message.id ?? null, result: result ?? null }),
        (error: unknown) =>
          this.send({
            jsonrpc: '2.0',
            id: message.id ?? null,
            error: { code: -32603, message: String(error) },
          }),
      )
  }
}

function toRange(range: Range): monaco.IRange {
  return {
    startLineNumber: range.start.line + 1,
    startColumn: range.start.character + 1,
    endLineNumber: range.end.line + 1,
    endColumn: range.end.character + 1,
  }
}

function toPosition(position: monaco.Position): Position {
  return { line: position.lineNumber - 1, character: position.column - 1 }
}

function toMarkdown(content: MarkupContent | MarkedString): monaco.IMarkdownString {
  if (typeof content === 'string') {
    return { value: content }
  }
  if ('kind' in content) {
    return { value: content.value }
  }
  return { value: `\`\`\`${content.language}\n${content.value}\n\`\`\`` }
}

const SEVERITY: Record<number, monaco.MarkerSeverity> = {
  1: monaco.MarkerSeverity.Error,
  2: monaco.MarkerSeverity.Warning,
  3: monaco.MarkerSeverity.Info,
  4: monaco.MarkerSeverity.Hint,
}

function toMarker(diagnostic: Diagnostic, message: string): monaco.editor.IMarkerData {
  // A syntax error's parser code only names its message; Monaco shows the code it had before.
  const code = typeof diagnostic.code === 'string' ? 0 : diagnostic.code
  return {
    ...toRange(diagnostic.range),
    severity: SEVERITY[diagnostic.severity ?? 1] ?? monaco.MarkerSeverity.Error,
    message,
    ...(code === undefined ? {} : { code: String(code) }),
    ...(diagnostic.source === undefined ? {} : { source: diagnostic.source }),
  }
}

let problemText: (problem: CodedProblem) => string = (problem) => problem.message
let republish: (() => void) | undefined

/**
 * Words the YAML service's problems in the reader's language from now on, those already marked
 * included. The editor passes `useProblemText`'s; every editor on a page shares one language.
 */
export function setYamlProblemText(text: (problem: CodedProblem) => string): void {
  if (text !== problemText) {
    problemText = text
    republish?.()
  }
}

// LSP numbers completion kinds from 1 and orders them differently from Monaco.
const KIND = monaco.languages.CompletionItemKind
const COMPLETION_KIND: Record<number, monaco.languages.CompletionItemKind> = {
  1: KIND.Text,
  2: KIND.Method,
  3: KIND.Function,
  4: KIND.Constructor,
  5: KIND.Field,
  6: KIND.Variable,
  7: KIND.Class,
  8: KIND.Interface,
  9: KIND.Module,
  10: KIND.Property,
  11: KIND.Unit,
  12: KIND.Value,
  13: KIND.Enum,
  14: KIND.Keyword,
  15: KIND.Snippet,
  16: KIND.Color,
  17: KIND.File,
  18: KIND.Reference,
  19: KIND.Folder,
  20: KIND.EnumMember,
  21: KIND.Constant,
  22: KIND.Struct,
  23: KIND.Event,
  24: KIND.Operator,
  25: KIND.TypeParameter,
}

function toCompletion(
  item: CompletionItem,
  defaultRange: monaco.IRange,
): monaco.languages.CompletionItem {
  const edit = item.textEdit
  let range: monaco.languages.CompletionItem['range'] = defaultRange
  if (edit && 'range' in edit) {
    range = toRange(edit.range)
  } else if (edit) {
    range = { insert: toRange(edit.insert), replace: toRange(edit.replace) }
  }
  return {
    label: item.label,
    kind: COMPLETION_KIND[item.kind ?? 1] ?? KIND.Text,
    insertText: edit?.newText ?? item.insertText ?? item.label,
    range,
    ...(item.insertTextFormat === 2
      ? { insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet }
      : {}),
    ...(item.detail === undefined ? {} : { detail: item.detail }),
    ...(item.documentation === undefined ? {} : { documentation: toMarkdown(item.documentation) }),
    ...(item.sortText === undefined ? {} : { sortText: item.sortText }),
    ...(item.filterText === undefined ? {} : { filterText: item.filterText }),
    ...(item.commitCharacters === undefined ? {} : { commitCharacters: item.commitCharacters }),
    ...(item.additionalTextEdits === undefined
      ? {}
      : {
          additionalTextEdits: item.additionalTextEdits.map((e) => ({
            range: toRange(e.range),
            text: e.newText,
          })),
        }),
    ...(item.command === undefined
      ? {}
      : {
          command: {
            id: item.command.command,
            title: item.command.title,
            ...(item.command.arguments === undefined ? {} : { arguments: item.command.arguments }),
          },
        }),
  }
}

function toEdits(edits: TextEdit[] | null): monaco.languages.TextEdit[] {
  return (edits ?? []).map((edit) => ({ range: toRange(edit.range), text: edit.newText }))
}

function answerServer(method: string, params: unknown): unknown {
  if (method === 'workspace/configuration') {
    const { items } = params as { items: { section?: string }[] }
    return items.map((item) => (item.section === 'yaml' ? YAML_SETTINGS : null))
  }
  return null
}

function startYamlLanguage(): void {
  let server: { connection: WorkerConnection; ready: Promise<void> } | undefined
  let schemas: SchemasSettings[] = []

  // Keyed by the URI string sent to the server, which is how it names models back.
  const open = new Map<string, monaco.editor.ITextModel>()
  // The last problems the server found in each model, marked again when the language changes.
  const published = new Map<string, Diagnostic[]>()

  function mark(uri: string): void {
    const model = open.get(uri)
    if (!model || model.isDisposed()) {
      return
    }
    setProblemMarkers(
      model,
      MARKER_OWNER,
      (published.get(uri) ?? []).map((diagnostic) => {
        const problem = yamlProblem(diagnostic)
        return { marker: toMarker(diagnostic, problemText(problem)), problem }
      }),
    )
  }
  republish = () => {
    for (const uri of published.keys()) {
      mark(uri)
    }
  }

  // The server is a megabyte of worker, so it starts with the first YAML model rather than
  // with the first editor, which may well be showing a shell script.
  function connect() {
    if (server) {
      return server
    }
    const worker = createYamlWorker()
    // The first message starts the server. Its translation bundle has the server word each schema
    // problem as a code and its params, which the editor words in the reader's language.
    worker.postMessage({ l10nBundle: yamlProblemBundle() })
    const connection = new WorkerConnection(worker, answerServer)
    connection.onNotification('textDocument/publishDiagnostics', (params) => {
      const { uri, diagnostics } = params as { uri: string; diagnostics: Diagnostic[] }
      published.set(uri, diagnostics)
      mark(uri)
    })
    const ready = connection
      .request('initialize', {
        processId: null,
        rootUri: null,
        capabilities: {
          workspace: { configuration: true },
          textDocument: {
            synchronization: {},
            completion: {
              completionItem: {
                snippetSupport: true,
                insertReplaceSupport: true,
                documentationFormat: ['markdown', 'plaintext'],
              },
            },
            hover: { contentFormat: ['markdown', 'plaintext'] },
            publishDiagnostics: {},
          },
        },
      })
      .then(() => {
        connection.notify('initialized', {})
        connection.notify('workspace/didChangeConfiguration', { settings: null })
        sendSchemas()
      })
    server = { connection, ready }
    return server
  }

  // Only once the server is up: what it is sent before `initialize` returns, it drops.
  function notify(method: string, params: unknown): void {
    const { connection, ready } = connect()
    void ready.then(() => connection.notify(method, params))
  }

  function sendSchemas(): void {
    // JSON-RPC reads an array as positional arguments, so the list is the one argument.
    server?.connection.notify('json/schemaAssociations', [schemas])
  }

  onYamlSchemas((added: SchemasSettings[]) => {
    schemas = added
    void server?.ready.then(sendSchemas)
  })

  function close(uri: string, model: monaco.editor.ITextModel): void {
    open.delete(uri)
    published.delete(uri)
    notify('textDocument/didClose', { textDocument: { uri } })
    if (!model.isDisposed()) {
      setProblemMarkers(model, MARKER_OWNER, [])
    }
  }

  function track(model: monaco.editor.ITextModel): void {
    const uri = model.uri.toString()
    const sync = () => {
      const isYaml = model.getLanguageId() === LANGUAGE_ID
      if (isYaml && !open.has(uri)) {
        open.set(uri, model)
        const textDocument = {
          uri,
          languageId: LANGUAGE_ID,
          version: model.getVersionId(),
          text: model.getValue(),
        }
        notify('textDocument/didOpen', { textDocument })
      } else if (!isYaml && open.has(uri)) {
        close(uri, model)
      }
    }
    model.onDidChangeLanguage(sync)
    model.onDidChangeContent(() => {
      if (!open.has(uri)) {
        return
      }
      // Whole-text changes keep the client simple; YAML documents are small.
      const params = {
        textDocument: { uri, version: model.getVersionId() },
        contentChanges: [{ text: model.getValue() }],
      }
      notify('textDocument/didChange', params)
    })
    model.onWillDispose(() => {
      if (open.get(uri) === model) {
        close(uri, model)
      }
    })
    sync()
  }

  for (const model of monaco.editor.getModels()) {
    track(model)
  }
  monaco.editor.onDidCreateModel(track)

  async function request<T>(
    method: string,
    model: monaco.editor.ITextModel,
    params: object,
    token: monaco.CancellationToken,
  ): Promise<T> {
    const { connection, ready } = connect()
    await ready
    return connection.request<T>(
      method,
      { textDocument: { uri: model.uri.toString() }, ...params },
      token,
    )
  }

  monaco.languages.registerCompletionItemProvider(LANGUAGE_ID, {
    triggerCharacters: [' ', ':'],
    async provideCompletionItems(model, position, _context, token) {
      const result = await request<CompletionList | CompletionItem[] | null>(
        'textDocument/completion',
        model,
        { position: toPosition(position) },
        token,
      )
      const word = model.getWordUntilPosition(position)
      const defaultRange = {
        startLineNumber: position.lineNumber,
        startColumn: word.startColumn,
        endLineNumber: position.lineNumber,
        endColumn: word.endColumn,
      }
      const items = Array.isArray(result) ? result : (result?.items ?? [])
      return {
        incomplete: !Array.isArray(result) && Boolean(result?.isIncomplete),
        suggestions: items.map((item) => toCompletion(item, defaultRange)),
      }
    },
  })

  monaco.languages.registerHoverProvider(LANGUAGE_ID, {
    async provideHover(model, position, token) {
      const hover = await request<Hover | null>(
        'textDocument/hover',
        model,
        { position: toPosition(position) },
        token,
      )
      if (!hover) {
        return null
      }
      const contents = Array.isArray(hover.contents) ? hover.contents : [hover.contents]
      return {
        contents: contents.map(toMarkdown),
        ...(hover.range === undefined ? {} : { range: toRange(hover.range) }),
      }
    },
  })

  monaco.languages.registerDocumentFormattingEditProvider(LANGUAGE_ID, {
    async provideDocumentFormattingEdits(model, options, token) {
      const edits = await request<TextEdit[] | null>(
        'textDocument/formatting',
        model,
        { options: { tabSize: options.tabSize, insertSpaces: options.insertSpaces } },
        token,
      )
      return toEdits(edits)
    },
  })
}

let started = false

/**
 * Starts the YAML language server and connects every yaml model to it. Runs
 * once per page and is never torn down: a per-editor lifecycle let navigation
 * stop the service, killing suggestions until reload.
 */
export function ensureYamlLanguage(): void {
  if (started) {
    return
  }
  started = true
  startYamlLanguage()
}
