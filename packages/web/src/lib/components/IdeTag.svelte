<script lang="ts">
  import * as api from '$lib/api'

  interface Props {
    tag: string
    content: string
  }

  const { tag, content }: Props = $props()

  // Extract file path from content
  const filePath = $derived.by(() => {
    // Try to extract path from various formats
    // 1. "opened the file /path" or "selected...from /path"
    const pathMatch = content.match(/(?:opened the file |selected.*from )(\/[^\s]+)/)
    if (pathMatch) return pathMatch[1]

    // 2. Direct path (starts with /)
    if (content.trim().startsWith('/')) {
      return content.trim().split('\n')[0].split(' ')[0]
    }

    return null
  })

  // Extract line number if present
  const lineInfo = $derived.by(() => {
    const lineMatch = content.match(/lines? (\d+)(?:\s*to\s*(\d+))?/)
    if (lineMatch) {
      return lineMatch[2] ? `L${lineMatch[1]}-${lineMatch[2]}` : `L${lineMatch[1]}`
    }
    return null
  })

  const handleClick = async () => {
    if (filePath) {
      await api.openFile(filePath)
    }
  }
</script>

{#if tag === 'ide_opened_file'}
  <div class="flex items-center gap-2 text-xs text-blue-400 bg-blue-900/20 rounded px-2 py-1">
    <span class="opacity-60">📂</span>
    {#if filePath}
      {#await api.checkFileExists(filePath)}
        <span class="font-mono">{filePath.split('/').pop()}</span>
      {:then exists}
        {#if exists}
          <button
            class="font-mono hover:underline cursor-pointer bg-transparent border-none text-blue-400 p-0"
            onclick={handleClick}
            title={filePath}
          >
            {filePath.split('/').pop()}{lineInfo ? `:${lineInfo}` : ''}
          </button>
        {:else}
          <span class="font-mono opacity-60" title={filePath}>
            {filePath.split('/').pop()}
          </span>
        {/if}
      {/await}
    {:else}
      <span class="opacity-60">{content}</span>
    {/if}
  </div>
{:else if tag === 'ide_selection'}
  <div class="text-xs text-purple-400 bg-purple-900/20 rounded px-2 py-1">
    <div class="flex items-center gap-2">
      <span class="opacity-60">✂️</span>
      {#if filePath}
        {#await api.checkFileExists(filePath)}
          <span class="font-mono">{filePath.split('/').pop()}{lineInfo ? `:${lineInfo}` : ''}</span>
        {:then exists}
          {#if exists}
            <button
              class="font-mono hover:underline cursor-pointer bg-transparent border-none text-purple-400 p-0"
              onclick={handleClick}
              title={filePath}
            >
              {filePath.split('/').pop()}{lineInfo ? `:${lineInfo}` : ''}
            </button>
          {:else}
            <span class="font-mono opacity-60" title={filePath}>
              {filePath.split('/').pop()}{lineInfo ? `:${lineInfo}` : ''}
            </span>
          {/if}
        {/await}
      {:else}
        <span class="font-mono">{content.split('\n')[0].slice(0, 60)}</span>
      {/if}
    </div>
  </div>
{:else}
  <!-- Unknown IDE tag - show warning -->
  <div class="text-xs text-yellow-400 bg-yellow-900/20 rounded px-2 py-1">
    <span class="opacity-60">⚠️</span>
    <span class="font-mono">&lt;{tag}&gt;</span>
    <span class="opacity-60 ml-1">{content.slice(0, 50)}{content.length > 50 ? '...' : ''}</span>
  </div>
{/if}
