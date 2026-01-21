<script lang="ts">
  import {
    validateChain,
    validateToolUseResult,
    deleteMessageWithChainRepair,
  } from '@claude-sessions/core'
  import type { Message } from '$lib/api'
  import MessageItem from './MessageItem.svelte'

  interface Props {
    initialMessages: Record<string, unknown>[]
    title?: string
  }

  let { initialMessages, title = 'Validation Demo' }: Props = $props()

  // Convert to Message type and make reactive copy
  let messages = $state(initialMessages.map((m) => ({ ...m }) as unknown as Message))

  const chainResult = $derived(validateChain(messages))
  const toolResult = $derived(validateToolUseResult(messages))

  function handleDelete(msg: Message) {
    // Determine targetType for disambiguation
    const targetType =
      msg.type === 'file-history-snapshot'
        ? ('file-history-snapshot' as const)
        : msg.type === 'summary'
          ? ('summary' as const)
          : undefined

    const msgId =
      msg.uuid ||
      (msg as unknown as { messageId?: string }).messageId ||
      (msg as unknown as { leafUuid?: string }).leafUuid

    if (!msgId) return

    // Use chain repair function - mutates in place
    deleteMessageWithChainRepair(messages as unknown as Message[], msgId, targetType)

    // Trigger reactivity
    messages = [...messages]
  }

  function resetMessages() {
    messages = initialMessages.map((m) => ({ ...m }) as unknown as Message)
  }
</script>

<div class="flex flex-col gap-4 p-4 bg-gh-canvas min-h-[500px]">
  <!-- Header -->
  <div class="flex justify-between items-center">
    <h3 class="text-gh-text font-medium text-lg">{title}</h3>
    <button
      class="px-3 py-1.5 text-sm rounded bg-gh-accent/20 text-gh-accent hover:bg-gh-accent/30"
      onclick={resetMessages}
    >
      Reset
    </button>
  </div>

  <!-- Validation Status Bar -->
  <div class="flex gap-4">
    <div
      class="flex-1 px-3 py-2 rounded {chainResult.valid
        ? 'bg-green-900/30 border border-green-700'
        : 'bg-red-900/30 border border-red-700'}"
    >
      <div class="text-sm font-medium {chainResult.valid ? 'text-green-400' : 'text-red-400'}">
        Chain: {chainResult.valid ? '✓ Valid' : '✗ Invalid'}
      </div>
      {#if chainResult.errors.length > 0}
        <ul class="mt-1 text-xs text-red-300">
          {#each chainResult.errors as error}
            <li>
              L{error.line}: {error.type}
              {#if error.type === 'orphan_parent'}
                → {error.parentUuid?.slice(0, 8)}...
              {/if}
            </li>
          {/each}
        </ul>
      {/if}
    </div>

    <div
      class="flex-1 px-3 py-2 rounded {toolResult.valid
        ? 'bg-green-900/30 border border-green-700'
        : 'bg-red-900/30 border border-red-700'}"
    >
      <div class="text-sm font-medium {toolResult.valid ? 'text-green-400' : 'text-red-400'}">
        Tool: {toolResult.valid ? '✓ Valid' : '✗ Invalid'}
      </div>
      {#if toolResult.errors.length > 0}
        <ul class="mt-1 text-xs text-red-300">
          {#each toolResult.errors as error}
            <li>L{error.line}: orphan {error.toolUseId}</li>
          {/each}
        </ul>
      {/if}
    </div>
  </div>

  <!-- Message List -->
  <div class="flex-1 space-y-2 overflow-y-auto">
    {#each messages as msg, i (`${msg.type}-${msg.uuid ?? (msg as unknown as { messageId?: string }).messageId ?? i}`)}
      <MessageItem {msg} sessionId="demo" isFirst={i === 0} onDelete={handleDelete} />
    {/each}
    {#if messages.length === 0}
      <div class="text-center text-gh-text-secondary py-8">
        No messages - click Reset to restore
      </div>
    {/if}
  </div>
</div>
