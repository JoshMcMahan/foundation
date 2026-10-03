#!/usr/bin/env node
// Verifies the artifact a consumer actually receives.
//
// Unit tests run against src, so they cannot catch a broken exports map, a
// missing runtime dependency, or emitted specifiers Node can't resolve. This
// packs the package, runs arethetypeswrong over the tarball, then installs it
// into a throwaway fixture and both imports it under Node ESM and typechecks a
// consumer file under `moduleResolution: nodenext`.
//
// Packing MUST go through `pnpm pack`: the dist-facing `exports` map lives in
// `publishConfig`, and substituting those fields is a pnpm feature. `npm pack`
// leaves `exports` pointing at ./src/*.ts, which `files: ["dist"]` excludes —
// producing a tarball where every entrypoint fails to resolve.
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const pkgDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const run = (cmd, args, cwd) =>
  execFileSync(cmd, args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })

// attw cannot type-resolve stylesheet entrypoints; they are not modules.
const CSS_ENTRYPOINTS = [
  'styles.css',
  'theme.css',
  'base.css',
  'fonts.css',
  'logviewer.css',
  'ai.css',
]

const uiPkg = JSON.parse(readFileSync(path.join(pkgDir, 'package.json'), 'utf8'))
const MONACO_EDITOR_VERSION = uiPkg.peerDependencies['monaco-editor']

// npm force-includes README* and LICENSE* whatever `files` says, so a
// contributor-facing doc left in the package root reaches consumers.
const SHIPPED_PATHS = new Set(['dist', 'LICENSE', 'package.json', 'README.md'])

const fixture = mkdtempSync(path.join(tmpdir(), 'ui-pack-'))
let failed = false

