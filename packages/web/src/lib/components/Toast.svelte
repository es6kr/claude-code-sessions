<script lang="ts">
  import { onDestroy } from 'svelte'

  interface Props {
    message: string | null
    variant?: 'success' | 'error' | 'info' | 'warning'
    duration?: number
  }

  let { message = $bindable(), variant = 'success', duration = 3000 }: Props = $props()

  let timeout: ReturnType<typeof setTimeout> | null = null

  const variantClasses = {
    success: 'bg-gh-green/90',
    error: 'bg-gh-red/90',
    info: 'bg-gh-accent/90',
    warning: 'bg-yellow-600/90',
  }

  $effect(() => {
    if (message) {
      if (timeout) clearTimeout(timeout)
      timeout = setTimeout(() => (message = null), duration)
    }
  })

  onDestroy(() => {
    if (timeout) clearTimeout(timeout)
  })
</script>

{#if message}
  <div
    class="fixed bottom-4 left-1/2 -translate-x-1/2 text-white px-4 py-2 rounded-lg shadow-lg z-50 flex items-center gap-3 animate-fade-in {variantClasses[
      variant
    ]}"
  >
    <span>{message}</span>
    <button
      onclick={() => (message = null)}
      class="text-white/70 hover:text-white transition-colors"
      title="Dismiss"
    >
      ✕
    </button>
  </div>
{/if}

<style>
  @keyframes fade-in {
    from {
      opacity: 0;
      transform: translateX(-50%) translateY(10px);
    }
    to {
      opacity: 1;
      transform: translateX(-50%) translateY(0);
    }
  }
  .animate-fade-in {
    animation: fade-in 0.2s ease-out;
  }
</style>
