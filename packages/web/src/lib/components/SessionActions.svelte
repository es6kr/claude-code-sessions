<script lang="ts">
  import TooltipButton from './TooltipButton.svelte'

  interface Props {
    onResumeSession?: () => void
    onCompressSession?: () => void
    onRenameSession?: () => void
    onDeleteSession?: () => void
  }

  let { onResumeSession, onCompressSession, onRenameSession, onDeleteSession }: Props = $props()
</script>

{#if onResumeSession || onCompressSession || onRenameSession || onDeleteSession}
  <div class="flex items-center gap-0.5">
    {#if onResumeSession}
      <TooltipButton
        class="p-1.5 rounded text-gh-text-secondary hover:text-gh-green hover:bg-gh-green/10 text-sm transition-colors"
        onclick={onResumeSession}
        title="Resume session"
      >
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"
          />
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
      </TooltipButton>
    {/if}
    {#if onCompressSession}
      <TooltipButton
        class="p-1.5 rounded text-gh-text-secondary hover:text-gh-accent hover:bg-gh-accent/10 text-sm transition-colors"
        onclick={onCompressSession}
        title="Compress session"
      >
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="1.5"
            d="m20.25 7.5-.625 10.632a2.25 2.25 0 0 1-2.247 2.118H6.622a2.25 2.25 0 0 1-2.247-2.118L3.75 7.5m8.25 3v6.75m0 0-3-3m3 3 3-3M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125Z"
          />
        </svg>
      </TooltipButton>
    {/if}
    {#if onRenameSession}
      <TooltipButton
        class="p-1.5 rounded text-gh-text-secondary hover:text-gh-accent hover:bg-gh-accent/10 text-sm transition-colors"
        onclick={onRenameSession}
        title="Rename session"
      >
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
          />
        </svg>
      </TooltipButton>
    {/if}
    {#if onDeleteSession}
      <TooltipButton
        class="p-1.5 rounded text-gh-text-secondary hover:text-gh-red hover:bg-gh-red/10 text-sm transition-colors"
        onclick={onDeleteSession}
        title="Delete session"
      >
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
          />
        </svg>
      </TooltipButton>
    {/if}
  </div>
{/if}
