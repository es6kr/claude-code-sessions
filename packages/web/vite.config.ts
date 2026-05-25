import { sveltekit } from '@sveltejs/kit/vite'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vitest/config'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const pkg = JSON.parse(readFileSync(resolve(__dirname, 'package.json'), 'utf-8'))

export default defineConfig(({ isSsrBuild }) => ({
  plugins: [tailwindcss(), sveltekit()],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  resolve: {
    alias: {
      '@claude-sessions/ui/components': resolve(__dirname, '../ui/src/lib/components'),
      '@claude-sessions/ui': resolve(__dirname, '../ui/src/lib/index.ts'),
      ...(!isSsrBuild
        ? {
            'node:fs/promises': resolve(__dirname, 'src/lib/stubs/fs-promises.ts'),
            'node:fs': resolve(__dirname, 'src/lib/stubs/fs.ts'),
          }
        : {}),
    },
  },
  test: {
    exclude: ['e2e/**', 'node_modules/**'],
  },
}))
