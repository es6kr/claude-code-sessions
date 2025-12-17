<script lang="ts">
  import type { Message, SessionMeta } from '$lib/api'
  import * as api from '$lib/api'
  import { truncate } from '$lib/utils'
  import MessageItem from './MessageItem.svelte'

  interface Props {
    session: SessionMeta | null
    messages: Message[]
    onDeleteMessage: (msg: Message) => void
    onEditTitle: (msg: Message) => void
    onSplitSession: (msg: Message) => void
  }

  let { session, messages, onDeleteMessage, onEditTitle, onSplitSession }: Props = $props()

  const openSessionFile = async () => {
    if (!session) return
    const filePath = `~/.claude/projects/${session.projectName}/${session.id}.jsonl`
    try {
      await api.openFile(filePath)
    } catch (e) {
      console.error('Failed to open file:', e)
    }
  }

  // Find index of first meaningful message (user/assistant, not metadata)
  const firstMeaningfulIndex = $derived(
    messages.findIndex((m) => m.type === 'user' || m.type === 'assistant' || m.type === 'human')
  )

  // Scroll container reference for navigation
  let scrollContainer: HTMLDivElement | undefined = $state()

  const scrollToTop = () => {
    if (scrollContainer) {
      scrollContainer.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }

  const scrollToBottom = () => {
    if (scrollContainer) {
      scrollContainer.scrollTo({ top: scrollContainer.scrollHeight, behavior: 'smooth' })
    }
  }
</script>

<section
  class="bg-gh-bg-secondary border border-gh-border rounded-lg overflow-hidden flex flex-col"
>
  <!-- Header -->
  <div class="p-4 border-b border-gh-border bg-gh-bg flex justify-between items-start">
    <div class="flex-1 min-w-0">
      {#if session}
        <h2 class="text-base font-semibold">
          {truncate(session.title ?? 'Untitled', 50)} ({messages.length} messages)
        </h2>
        <button
          class="text-xs text-gh-text-secondary font-mono mt-1 hover:text-gh-accent
                 hover:underline cursor-pointer bg-transparent border-none p-0 text-left"
          onclick={openSessionFile}
          title="Open session file in VSCode"
        >
          {session.id}
        </button>
      {:else}
        <h2 class="text-base font-semibold">Messages</h2>
      {/if}
    </div>
    {#if session && messages.length > 0}
      <div class="flex gap-1 flex-shrink-0">
        <button
          class="px-2 py-1 text-xs rounded border border-gh-border hover:bg-gh-border-subtle
                 text-gh-text-secondary hover:text-gh-text transition-colors"
          onclick={scrollToTop}
          title="Go to top"
        >
          ↑ Top
        </button>
        <button
          class="px-2 py-1 text-xs rounded border border-gh-border hover:bg-gh-border-subtle
                 text-gh-text-secondary hover:text-gh-text transition-colors"
          onclick={scrollToBottom}
          title="Go to bottom"
        >
          ↓ Bottom
        </button>
      </div>
    {/if}
  </div>

  <!-- Messages -->
  {#if session}
    <div bind:this={scrollContainer} class="overflow-y-auto flex-1 p-4 flex flex-col gap-4">
      {#each messages as msg, i (msg.uuid ?? `idx-${i}`)}
        <MessageItem
          {msg}
          sessionId={session.id}
          isFirst={i === 0 || i === firstMeaningfulIndex}
          onDelete={onDeleteMessage}
          {onEditTitle}
          onSplit={onSplitSession}
        />
      {/each}
    </div>
  {:else}
    <p class="p-8 text-center text-gh-text-secondary">Select a session</p>
  {/if}
</section>
