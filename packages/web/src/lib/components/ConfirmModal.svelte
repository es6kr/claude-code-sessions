<script lang="ts">
  interface Props {
    show: boolean
    title: string
    message: string
    confirmText?: string
    cancelText?: string
    variant?: 'danger' | 'default'
    onConfirm: () => void
    onCancel: () => void
  }

  let {
    show,
    title,
    message,
    confirmText = 'Confirm',
    cancelText = 'Cancel',
    variant = 'default',
    onConfirm,
    onCancel,
  }: Props = $props()

  const handleKeydown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') onCancel()
    if (e.key === 'Enter') onConfirm()
  }
</script>

{#if show}
  <div
    class="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
    onclick={(e) => e.target === e.currentTarget && onCancel()}
    onkeydown={handleKeydown}
    role="dialog"
    aria-modal="true"
  >
    <div
      class="bg-gh-bg-secondary border border-gh-border rounded-lg p-6 w-[380px] shadow-xl text-gh-text"
    >
      <h2 class="text-lg font-semibold mb-3">{title}</h2>
      <p class="text-sm text-gh-text-secondary mb-6 whitespace-pre-wrap">{message}</p>
      <div class="flex gap-2 justify-end">
        <button
          class="px-4 py-2 text-sm rounded-md border border-gh-border hover:bg-gh-border-subtle"
          onclick={onCancel}
        >
          {cancelText}
        </button>
        <button
          class="px-4 py-2 text-sm rounded-md {variant === 'danger'
            ? 'bg-gh-red text-white hover:bg-red-700'
            : 'bg-gh-accent text-white hover:bg-blue-700'}"
          onclick={onConfirm}
        >
          {confirmText}
        </button>
      </div>
    </div>
  </div>
{/if}
