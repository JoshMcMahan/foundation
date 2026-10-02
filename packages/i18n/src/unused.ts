import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { type ParserPlugin, parse } from '@babel/parser'
import { flatten, readLocale } from './catalogs.js'

/**
 * Where messages are referenced. A key is used when it is in usedKeys, under a
 * usedPrefixes subtree, written out in full as a string literal, or matched by
 * an unscoped key from a translator whose namespace can't be resolved.
 */
export interface Usage {
  usedKeys: Set<string>
  usedPrefixes: Set<string>
  literals: Set<string>
  unscopedKeys: Set<string>
  unscopedPrefixes: Set<string>
}

const FIELDS = ['usedKeys', 'usedPrefixes', 'literals', 'unscopedKeys', 'unscopedPrefixes'] as const

export function emptyUsage(): Usage {
  return {
    usedKeys: new Set(),
    usedPrefixes: new Set(),
    literals: new Set(),
    unscopedKeys: new Set(),
    unscopedPrefixes: new Set(),
  }
}

const FACTORIES = new Set(['useTranslations', 'getTranslations'])
// Members of a translator that take a key: t.rich('key'), t.raw('key').
const METHODS = new Set(['rich', 'markup', 'raw', 'has'])
const MESSAGES_HOOK = 'useMessages'
// A translator passed to a helper untyped (`t`, `tNav`) has no namespace here.
const TRANSLATOR_NAME = /^t([A-Z]|$)/
const SKIP_DIRS = new Set(['node_modules', 'dist', 'coverage'])
const SOURCE = /\.(?:[cm]?tsx?|[cm]?jsx?)$/

type Node = { type: string; [key: string]: unknown }

function isNode(value: unknown): value is Node {
  return (
    typeof value === 'object' && value !== null && 'type' in value && typeof value.type === 'string'
  )
}

function child(node: Node, key: string): Node | undefined {
  const value = node[key]
  return isNode(value) ? value : undefined
}

function children(node: Node, key: string): Node[] {
  const value = node[key]
  return Array.isArray(value) ? value.filter(isNode) : []
}

function name(node: Node | undefined): string | undefined {
  return node?.type === 'Identifier' && typeof node['name'] === 'string' ? node['name'] : undefined
}

/** A plain string: 'x', "x" or `x` with no substitutions. */
function text(node: Node | undefined): string | undefined {
  if (node?.type === 'StringLiteral' && typeof node['value'] === 'string') return node['value']
  if (node?.type === 'TemplateLiteral' && children(node, 'expressions').length === 0)
    return templateHead(node)
  return undefined
}

function templateHead(node: Node): string {
  const value = children(node, 'quasis')[0]?.['value']
  return typeof value === 'object' &&
    value !== null &&
    'cooked' in value &&
    typeof value.cooked === 'string'
    ? value.cooked
    : ''
}

const isCall = (node: Node | undefined): node is Node =>
  node?.type === 'CallExpression' || node?.type === 'OptionalCallExpression'
const isMember = (node: Node | undefined): node is Node =>
  (node?.type === 'MemberExpression' || node?.type === 'OptionalMemberExpression') &&
  node['computed'] !== true

function unwrapAwait(node: Node | undefined): Node | undefined {
  return node?.type === 'AwaitExpression' ? child(node, 'argument') : node
}

function* walk(node: Node): Generator<Node> {
  yield node
  for (const [key, value] of Object.entries(node)) {
    if (key === 'loc' || key === 'extra' || key.endsWith('Comments')) continue
    if (Array.isArray(value)) {
      for (const item of value) if (isNode(item)) yield* walk(item)
    } else if (isNode(value)) {
      yield* walk(value)
    }
  }
}

const join = (namespace: string, relative: string) =>
  !namespace ? relative : !relative ? namespace : `${namespace}.${relative}`

