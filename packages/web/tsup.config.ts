import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/cli.ts'],
  format: ['esm'],
  clean: false, // Don't clean - vite build output is in build/
  outDir: 'dist',
})
