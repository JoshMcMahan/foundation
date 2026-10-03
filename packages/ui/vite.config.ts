import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { IconsManifest } from 'react-icons/lib'
import { defineConfig, type Plugin } from 'vite'

const pkg = JSON.parse(readFileSync('./package.json', 'utf8'))
const yamlServer = JSON.parse(
  readFileSync('./node_modules/yaml-language-server/package.json', 'utf8'),
)

// Externalized so we never ship someone else's code under our license.
const external = [
  ...Object.keys(pkg.dependencies ?? {}),
  ...Object.keys(pkg.peerDependencies ?? {}),
]

// Workers are the one place ui ships other projects' code, so each worker file
// opens with the name, version and license of every package bundled into it.
function thirdPartyNotices(moduleIds: string[]): string {
  const packageDirs = new Set<string>()
  for (const id of moduleIds) {
    const dir = /^(.*\/node_modules\/(?:@[^/]+\/)?[^/]+)\//.exec(id)?.[1]
    if (dir) {
      packageDirs.add(dir)
    }
  }
  const notices = [...packageDirs].sort().map((dir) => {
    const { name, version, license } = JSON.parse(readFileSync(`${dir}/package.json`, 'utf8'))
    const file = readdirSync(dir).find((f) => /^(licen[cs]e|copying)/i.test(f))
    const text = file ? readFileSync(path.join(dir, file), 'utf8').trim() : `License: ${license}`
    return `${name}@${version}\n\n${text}`
  })
  const body = notices.join('\n\n---\n\n').replaceAll('*/', '* /')
  return `/*!\nThird-party software bundled into this file:\n\n${body}\n*/`
}

const ICON_PREFIX = 'ui-icon:'
const iconDir = path.resolve('src/icons')

// react-icons ships each set as one module, so a consumer's bundler puts every
// icon the app uses anywhere into one shared chunk. Each icon becomes its own
// module instead, holding that icon's data under its set's license.
function perIconModules(): Plugin {
  const sets = new Map<string, string>()
  const setSource = (set: string) => {
    if (!sets.has(set)) {
      sets.set(set, readFileSync(fileURLToPath(import.meta.resolve(`react-icons/${set}`)), 'utf8'))
    }
    return sets.get(set) as string
  }
  return {
    name: 'per-icon-modules',
    enforce: 'pre',
    transform(code, id) {
      if (id.includes('/node_modules/') || !code.includes("from 'react-icons/")) {
        return
      }
      return code.replaceAll(
        /\b(import|export) \{([^}]*)\} from 'react-icons\/([a-z0-9]+)'/g,
        (statement, keyword: string, specifiers: string, set: string) =>
          set === 'lib'
            ? statement
            : specifiers
                .split(',')
                .map((specifier) => specifier.trim())
                .filter(Boolean)
                .map((specifier) => {
                  const icon = specifier.split(/\s+as\s+/)[0]
                  return `${keyword} { ${specifier} } from '${ICON_PREFIX}${set}/${icon}'`
                })
                .join('\n'),
      )
    },
    resolveId(source) {
      if (source.startsWith(ICON_PREFIX)) {
        return path.join(iconDir, `${source.slice(ICON_PREFIX.length)}.js`)
      }
    },
    load(id) {
      if (!id.startsWith(`${iconDir}/`)) {
        return
      }
      const [set, icon] = id.slice(iconDir.length + 1, -'.js'.length).split('/')
      const data = new RegExp(
        `export function ${icon} \\(props\\) \\{\\s*return GenIcon\\((.*)\\)\\(props\\);`,
      ).exec(setSource(set))?.[1]
      const source = IconsManifest.find((entry) => entry.id === set)
      if (!data || !source) {
        throw new Error(`react-icons/${set} has no ${icon}`)
      }
      return [
        `/*! ${icon}: ${source.name} (${source.projectUrl}), ${source.license} ${source.licenseUrl} */`,
        `import { GenIcon } from 'react-icons/lib'`,
        `export function ${icon}(props) {`,
        `  return GenIcon(${data})(props)`,
        '}',
      ].join('\n')
    },
  }
}

export default defineConfig({
  plugins: [react(), perIconModules()],
  // Relative asset URLs, so a consumer's bundler sees and copies the workers.
  base: './',
  // The YAML server reports its version from process.env, which a browser
  // worker does not have.
  define: {
    'process.env.YAML_LANGUAGE_SERVER_VERSION': JSON.stringify(yamlServer.version),
  },
  resolve: {
    // The YAML worker bundles yaml-language-server, which imports Node's path
    // and url; only the worker reaches them.
    alias: { path: 'path-browserify', url: 'url/' },
  },
  worker: {
    format: 'es',
    rolldownOptions: {
      output: {
        minify: true,
        postBanner: (chunk) => thirdPartyNotices(chunk.moduleIds),
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    minify: false,
    lib: {
      formats: ['es'],
      entry: {
        index: 'src/index.ts',
        icons: 'src/icons.tsx',
        'theme/index': 'src/theme/index.ts',
        'logviewer/index': 'src/logviewer/index.ts',
        'graph/index': 'src/graph/index.ts',
        'editor/index': 'src/editor/index.ts',
        'file-explorer/index': 'src/file-explorer/index.ts',
        'list/index': 'src/list/index.ts',
        'form/index': 'src/form/index.ts',
        'ai/index': 'src/ai/index.ts',
        'ai/adapter/openai/index': 'src/ai/adapter/openai/index.ts',
        'ai/adapter/mock/index': 'src/ai/adapter/mock/index.ts',
      },
    },
    rollupOptions: {
      external: (id) => external.some((dep) => id === dep || id.startsWith(`${dep}/`)),
      output: {
        // One file per source module, so a consumer's bundler keeps only the
        // components it imports instead of the shared chunks a library build merges.
        preserveModules: true,
        preserveModulesRoot: 'src',
        entryFileNames: '[name].js',
        chunkFileNames: 'chunks/[name]-[hash].js',
      },
    },
  },
})