/** What one source file references. */
export function collectUsage(source: string, fileName: string): Usage {
  const plugins: ParserPlugin[] = /\.[cm]?ts$/.test(fileName)
    ? ['typescript']
    : ['typescript', 'jsx']
  const ast: unknown = parse(source, { sourceType: 'module', plugins, errorRecovery: true })
  if (!isNode(ast)) return emptyUsage()
  const nodes = [...walk(ast)]

  // Translator name -> namespaces it may carry; '' is the root scope, null a
  // dynamic one. A name bound differently in different functions gets both.
  const bindings = new Map<string, Set<string | null>>()
  const bind = (id: string, namespace: string | null) => {
    const set = bindings.get(id) ?? new Set()
    set.add(namespace)
    bindings.set(id, set)
  }
  const messagesNames = new Set<string>()

  const isFactory = (node: Node | undefined): node is Node =>
    isCall(node) && FACTORIES.has(name(child(node, 'callee')) ?? '')
  const isMessages = (node: Node | undefined): node is Node =>
    isCall(node) && name(child(node, 'callee')) === MESSAGES_HOOK
  const factoryNamespace = (call: Node): string | null => {
    const arg = children(call, 'arguments')[0]
    return arg ? (text(arg) ?? null) : ''
  }
  // The namespace of `t: TFunction<'ns'>`; TFunction alone is the root scope.
  const annotatedNamespace = (id: Node): string | null | undefined => {
    const annotation = child(id, 'typeAnnotation')
    const ref = annotation && child(annotation, 'typeAnnotation')
    if (ref?.type !== 'TSTypeReference' || name(child(ref, 'typeName')) !== 'TFunction')
      return undefined
    const args = child(ref, 'typeParameters') ?? child(ref, 'typeArguments')
    const first = args ? children(args, 'params')[0] : undefined
    if (!first) return ''
    return first.type === 'TSLiteralType' ? (text(child(first, 'literal')) ?? null) : null
  }

  for (const node of nodes) {
    if (node.type === 'VariableDeclarator') {
      const id = name(child(node, 'id'))
      const init = unwrapAwait(child(node, 'init'))
      if (id && isFactory(init)) bind(id, factoryNamespace(init))
      if (id && isMessages(init)) messagesNames.add(id)
    }
    if (node.type === 'Identifier' && typeof node['name'] === 'string') {
      const namespace = annotatedNamespace(node)
      if (namespace !== undefined) bind(node['name'], namespace)
    }
  }

  const usage = emptyUsage()
  // An empty prefix would cover every key, so it is never recorded.
  const addPrefix = (prefix: string) => {
    if (prefix) usage.usedPrefixes.add(prefix)
  }

  const record = (namespace: string | null, arg: Node | undefined, subtree: boolean) => {
    const ns = namespace ?? ''
    if (!arg) return
    const literal = text(arg)
    if (literal !== undefined) {
      const key = join(ns, literal)
      usage.usedKeys.add(key)
      if (subtree) addPrefix(key)
    } else if (arg.type === 'TemplateLiteral') {
      const head = templateHead(arg)
      addPrefix(join(ns, head.slice(0, Math.max(head.lastIndexOf('.'), 0))))
    } else {
      addPrefix(ns)
    }
  }

  const recordUnscoped = (arg: Node | undefined) => {
    const literal = text(arg)
    if (literal !== undefined) usage.unscopedKeys.add(literal)
    else if (arg?.type === 'TemplateLiteral') {
      const head = templateHead(arg)
      const dot = head.lastIndexOf('.')
      if (dot > 0) usage.unscopedPrefixes.add(head.slice(0, dot))
    }
  }

  const resolve = (
    callee: Node | undefined,
  ): { namespaces: Set<string | null>; method?: string } | undefined => {
    const id = name(callee)
    if (id && bindings.has(id)) return { namespaces: bindings.get(id) ?? new Set() }
    if (isFactory(callee)) return { namespaces: new Set([factoryNamespace(callee)]) }
    if (isMember(callee)) {
      const method = name(child(callee, 'property'))
      if (!method || !METHODS.has(method)) return undefined
      const object = child(callee, 'object')
      const objectId = name(object)
      if (objectId && bindings.has(objectId))
        return { namespaces: bindings.get(objectId) ?? new Set(), method }
      if (isFactory(object)) return { namespaces: new Set([factoryNamespace(object)]), method }
    }
    return undefined
  }

  const unscopedTranslator = (callee: Node | undefined): boolean => {
    const id = name(callee)
    if (id) return TRANSLATOR_NAME.test(id)
    return (
      isMember(callee) &&
      TRANSLATOR_NAME.test(name(child(callee, 'object')) ?? '') &&
      METHODS.has(name(child(callee, 'property')) ?? '')
    )
  }

  for (const node of nodes) {
    const literal = node.type === 'StringLiteral' ? text(node) : undefined
    if (literal !== undefined) usage.literals.add(literal)

    // const { clusterForm } = useMessages()
    if (node.type === 'VariableDeclarator' && isMessages(child(node, 'init'))) {
      const pattern = child(node, 'id')
      if (pattern?.type === 'ObjectPattern') {
        for (const property of children(pattern, 'properties')) {
          const key = name(child(property, 'key'))
          if (key) addPrefix(key)
        }
      }
    }
    // useMessages().clusterForm, messages.clusterForm
    if (isMember(node)) {
      const object = child(node, 'object')
      if (isMessages(object) || messagesNames.has(name(object) ?? ''))
        addPrefix(name(child(node, 'property')) ?? '')
    }
    if (isCall(node)) {
      const callee = child(node, 'callee')
      const arg = children(node, 'arguments')[0]
      const resolved = resolve(callee)
      if (resolved) {
        for (const namespace of resolved.namespaces)
          record(namespace, arg, resolved.method === 'raw')
      } else if (unscopedTranslator(callee)) {
        recordUnscoped(arg)
      }
    }
  }
  return usage
}

