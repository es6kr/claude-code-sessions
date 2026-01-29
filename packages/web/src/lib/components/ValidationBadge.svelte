<script lang="ts">
  import type { ChainError, ProgressError, ValidationResult } from '@claude-sessions/core'

  interface Props {
    // Accept ValidationResult.errors array (may include ToolUseResultError, etc.)
    chainErrors?: ValidationResult['errors']
    progressErrors?: ProgressError[]
    isRepairing?: boolean
    onRepair?: () => void
    onRepairProgress?: () => void
  }

  let {
    chainErrors = [],
    progressErrors = [],
    isRepairing = false,
    onRepair,
    onRepairProgress,
  }: Props = $props()

  // Filter to only ChainError types for display
  const filteredChainErrors = $derived(
    chainErrors.filter(
      (e): e is ChainError => e.type === 'broken_chain' || e.type === 'orphan_parent'
    )
  )
  const hasChainErrors = $derived(filteredChainErrors.length > 0)
  const hasProgressErrors = $derived(progressErrors.length > 0)
</script>

{#if hasChainErrors}
  <div class="relative group">
    {#if onRepair}
      <button
        class="text-xs px-2 py-0.5 rounded bg-red-900/30 text-red-400 border border-red-700
               hover:bg-red-900/50 transition-colors flex items-center gap-1"
        onclick={onRepair}
        disabled={isRepairing}
      >
        {#if isRepairing}
          <span class="animate-spin">⟳</span>
        {:else}
          ⚠️
        {/if}
        {filteredChainErrors.length} chain error{filteredChainErrors.length > 1 ? 's' : ''}
        {#if !isRepairing}
          - Repair
        {/if}
      </button>
    {:else}
      <span class="text-xs px-2 py-0.5 rounded bg-red-900/30 text-red-400 border border-red-700">
        ⚠️ {filteredChainErrors.length} chain error{filteredChainErrors.length > 1 ? 's' : ''}
      </span>
    {/if}
    <!-- Tooltip with error details -->
    <div
      class="absolute left-0 top-full mt-1 z-50 hidden group-hover:block
             bg-gh-bg border border-gh-border rounded-lg shadow-xl p-2 min-w-[250px] max-w-[400px]"
    >
      <div class="text-xs text-gh-text-secondary mb-1">Chain errors:</div>
      <ul class="text-xs space-y-1">
        {#each filteredChainErrors as error}
          <li class="text-red-400">
            <span class="text-gh-text-secondary">L{error.line}:</span>
            {error.type === 'broken_chain' ? 'Broken chain (null parentUuid)' : 'Orphan parent'}
            {#if error.type === 'orphan_parent' && error.parentUuid}
              <span class="text-gh-text-secondary">→ {error.parentUuid.slice(0, 8)}...</span>
            {/if}
          </li>
        {/each}
      </ul>
      {#if onRepair}
        <div class="text-xs text-gh-text-secondary mt-2 pt-1 border-t border-gh-border">
          Click to auto-repair by linking to previous message
        </div>
      {/if}
    </div>
  </div>
{/if}

{#if hasProgressErrors}
  <div class="relative group">
    {#if onRepairProgress}
      <button
        class="text-xs px-2 py-0.5 rounded bg-red-900/30 text-red-400 border border-red-700
               hover:bg-red-900/50 transition-colors flex items-center gap-1"
        onclick={onRepairProgress}
        disabled={isRepairing}
      >
        {#if isRepairing}
          <span class="animate-spin">⟳</span>
        {:else}
          ⚠️
        {/if}
        {progressErrors.length} progress
        {#if !isRepairing}
          - Remove
        {/if}
      </button>
    {:else}
      <span class="text-xs px-2 py-0.5 rounded bg-red-900/30 text-red-400 border border-red-700">
        ⚠️ {progressErrors.length} progress
      </span>
    {/if}
    <!-- Tooltip with progress details -->
    <div
      class="absolute left-0 top-full mt-1 z-50 hidden group-hover:block
             bg-gh-bg border border-gh-border rounded-lg shadow-xl p-2 min-w-[200px] max-w-[350px]"
    >
      <div class="text-xs text-gh-text-secondary mb-1">Progress messages (should be removed):</div>
      <ul class="text-xs space-y-1">
        {#each progressErrors as error}
          <li class="text-red-400">
            <span class="text-gh-text-secondary">L{error.line}:</span>
            {error.hookName || error.hookEvent || 'unknown'}
          </li>
        {/each}
      </ul>
      {#if onRepairProgress}
        <div class="text-xs text-gh-text-secondary mt-2 pt-1 border-t border-gh-border">
          Click to remove all progress messages
        </div>
      {/if}
    </div>
  </div>
{/if}
