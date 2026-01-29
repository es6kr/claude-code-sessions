<script lang="ts">
  import type { Message } from '$lib/api'
  import {
    autoRepairChain,
    deleteMessageWithChainRepair,
    validateChain,
    validateProgressMessages,
    validateToolUseResult,
    type GenericMessage,
  } from '@claude-sessions/core'
  import MessageItem from './MessageItem.svelte'
  import ValidationBadge from './ValidationBadge.svelte'

  interface Props {
    initialMessages: Record<string, unknown>[]
    title?: string
  }

  let { initialMessages, title = 'Validation Demo' }: Props = $props()

  // Convert to Message type and make reactive copy
  let messages = $state(initialMessages.map((m) => ({ ...m }) as GenericMessage))

  const chainResult = $derived(validateChain(messages))
  const toolResult = $derived(validateToolUseResult(messages))
  const progressResult = $derived(validateProgressMessages(messages))

  function handleRepair() {
    autoRepairChain(messages as unknown as Parameters<typeof autoRepairChain>[0])
    // Trigger reactivity
    messages = [...messages]
  }

  function handleRepairProgress() {
    // Remove all progress messages with hookEvent: 'Stop'
    const progressUuids = progressResult.errors
      .map((e) => {
        // Find the message at this line (1-indexed)
        const msg = messages[e.line - 1]
        return msg?.uuid
      })
      .filter(Boolean) as string[]

    // Delete each progress message with chain repair
    for (const uuid of progressUuids) {
      deleteMessageWithChainRepair(
        messages as unknown as Parameters<typeof deleteMessageWithChainRepair>[0],
        uuid
      )
    }
    // Trigger reactivity
    messages = [...messages]
  }

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
    deleteMessageWithChainRepair(messages as GenericMessage[], msgId, targetType)

    // Trigger reactivity
    messages = [...messages]
  }

  function resetMessages() {
    messages = initialMessages.map((m) => ({ ...m }) as GenericMessage)
  }
</script>

<div class="flex flex-col gap-4 p-4 bg-gh-bg-secondary text-gh-text-secondary min-h-[500px]">
  <!-- Header -->
  <div class="flex justify-between items-center gap-2">
    <div class="flex items-center gap-2">
      <h3 class="font-medium text-lg">{title}</h3>
      <ValidationBadge
        chainErrors={chainResult.errors}
        progressErrors={progressResult.errors}
        onRepair={handleRepair}
        onRepairProgress={handleRepairProgress}
      />
    </div>
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

    <div
      class="flex-1 px-3 py-2 rounded {progressResult.valid
        ? 'bg-green-900/30 border border-green-700'
        : 'bg-yellow-900/30 border border-yellow-700'}"
    >
      <div
        class="text-sm font-medium {progressResult.valid ? 'text-green-400' : 'text-yellow-400'}"
      >
        Progress: {progressResult.valid ? '✓ Clean' : `⚠ ${progressResult.errors.length} found`}
      </div>
      {#if progressResult.errors.length > 0}
        <ul class="mt-1 text-xs text-yellow-300">
          {#each progressResult.errors as error}
            <li>L{error.line}: {error.hookName || error.hookEvent || 'unknown'}</li>
          {/each}
        </ul>
      {/if}
    </div>
  </div>

  <!-- Message List -->
  <div class="flex-1 space-y-2 overflow-y-auto">
    {#each messages as msg, i (`${msg.type}-${msg.uuid ?? (msg as unknown as { messageId?: string }).messageId ?? i}`)}
      <MessageItem
        msg={msg as Message}
        sessionId="demo"
        isFirst={i === 0}
        onDelete={handleDelete}
      />
    {/each}
    {#if messages.length === 0}
      <div class="text-center text-gh-text-secondary py-8">
        No messages - click Reset to restore
      </div>
    {/if}
  </div>
</div>
