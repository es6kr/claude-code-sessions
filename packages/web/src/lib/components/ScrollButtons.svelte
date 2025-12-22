<script lang="ts">
  import type { Message } from '$lib/api'

  interface Props {
    messages: Message[]
    scrollContainer: HTMLElement | null | undefined
    class?: string
  }

  let { messages, scrollContainer, class: className = '' }: Props = $props()

  // Find last compact summary (context continuation point)
  const lastCompactIndex = $derived.by(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if ((messages[i] as Message & { isCompactSummary?: boolean }).isCompactSummary) {
        return i
      }
    }
    return -1
  })

  const scrollToTop = () => {
    scrollContainer?.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const scrollToBottom = () => {
    if (!scrollContainer) return
    scrollContainer.scrollTo({ top: scrollContainer.scrollHeight + 10000, behavior: 'smooth' })
  }

  const scrollToCompact = () => {
    if (lastCompactIndex < 0 || !scrollContainer) return
    const msgId = messages[lastCompactIndex].uuid ?? `idx-${lastCompactIndex}`
    const element = scrollContainer.querySelector(`[data-msg-id="${msgId}"]`)
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }
</script>

{#if messages.length > 0}
  <div class="flex gap-1 {className}">
    <button
      class="px-2 py-1 text-xs rounded border border-gh-border hover:bg-gh-border-subtle
             text-gh-text-secondary hover:text-gh-text transition-colors bg-gh-bg"
      onclick={scrollToTop}
      title="Go to top"
    >
      ↑ Top
    </button>
    {#if lastCompactIndex >= 0}
      <button
        class="px-2 py-1 text-xs rounded border border-gh-border hover:bg-gh-border-subtle
               text-gh-text-secondary hover:text-gh-text transition-colors bg-gh-bg"
        onclick={scrollToCompact}
        title="Jump to last compacted point (context continuation)"
      >
        📍 Last Compacted
      </button>
    {/if}
    <button
      class="px-2 py-1 text-xs rounded border border-gh-border hover:bg-gh-border-subtle
             text-gh-text-secondary hover:text-gh-text transition-colors bg-gh-bg"
      onclick={scrollToBottom}
      title="Go to bottom"
    >
      ↓ Bottom
    </button>
  </div>
{/if}
