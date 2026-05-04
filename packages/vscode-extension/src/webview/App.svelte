<script lang="ts">
  /**
   * Spike placeholder component for the JSONL preview Custom Editor.
   *
   * Renders the file path passed from the extension host plus a snippet of the
   * loaded session content. Intentionally minimal — Phase 1 will replace this
   * with the real SessionViewer component tree (extracted from packages/web).
   *
   * P1 of UI sharing: imports IdeTag from @claude-sessions/ui as proof that
   * the workspace package + SessionContext pattern works end-to-end inside a
   * VSCode webview. Uses a mock context here; P3 will swap in postMessage-RPC
   * adapters that reach the extension host.
   */
  import { IdeTag, SessionContextProvider, createMockSessionContext } from '@claude-sessions/ui'

  type Props = {
    filePath: string
    snippet: string
    lineCount: number
  }

  let { filePath, snippet, lineCount }: Props = $props()

  let showFullSnippet = $state(false)

  function toggleSnippet() {
    showFullSnippet = !showFullSnippet
  }

  const sessionCtx = createMockSessionContext()
</script>

<SessionContextProvider context={sessionCtx}>
  {#snippet children()}
    <main class="p-6 max-w-4xl mx-auto">
      <header class="mb-4">
        <h1 class="text-2xl font-semibold mb-2">Claude Session Preview (Spike)</h1>
        <p class="text-sm opacity-70">
          This is a spike webview proving the Vite + Svelte 5 + Tailwind 4 bundle loads correctly
          inside a VSCode webview. The full SessionViewer ships in Phase 1.
        </p>
      </header>

      <section class="mb-4">
        <h2 class="text-sm font-medium uppercase tracking-wide opacity-60 mb-1">File</h2>
        <code class="block text-xs break-all p-2 rounded bg-black/10">
          {filePath}
        </code>
      </section>

      <section class="mb-4">
        <h2 class="text-sm font-medium uppercase tracking-wide opacity-60 mb-1">Stats</h2>
        <p class="text-sm">
          Loaded <strong>{lineCount}</strong> JSONL line{lineCount === 1 ? '' : 's'}.
        </p>
      </section>

      <section class="mb-4">
        <h2 class="text-sm font-medium uppercase tracking-wide opacity-60 mb-1">
          Shared Component Demo
        </h2>
        <p class="text-xs opacity-60 mb-2">
          IdeTag rendered from <code>@claude-sessions/ui</code>. P1 proof.
        </p>
        <div class="space-y-2">
          <IdeTag tag="ide_opened_file" content="opened the file /src/lib/api.ts" />
          <IdeTag
            tag="ide_selection"
            content="selected lines 5 to 15 from /src/lib/components/MessageItem.svelte"
          />
        </div>
      </section>

      <section>
        <div class="flex items-center justify-between mb-1">
          <h2 class="text-sm font-medium uppercase tracking-wide opacity-60">Snippet</h2>
          <button
            type="button"
            class="text-xs px-2 py-1 rounded border border-current opacity-70 hover:opacity-100"
            onclick={toggleSnippet}
          >
            {showFullSnippet ? 'Collapse' : 'Expand'}
          </button>
        </div>
        <pre
          class="text-xs whitespace-pre-wrap break-all p-2 rounded bg-black/10 overflow-auto"
          class:max-h-32={!showFullSnippet}
          class:max-h-screen={showFullSnippet}>{snippet}</pre>
      </section>
    </main>
  {/snippet}
</SessionContextProvider>
