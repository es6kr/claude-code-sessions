<script lang="ts">
  import { IdeTag, SessionContextProvider, createMockSessionContext } from '@claude-sessions/ui'

  export type TimelineEntry = {
    index: number
    timestamp?: string
    type: string
    role?: string
    text: string
    ideTag?: string
  }

  type Props = {
    filePath: string
    entries: TimelineEntry[]
    parseErrors: number
  }

  let { filePath, entries, parseErrors }: Props = $props()

  const sessionCtx = createMockSessionContext()

  function basename(p: string): string {
    const sep = Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\'))
    return sep >= 0 ? p.slice(sep + 1) : p
  }

  function formatTime(iso: string | undefined): string {
    if (!iso) return ''
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return ''
    return d.toLocaleTimeString(undefined, { hour12: false })
  }

  function badgeClass(type: string): string {
    switch (type) {
      case 'user':
        return 'bg-blue-100 text-blue-900 dark:bg-blue-900/40 dark:text-blue-200'
      case 'assistant':
        return 'bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-200'
      case 'tool_use':
        return 'bg-purple-100 text-purple-900 dark:bg-purple-900/40 dark:text-purple-200'
      case 'tool_result':
        return 'bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200'
      case 'summary':
        return 'bg-pink-100 text-pink-900 dark:bg-pink-900/40 dark:text-pink-200'
      case 'system':
        return 'bg-slate-200 text-slate-900 dark:bg-slate-800/60 dark:text-slate-200'
      default:
        return 'bg-zinc-200 text-zinc-900 dark:bg-zinc-800/60 dark:text-zinc-200'
    }
  }
</script>

<SessionContextProvider context={sessionCtx}>
  {#snippet children()}
    <main class="p-4 max-w-5xl mx-auto">
      <header class="mb-3 flex items-baseline gap-3 flex-wrap">
        <h1 class="text-lg font-semibold">{basename(filePath)}</h1>
        <span class="text-xs opacity-60">{entries.length} entries</span>
        {#if parseErrors > 0}
          <span class="text-xs text-amber-400"
            >{parseErrors} parse error{parseErrors === 1 ? '' : 's'}</span
          >
        {/if}
      </header>

      {#if entries.length === 0}
        <p class="text-sm opacity-60">Empty session.</p>
      {:else}
        <ol class="space-y-2">
          {#each entries as entry (entry.index)}
            <li class="rounded border border-current/10 p-2">
              <div class="flex items-center gap-2 text-[11px] opacity-70 mb-1">
                <span class="font-mono">{entry.index + 1}</span>
                {#if entry.timestamp}
                  <span class="font-mono">{formatTime(entry.timestamp)}</span>
                {/if}
                <span class="px-1.5 py-0.5 rounded {badgeClass(entry.type)}">{entry.type}</span>
                {#if entry.role && entry.role !== entry.type}
                  <span class="opacity-70">{entry.role}</span>
                {/if}
              </div>
              {#if entry.ideTag}
                <IdeTag tag={entry.ideTag} content={entry.text} />
              {:else if entry.text}
                <pre class="text-xs whitespace-pre-wrap break-words font-sans">{entry.text}</pre>
              {/if}
            </li>
          {/each}
        </ol>
      {/if}
    </main>
  {/snippet}
</SessionContextProvider>
