import { relative, resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

const repo = resolve(import.meta.dirname, '../../..')

/** Lists the repository's files in the bundle, so CI measures only a PR that changes one. */
const sources = (): Plugin => ({
  name: 'bench-sources',
  generateBundle() {
    const files = [...this.getModuleIds()]
      .map((id) => id.replace(/\?.*/, ''))
      .filter((id) => id.startsWith(`${repo}/`) && !id.includes('/node_modules/'))
      .map((id) => relative(repo, id))
    this.emitFile({
      type: 'asset',
      fileName: 'sources.json',
      source: JSON.stringify([...new Set(files)].sort()),
    })
  },
})

// Built like a host's production bundle, into `bench/dist`.
export default defineConfig({
  root: import.meta.dirname,
  base: './',
  plugins: [react(), sources()],
  build: { outDir: 'dist', emptyOutDir: true },
})
