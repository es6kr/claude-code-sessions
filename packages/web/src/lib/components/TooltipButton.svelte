<script lang="ts">
  import type { Snippet } from 'svelte'
  import type { HTMLButtonAttributes } from 'svelte/elements'

  interface Props extends HTMLButtonAttributes {
    title: string
    children: Snippet
    position?: 'top' | 'bottom'
    class?: string
  }

  let {
    title,
    children,
    position = 'bottom',
    class: className = '',
    ...buttonProps
  }: Props = $props()

  let buttonEl = $state<HTMLButtonElement | null>(null)
  let showTooltip = $state(false)
  let tooltipStyle = $state('')

  const updateTooltipPosition = () => {
    if (!buttonEl) return
    const rect = buttonEl.getBoundingClientRect()
    const left = rect.left + rect.width / 2
    if (position === 'top') {
      tooltipStyle = `left: ${left}px; bottom: ${window.innerHeight - rect.top + 8}px;`
    } else {
      tooltipStyle = `left: ${left}px; top: ${rect.bottom + 8}px;`
    }
  }

  const handleMouseEnter = () => {
    updateTooltipPosition()
    showTooltip = true
  }

  const handleMouseLeave = () => {
    showTooltip = false
  }
</script>

<button
  bind:this={buttonEl}
  class="tooltip-btn {className}"
  onmouseenter={handleMouseEnter}
  onmouseleave={handleMouseLeave}
  {...buttonProps}
>
  {@render children()}
</button>

{#if showTooltip}
  <span class="tooltip" style={tooltipStyle}>
    {title}
  </span>
{/if}

<style>
  .tooltip-btn {
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: none;
    cursor: pointer;
    padding: 0;
  }
  .tooltip {
    position: fixed;
    transform: translateX(-50%);
    padding: 0.25rem 0.5rem;
    font-size: 0.75rem;
    white-space: nowrap;
    border-radius: 0.25rem;
    background-color: #1c2128;
    color: #c9d1d9;
    border: 1px solid #30363d;
    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
    pointer-events: none;
    z-index: 9999;
  }
</style>