const covered = (key: string, prefixes: Iterable<string>) => {
  for (const p of prefixes) if (key === p || key.startsWith(`${p}.`)) return true
  return false
}

// An unscoped key matches any dotted suffix of a message key, since where its
// namespace ends is unknown: 'browserDefault' covers 'languageSettings.browserDefault'.
function coveredUnscoped(key: string, usage: Usage): boolean {
  const parts = key.split('.')
  for (let i = 0; i < parts.length; i++) {
    const suffix = parts.slice(i).join('.')
    if (usage.unscopedKeys.has(suffix) || covered(suffix, usage.unscopedPrefixes)) return true
  }
  return false
}

/**
 * The keys nothing references. It would rather miss an unused key than report
 * a used one, since a false report invites deleting a message that ships.
 */
export function findUnused(
  keys: Iterable<string>,
  usage: Usage,
  keep: readonly string[] = [],
): string[] {
  const unusedKeys: string[] = []
  for (const key of keys) {
    if (usage.usedKeys.has(key) || covered(key, keep) || covered(key, usage.usedPrefixes)) continue
    if (usage.literals.has(key) || coveredUnscoped(key, usage)) continue
    unusedKeys.push(key)
  }
  return unusedKeys.sort()
}

function sourceFiles(dir: string, skip: string, out: string[]): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name) && !entry.name.startsWith('.') && full !== skip)
        sourceFiles(full, skip, out)
    } else if (entry.isFile() && SOURCE.test(entry.name) && !/\.d\.[cm]?ts$/.test(entry.name)) {
      out.push(full)
    }
  }
  return out
}

export interface UnusedOptions {
  /** The locales directory. */
  dir: string
  defaultLocale: string
  /** Source directories to scan. */
  src: readonly string[]
  /** Namespaces read by key outside the source, such as error codes from a server. */
  keep?: readonly string[]
}

/** The default locale's keys that no source file references. */
export function unused({ dir, defaultLocale, src, keep = [] }: UnusedOptions): string[] {
  const usage = emptyUsage()
  const locales = path.resolve(dir)
  for (const root of src) {
    for (const file of sourceFiles(path.resolve(root), locales, [])) {
      let found: Usage
      try {
        found = collectUsage(readFileSync(file, 'utf8'), file)
      } catch (error) {
        throw new Error(`${file}: ${error instanceof Error ? error.message : String(error)}`)
      }
      for (const field of FIELDS) {
        for (const value of found[field]) usage[field].add(value)
      }
    }
  }
  return findUnused(flatten(readLocale(dir, defaultLocale)).keys(), usage, keep)
}
