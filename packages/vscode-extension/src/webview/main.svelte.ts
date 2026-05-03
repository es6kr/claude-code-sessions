import { mount } from 'svelte'
import App from './App.svelte'
import './app.css'

/**
 * Webview entry point for the Custom Editor JSONL preview spike.
 *
 * Boot sequence:
 *  1. Acquire the VSCode webview API handle.
 *  2. Mount a placeholder Svelte app with empty data (reactive via `$state`).
 *  3. Notify the extension host that we are ready (`{ type: 'ready' }`).
 *  4. Wait for `{ type: 'load-session', content }` and update the snippet.
 *
 * The `.svelte.ts` extension allows Svelte 5 runes (`$state`) outside `.svelte`
 * files. The plugin compiles this through the Svelte preprocessor.
 *
 * Phase 1 will expand this into a full message protocol (load, watch, mutate)
 * and replace the placeholder App with the real SessionViewer component tree.
 */

type ExtToWebview = {
  type: 'load-session'
  filePath: string
  content: string
}

type WebviewToExt = { type: 'ready' }

interface VsCodeApi {
  postMessage(msg: WebviewToExt): void
}

declare function acquireVsCodeApi(): VsCodeApi

const vscode = acquireVsCodeApi()

const target = document.getElementById('app')
if (!target) {
  throw new Error('Webview root element #app not found')
}

const appProps = $state({
  filePath: '',
  snippet: '',
  lineCount: 0,
})

mount(App, {
  target,
  props: appProps,
})

window.addEventListener('message', (event) => {
  const msg = event.data as ExtToWebview
  if (msg?.type === 'load-session') {
    appProps.filePath = msg.filePath
    appProps.snippet = msg.content.slice(0, 500)
    appProps.lineCount = msg.content.split('\n').filter((l) => l.trim().length > 0).length
  }
})

vscode.postMessage({ type: 'ready' })
