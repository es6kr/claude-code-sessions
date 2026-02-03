<script lang="ts">
  import { computePosition, offset, shift, flip } from '@floating-ui/dom'
  import type { Snippet } from 'svelte'

  interface Props {
    content: string
    children: Snippet
    class?: string
  }

  let { content, children, class: className = '' }: Props = $props()

  let showTooltip = $state(false)
  let tooltipEl = $state<HTMLDivElement | null>(null)
  let mouseX = $state(0)
  let mouseY = $state(0)

  const updatePosition = async () => {
    if (!tooltipEl) return

    // Virtual element at mouse position
    const virtualEl = {
      getBoundingClientRect: () => ({
        width: 0,
        height: 0,
        x: mouseX,
        y: mouseY,
        top: mouseY,
        left: mouseX,
        right: mouseX,
        bottom: mouseY,
      }),
    }

    const { x, y } = await computePosition(virtualEl, tooltipEl, {
      placement: 'bottom-start',
      middleware: [offset(8), flip(), shift({ padding: 8 })],
    })

    tooltipEl.style.left = `${x}px`
    tooltipEl.style.top = `${y}px`
  }

  const handleMouseMove = (e: MouseEvent) => {
    mouseX = e.clientX
    mouseY = e.clientY
    if (showTooltip) {
      updatePosition()
    }
  }

  const handleMouseEnter = (e: MouseEvent) => {
    mouseX = e.clientX
    mouseY = e.clientY
    showTooltip = true
    requestAnimationFrame(updatePosition)
  }

  const handleMouseLeave = () => {
    showTooltip = false
  }
</script>

<div
  class={className}
  onmouseenter={handleMouseEnter}
  onmouseleave={handleMouseLeave}
  onmousemove={handleMouseMove}
  role="button"
  tabindex="-1"
>
  {@render children()}
</div>

{#if showTooltip}
  <div bind:this={tooltipEl} class="floating-tooltip">
    {content}
  </div>
{/if}

<style>
  .floating-tooltip {
    position: fixed;
    padding: 0.5rem 0.75rem;
    font-size: 0.875rem;
    white-space: pre-line;
    word-break: break-word;
    border-radius: 0.25rem;
    background-color: #1c2128;
    color: #c9d1d9;
    border: 1px solid #30363d;
    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
    pointer-events: none;
    z-index: 9999;
    max-width: 500px;
  }
</style>