try {
  console.log('• packing with pnpm (applies publishConfig)')
  run('pnpm', ['pack', '--pack-destination', fixture], pkgDir)
  const tarball = readdirSync(fixture).find((f) => f.endsWith('.tgz'))
  if (!tarball) {
    throw new Error('pnpm pack produced no tarball')
  }
  const tarballPath = path.join(fixture, tarball)

  console.log('• asserting the tarball ships only the allowlisted paths')
  const shipped = new Set(
    run('tar', ['-tzf', tarballPath], fixture)
      .split('\n')
      .map((entry) => entry.replace(/^package\//, '').split('/')[0])
      .filter(Boolean),
  )
  const unexpected = [...shipped].filter((entry) => !SHIPPED_PATHS.has(entry))
  if (unexpected.length) {
    throw new Error(`tarball ships unexpected paths: ${unexpected.sort().join(', ')}`)
  }

  console.log('• checking types resolution (arethetypeswrong)')
  console.log(
    // Resolved from PATH: package manager run-scripts put node_modules/.bin on it.
    run(
      'attw',
      [tarballPath, '--profile', 'esm-only', '--exclude-entrypoints', ...CSS_ENTRYPOINTS],
      pkgDir,
    )
      .trimEnd()
      .split('\n')
      .map((l) => `  ${l}`)
      .join('\n'),
  )

  writeFileSync(
    path.join(fixture, 'package.json'),
    JSON.stringify(
      {
        name: 'ui-pack-fixture',
        private: true,
        type: 'module',
        dependencies: {
          '@parallelworks/ui': `file:./${tarball}`,
          formik: '2.4.9',
          react: '19.2.8',
          'react-dom': '19.2.8',
          // Matches the compiler the repo builds with, so the consumer check
          // exercises the same resolution behaviour as our own type checks.
          typescript: '7.0.2',
          // React is a peer dependency, so a TypeScript consumer brings its own
          // React types — the package must not pin them for them.
          '@types/react': '19.2.17',
          '@types/react-dom': '19.2.3',
          // Optional peer: installed in the fixture so the editor entrypoint
          // type-resolves; consumers without it simply skip that subpath.
          'monaco-editor': MONACO_EDITOR_VERSION,
          // streamdown's public types (surfaced via ChatUIConfig's
          // markdownComponents) reference mermaid, whose declarations import
          // type-fest without declaring it; a strict consumer without
          // skipLibCheck needs it resolvable.
          'type-fest': '4.41.0',
        },
      },
      null,
      2,
    ),
  )

  console.log('• installing the tarball into a fixture (npm, as a consumer would)')
  run('npm', ['install', '--no-audit', '--no-fund', '--loglevel', 'error'], fixture)

  console.log('• asserting the standalone stylesheet is layered')
  const css = readFileSync(
    path.join(fixture, 'node_modules/@parallelworks/ui/dist/styles.css'),
    'utf8',
  )
  // Rules live in the pw-ui layer so the sheet loads in any order beside a
  // host's own stylesheets.
  if (!css.includes('@layer pw-ui{')) {
    throw new Error('dist/styles.css lost its pw-ui layer wrapper')
  }
  for (const needle of ['.btn{', '.bg-background', '.divide-border', '--color-background:']) {
    if (!css.includes(needle)) {
      throw new Error(`dist/styles.css is missing ${needle}`)
    }
  }

  console.log('• asserting fonts.css ships the fonts it references')
  const stylesDir = path.join(fixture, 'node_modules/@parallelworks/ui/dist/styles')
  const fontsCss = readFileSync(path.join(stylesDir, 'fonts.css'), 'utf8')
  for (const [, url] of fontsCss.matchAll(/url\('\.\/([^']+)'\)/g)) {
    if (!existsSync(path.join(stylesDir, url))) {
      throw new Error(`dist/styles/fonts.css references missing ${url}`)
    }
  }

  console.log('• asserting the editor ships the workers it references')
  const editorDir = path.join(fixture, 'node_modules/@parallelworks/ui/dist/editor')
  const workersJs = readFileSync(path.join(editorDir, 'workers.js'), 'utf8')
  const workerUrls = [...workersJs.matchAll(/new URL\("([^"]+)", import\.meta\.url\)/g)].map(
    ([, url]) => url,
  )
  // Editor, JSON and YAML. A root-absolute URL would resolve against the
  // consumer's site, where the file was never copied.
  if (workerUrls.length !== 3) {
    throw new Error(`dist/editor/workers.js references ${workerUrls.length} workers, expected 3`)
  }
  for (const url of workerUrls) {
    if (!url.startsWith('../') || !existsSync(path.join(editorDir, url))) {
      throw new Error(`dist/editor/workers.js references missing or absolute ${url}`)
    }
  }

  console.log('• importing every entrypoint under Node ESM')
  writeFileSync(
    path.join(fixture, 'smoke.mjs'),
    [
      "import * as root from '@parallelworks/ui'",
      "import * as icons from '@parallelworks/ui/icons'",
      "import * as theme from '@parallelworks/ui/theme'",
      "import * as logviewer from '@parallelworks/ui/logviewer'",
      "import * as graph from '@parallelworks/ui/graph'",
      "import * as fileExplorer from '@parallelworks/ui/file-explorer'",
      "import * as list from '@parallelworks/ui/list'",
      "import * as editor from '@parallelworks/ui/editor'",
      "import * as form from '@parallelworks/ui/form'",
      "import * as ai from '@parallelworks/ui/ai'",
      "import * as openai from '@parallelworks/ui/ai/openai'",
      "import * as mock from '@parallelworks/ui/ai/mock'",
      'const need = (mod, name, key) => {',
      // biome-ignore lint/suspicious/noTemplateCurlyInString: this line is source for the generated script, which interpolates
      '  if (!(key in mod)) throw new Error(`${name} is missing export ${key}`)',
      '}',
      "need(root, 'root', 'deriveTheme')",
      "need(root, 'root', 'Table')",
      "need(root, 'root', 'CompactTable')",
      "need(root, 'root', 'Loader')",
      "need(root, 'root', 'BareModal')",
      "need(root, 'root', 'ConfirmModal')",
      "need(root, 'root', 'CreateModal')",
      "need(root, 'root', 'StatusBadge')",
      "need(root, 'root', 'GlobalTooltip')",
      "need(root, 'root', 'TOOLTIP_ID')",
      "need(root, 'root', 'Callout')",
      "need(root, 'root', 'EmptyState')",
      "need(root, 'root', 'DescriptionList')",
      "need(root, 'root', 'Indicator')",
      "need(root, 'root', 'UIProvider')",
      "need(root, 'root', 'useRunFile')",
      "need(logviewer, 'logviewer', 'LogViewer')",
      "need(graph, 'graph', 'DependencyGraph')",
      "need(fileExplorer, 'fileExplorer', 'FileExplorer')",
      "need(fileExplorer, 'fileExplorer', 'FileExplorerProvider')",
      "need(fileExplorer, 'fileExplorer', 'CorsError')",
      "need(graph, 'graph', 'DependencyGraphPreview')",
      "need(list, 'list', 'useRowMenu')",
      "need(list, 'list', 'NameCell')",
      "need(list, 'list', 'ListSkeleton')",
      "need(editor, 'editor', 'Editor')",
      "need(editor, 'editor', 'EditorField')",
      "need(editor, 'editor', 'FormCodePanel')",
      "need(editor, 'editor', 'setupMonacoWorkers')",
      "need(form, 'form', 'DynamicForm')",
      "need(form, 'form', 'initializeValues')",
      "need(ai, 'ai', 'ChatProvider')",
      "need(ai, 'ai', 'ChatAdapterError')",
      "need(ai, 'ai', 'chatReducer')",
      "need(openai, 'ai/openai', 'createOpenAICompatibleStream')",
      "need(mock, 'ai/mock', 'createMockChatAdapter')",
      "if (typeof mock.createMockChatAdapter().streamCompletion !== 'function') {",
      "  throw new Error('mock adapter is not usable')",
      '}',
      "if (typeof root.Table.Item !== 'function') {",
      "  throw new Error('Table.Item static is missing')",
      '}',
      "need(theme, 'theme', 'deriveTheme')",
      "need(theme, 'theme', 'THEME_PRESETS')",
      "need(theme, 'theme', 'applyTheme')",
      "need(icons, 'icons', 'AddIcon')",
      "need(icons, 'icons', 'LoaderIcon')",
      "need(icons, 'icons', 'SuccessCheckmark')",
      'const vars = theme.deriveTheme({',
      "  accent: '#06354f',",
      "  background: '#ffffff',",
      '})',
      "if (!vars['--theme-app-bg']) {",
      "  throw new Error('deriveTheme produced no --theme-app-bg')",
      '}',
      "console.log('entrypoints import and deriveTheme derives')",
    ].join('\n'),
  )
  console.log(`  ${run('node', ['smoke.mjs'], fixture).trim()}`)

  console.log('• typechecking a consumer against the shipped .d.ts')
  writeFileSync(
    path.join(fixture, 'consumer.ts'),
    [
      "import { deriveTheme, THEME_PRESETS } from '@parallelworks/ui/theme'",
      "import type { ThemeVariables, ThemeSeed } from '@parallelworks/ui/theme'",
      "import { AddIcon, LoaderIcon } from '@parallelworks/ui/icons'",
      "const seed: ThemeSeed = { accent: '#06354f', background: '#ffffff' }",
      'export const vars: ThemeVariables = deriveTheme(seed)',
      'export const presets = THEME_PRESETS.map(p => p.name)',
      'export const icons = [AddIcon, LoaderIcon]',
      "import type { ChatAdapter, ChatMessage, Conversation } from '@parallelworks/ui/ai'",
      "import { createMockChatAdapter } from '@parallelworks/ui/ai/mock'",
      'const adapter: ChatAdapter = createMockChatAdapter()',
      'export const ids = (c: Conversation): string[] =>',
      '  c.messages.map((m: ChatMessage) => m.id)',
      'export const models = () => adapter.models.list()',
    ].join('\n'),
  )
  writeFileSync(
    path.join(fixture, 'tsconfig.json'),
    JSON.stringify(
      {
        compilerOptions: {
          // nodenext is the strict case: it holds the package's exports map and
          // emitted specifiers to Node's ESM resolution rules.
          module: 'nodenext',
          moduleResolution: 'nodenext',
          target: 'es2022',
          lib: ['dom', 'esnext'],
          jsx: 'react-jsx',
          strict: true,
          noEmit: true,
        },
        files: ['consumer.ts'],
      },
      null,
      2,
    ),
  )
  run(path.join(fixture, 'node_modules/.bin/tsc'), ['-p', 'tsconfig.json'], fixture)
  console.log('  consumer typechecks under module: nodenext')

  console.log('\n✓ the published tarball is consumable')
} catch (err) {
  failed = true
  console.error('\n✗ pack verification failed\n')
  const out = `${err.stdout ?? ''}${err.stderr ?? ''}`.trim()
  console.error(out || err.message)
} finally {
  rmSync(fixture, { recursive: true, force: true })
}

process.exit(failed ? 1 : 0)
