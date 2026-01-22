<script lang="ts">
  import type { Message } from '$lib/api'
  import MessageItem from './MessageItem.svelte'

  interface Props {
    sessionId: string
    messages: Message[]
    onDeleteMessage: (msg: Message) => void
    onEditTitle?: (msg: Message) => void
    onSplitSession?: (msg: Message) => void
    enableScroll?: boolean
    fullWidth?: boolean
  }

  let {
    sessionId,
    messages,
    onDeleteMessage,
    onEditTitle,
    onSplitSession,
    enableScroll = true,
    fullWidth = false,
  }: Props = $props()

  // Find index of first meaningful message (user/assistant, not metadata)
  const firstMeaningfulIndex = $derived(
    messages.findIndex((m) => m.type === 'user' || m.type === 'assistant' || m.type === 'human')
  )
</script>

<section
  class="bg-gh-bg-secondary overflow-hidden flex flex-col {fullWidth
    ? ''
    : 'border border-gh-border rounded-lg'}"
>
  <div class="{enableScroll ? 'overflow-y-auto' : ''} flex-1 p-4 flex flex-col gap-4">
    {#each messages as msg, i (msg.uuid ?? `idx-${i}`)}
      <MessageItem
        {msg}
        {sessionId}
        isFirst={i === 0 || i === firstMeaningfulIndex}
        onDelete={onDeleteMessage}
        {onEditTitle}
        onSplit={onSplitSession}
      />
    {/each}
  </div>
</section>
