<script lang="ts">
  interface Props {
    title: string
    class?: string
  }

  let { title, class: className = '' }: Props = $props()

  // Parse slash command: "/command args" -> { command: "/command", args: "args" }
  const parsed = $derived(() => {
    if (!title.startsWith('/')) return null
    const spaceIndex = title.indexOf(' ')
    if (spaceIndex === -1) return { command: title, args: '' }
    return {
      command: title.slice(0, spaceIndex),
      args: title.slice(spaceIndex + 1),
    }
  })
</script>

{#if parsed()}
  <span class={className}
    ><span class="text-gh-accent">{parsed()!.command}</span>{#if parsed()!.args}{' '}<span
        class="text-gh-text-secondary">{parsed()!.args}</span
      >{/if}</span
  >
{:else}
  <span class={className}>{title}</span>
{/if}
