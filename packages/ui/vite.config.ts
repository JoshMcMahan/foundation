import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

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

export default defineConfig({
  plugins: [react()],
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
