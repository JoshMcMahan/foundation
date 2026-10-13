import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Built like a host's production bundle, into `bench/dist`.
export default defineConfig({
  root: import.meta.dirname,
  base: './',
  plugins: [react()],
  build: { outDir: 'dist', emptyOutDir: true },
})
