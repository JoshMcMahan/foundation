import { readFileSync } from 'node:fs'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const pkg = JSON.parse(readFileSync('./package.json', 'utf8'))

// Externalized so we never ship someone else's code under our license.
const external = [
  ...Object.keys(pkg.dependencies ?? {}),
  ...Object.keys(pkg.peerDependencies ?? {}),
]

export default defineConfig({
  plugins: [react()],
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
        entryFileNames: '[name].js',
        chunkFileNames: 'chunks/[name]-[hash].js',
      },
    },
  },
})
