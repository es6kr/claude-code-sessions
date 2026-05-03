import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import tailwindcss from '@tailwindcss/vite'
import { resolve } from 'node:path'

/**
 * Vite config for the VSCode webview bundle.
 *
 * Produces a single self-contained JS + CSS bundle that loads inside a
 * `vscode.WebviewPanel`. Output goes to `dist/webview/` so the extension
 * (`dist/extension.js`) can resolve assets via `webview.asWebviewUri()`.
 *
 * Constraints:
 * - No code splitting — webview CSP and `asWebviewUri` make multi-chunk loads awkward.
 * - No filename hashing — the extension references stable paths (`assets/main.js`, `assets/style.css`).
 * - Minify off in dev for easier devtools inspection (toggle via `--mode production`).
 */
export default defineConfig({
  plugins: [svelte(), tailwindcss()],
  build: {
    outDir: resolve(__dirname, 'dist/webview'),
    emptyOutDir: true,
    sourcemap: true,
    cssCodeSplit: false,
    rollupOptions: {
      input: resolve(__dirname, 'src/webview/main.svelte.ts'),
      output: {
        entryFileNames: 'assets/main.js',
        chunkFileNames: 'assets/[name].js',
        assetFileNames: (info) => {
          if (info.name?.endsWith('.css')) return 'assets/style.css'
          return 'assets/[name][extname]'
        },
        // Disable code splitting — single bundle for webview simplicity.
        manualChunks: undefined,
        inlineDynamicImports: true,
      },
    },
  },
})
