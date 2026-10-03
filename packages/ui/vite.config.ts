import { readFileSync } from 'node:fs'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

const pkg = JSON.parse(readFileSync('./package.json', 'utf8'))

// Externalized so we never ship someone else's code under our license.
const external = [
  ...Object.keys(pkg.dependencies ?? {}),
  ...Object.keys(pkg.peerDependencies ?? {}),
]

const WORKER_BASE = 'import.meta.__uiWorkerBase'

// Vite would bundle each `new Worker(new URL(..., import.meta.url))` into an
// absolute /assets path that only exists in this build. Hiding import.meta.url
// from its scanner keeps the expression verbatim for the host's bundler.
export const keepWorkerUrls: Plugin = {
  name: 'keep-worker-urls',
  enforce: 'pre',
  transform(code, id) {
    if (id.endsWith('/src/editor/workers.ts')) {
      return code.replaceAll('import.meta.url', WORKER_BASE)
    }
  },
  renderChunk(code) {
    return code.replaceAll(WORKER_BASE, 'import.meta.url')
  },
}

export default defineConfig({
  plugins: [react(), keepWorkerUrls],
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
        'editor/workers/editor.worker': 'src/editor/workers/editor.worker.js',
        'editor/workers/json.worker': 'src/editor/workers/json.worker.js',
        'editor/workers/yaml.worker': 'src/editor/workers/yaml.worker.js',
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
