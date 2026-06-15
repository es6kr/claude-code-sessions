<script lang="ts">
  import type { Message } from '$lib/api'
  import MessageItem from './MessageItem.svelte'

  interface Props {
    sessionId: string
    messages: Message[]
    onDeleteMessage: (msg: Message) => void
    onEditMessage?: (msg: Message) => void
    onEditTitle?: (msg: Message) => void
    onSplitSession?: (msg: Message) => void
    enableScroll?: boolean
    fullWidth?: boolean
  }

  let {
    sessionId,
    messages,
    onDeleteMessage,
    onEditMessage,
    onEditTitle,
    onSplitSession,
    enableScroll = true,
    fullWidth = false,
  }: Props = $props()

  // Find index of first meaningful message (user/assistant, not metadata)
  const firstMeaningfulIndex = $derived(
    messages.findIndex((m) => m.type === 'user' || m.type === 'assistant' || m.type === 'human')
  )

  // Per-row keys. First occurrence of each uuid keeps the bare uuid so Svelte
  // preserves component identity across re-renders; subsequent occurrences of
  // the same uuid (file-sync conflicts, repeated appends — Issue #137) get an
  // index suffix to guarantee the {#each} block's key uniqueness. Messages
  // without a uuid fall back to an index-only key.
  const messageKeys = $derived.by(() => {
    const seen = new Set<string>()
    return messages.map((msg, i) => {
      if (!msg.uuid) return `idx-${i}`
      if (!seen.has(msg.uuid)) {
        seen.add(msg.uuid)
        return msg.uuid
      }
      return `${msg.uuid}-${i}`
    })
  })
</script>

<section
  class="bg-gh-bg-secondary overflow-hidden flex flex-col {fullWidth
    ? ''
    : 'border border-gh-border rounded-lg'}"
>
  <div class="{enableScroll ? 'overflow-y-auto' : ''} flex-1 p-4 flex flex-col gap-4">
    {#each messages as msg, i (messageKeys[i])}
      <MessageItem
        {msg}
        {sessionId}
        isFirst={i === 0 || i === firstMeaningfulIndex}
        onDelete={onDeleteMessage}
        onEdit={onEditMessage}
        {onEditTitle}
        onSplit={onSplitSession}
      />
    {/each}
  </div>
</section>
