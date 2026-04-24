<script lang="ts">
  import type { Message } from '$lib/api'
  import {
    getMessageCategory,
    MESSAGE_CATEGORY_LABELS,
    DEFAULT_VISIBLE_CATEGORIES,
    type MessageCategory,
  } from '$lib/utils'

  interface Props {
    messages: Message[]
    visibleCategories: Set<MessageCategory>
    onToggle: (category: MessageCategory) => void
    onShowAll: () => void
    onReset: () => void
  }

  let { messages, visibleCategories, onToggle, onShowAll, onReset }: Props = $props()

  const categoryCounts = $derived.by(() => {
    const counts = new Map<MessageCategory, number>()
    for (const msg of messages) {
      const cat = getMessageCategory(msg)
      counts.set(cat, (counts.get(cat) ?? 0) + 1)
    }
    return counts
  })

  const presentCategories = $derived(
    (Object.keys(MESSAGE_CATEGORY_LABELS) as MessageCategory[]).filter(
      (cat) => (categoryCounts.get(cat) ?? 0) > 0
    )
  )

  const isDefault = $derived.by(() => {
    if (visibleCategories.size !== DEFAULT_VISIBLE_CATEGORIES.length) return false
    return DEFAULT_VISIBLE_CATEGORIES.every((c) => visibleCategories.has(c))
  })

  const isAll = $derived(presentCategories.every((c) => visibleCategories.has(c)))
</script>

{#if presentCategories.length > 1}
  <div
    class="flex items-center gap-1.5 px-4 py-2 bg-gh-bg border-b border-gh-border overflow-x-auto"
  >
    <div class="flex items-center gap-1 mr-1">
      <button
        class="px-2 py-0.5 text-xs rounded transition-colors {isAll
          ? 'bg-gh-accent text-white'
          : 'text-gh-text-secondary hover:text-gh-text hover:bg-gh-border-subtle'}"
        onclick={onShowAll}
      >
        All
      </button>
      <button
        class="px-2 py-0.5 text-xs rounded transition-colors {isDefault
          ? 'bg-gh-accent text-white'
          : 'text-gh-text-secondary hover:text-gh-text hover:bg-gh-border-subtle'}"
        onclick={onReset}
      >
        Default
      </button>
    </div>
    <div class="w-px h-4 bg-gh-border"></div>
    <div class="flex items-center gap-1">
      {#each presentCategories as category}
        {@const active = visibleCategories.has(category)}
        {@const count = categoryCounts.get(category) ?? 0}
        <button
          class="px-2 py-0.5 text-xs rounded transition-colors whitespace-nowrap {active
            ? 'bg-gh-accent/20 text-gh-accent border border-gh-accent/40'
            : 'text-gh-text-secondary hover:text-gh-text border border-transparent hover:border-gh-border'}"
          onclick={() => onToggle(category)}
        >
          {MESSAGE_CATEGORY_LABELS[category]}
          <span class="ml-0.5 opacity-60">{count}</span>
        </button>
      {/each}
    </div>
  </div>
{/if}
