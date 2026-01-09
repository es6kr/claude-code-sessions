<script lang="ts">
  import { tick } from 'svelte'

  interface Props {
    show: boolean
    title: string
    label?: string
    placeholder?: string
    initialValue?: string
    confirmText?: string
    cancelText?: string
    onConfirm: (value: string) => void
    onCancel: () => void
  }

  let {
    show,
    title,
    label = '',
    placeholder = '',
    initialValue = '',
    confirmText = 'Save',
    cancelText = 'Cancel',
    onConfirm,
    onCancel,
  }: Props = $props()

  let inputValue = $state(initialValue)
  let inputRef: HTMLInputElement | undefined = $state()

  $effect(() => {
    if (show) {
      inputValue = initialValue
      tick().then(() => {
        inputRef?.focus()
        inputRef?.select()
      })
    }
  })

  const handleSubmit = () => {
    onConfirm(inputValue.trim())
  }

  const handleKeydown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') onCancel()
    if (e.key === 'Enter') handleSubmit()
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
      class="bg-gh-bg-secondary border border-gh-border rounded-lg p-6 w-[400px] shadow-xl text-gh-text"
    >
      <h2 class="text-lg font-semibold mb-4">{title}</h2>
      {#if label}
        <label class="block text-sm text-gh-text-secondary mb-2">{label}</label>
      {/if}
      <input
        bind:this={inputRef}
        bind:value={inputValue}
        type="text"
        {placeholder}
        class="w-full px-3 py-2 text-sm rounded-md border border-gh-border bg-gh-bg focus:outline-none focus:border-gh-accent"
      />
      <div class="flex gap-2 justify-end mt-6">
        <button
          class="px-4 py-2 text-sm rounded-md border border-gh-border hover:bg-gh-border-subtle"
          onclick={onCancel}
        >
          {cancelText}
        </button>
        <button
          class="px-4 py-2 text-sm rounded-md bg-gh-accent text-white hover:bg-blue-700"
          onclick={handleSubmit}
        >
          {confirmText}
        </button>
      </div>
    </div>
  </div>
{/if}
