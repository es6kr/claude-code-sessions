<script lang="ts">
  import { Carta, CartaEditor } from 'carta-md'
  import 'carta-md/default.css'

  interface Props {
    show: boolean
    initialValue: string
    onSave: (value: string) => void
    onCancel: () => void
  }

  let { show, initialValue, onSave, onCancel }: Props = $props()

  let value = $state('')

  const carta = new Carta()

  $effect(() => {
    if (show) {
      value = initialValue
    }
  })

  const handleSave = () => {
    const trimmed = value.trim()
    if (trimmed && trimmed !== initialValue) {
      onSave(trimmed)
    } else {
      onCancel()
    }
  }

  const handleKeydown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      onCancel()
    }
    if (e.key === 's' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault()
      handleSave()
    }
  }
</script>

{#if show}
  <div
    class="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
    onclick={(e) => e.target === e.currentTarget && onCancel()}
    onkeydown={handleKeydown}
    role="dialog"
    aria-modal="true"
    tabindex="-1"
  >
    <div
      class="bg-gh-bg-secondary border border-gh-border rounded-lg p-6 w-[80vw] max-w-4xl h-[70vh] flex flex-col shadow-xl text-gh-text"
    >
      <div class="flex items-center justify-between mb-4">
        <h2 class="text-lg font-semibold">Edit Message</h2>
        <span class="text-xs text-gh-text-secondary">Ctrl+S to save, Esc to cancel</span>
      </div>

      <div class="flex-1 min-h-0 overflow-hidden rounded-md border border-gh-border">
        <CartaEditor {carta} bind:value mode="split" theme="github" />
      </div>

      <div class="flex gap-2 justify-end mt-4">
        <button
          class="px-4 py-2 text-sm rounded-md border border-gh-border hover:bg-gh-border-subtle"
          onclick={onCancel}
        >
          Cancel
        </button>
        <button
          class="px-4 py-2 text-sm rounded-md bg-gh-accent text-white hover:bg-blue-700"
          onclick={handleSave}
        >
          Save
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  :global(.carta-editor) {
    height: 100%;
  }
  :global(.carta-editor .carta-container) {
    height: 100%;
  }
  :global(.carta-editor .carta-input) {
    background: var(--color-gh-bg);
    color: var(--color-gh-text);
  }
  :global(.carta-editor .carta-renderer) {
    background: var(--color-gh-bg);
    color: var(--color-gh-text);
  }
  :global(.carta-toolbar) {
    background: var(--color-gh-bg-secondary);
    border-bottom: 1px solid var(--color-gh-border);
  }
</style>
