<script lang="ts">
  import '../app.css'
  import { onMount } from 'svelte'
  import type { Snippet } from 'svelte'
  import * as api from '$lib/api'

  let { children }: { children: Snippet } = $props()

  let version = $state('')
  let cleaning = $state(false)
  let shuttingDown = $state(false)
  let showCleanupModal = $state(false)
  let cleanupPreview = $state<api.CleanupPreview[] | null>(null)
  let cleanupResult = $state<{
    success: boolean
    deletedCount: number
    removedMessageCount: number
    deletedOrphanAgentCount: number
    deletedOrphanTodoCount: number
  } | null>(null)

  // Cleanup options
  let clearEmpty = $state(true)
  let skipWithTodos = $state(true)
  let clearOrphanAgents = $state(false)
  let clearOrphanTodos = $state(false)

  // Computed totals
  let totalEmpty = $derived(
    cleanupPreview?.reduce((sum, p) => sum + p.emptySessions.length, 0) ?? 0
  )
  let totalWithTodos = $derived(
    cleanupPreview?.reduce((sum, p) => sum + p.emptyWithTodosCount, 0) ?? 0
  )
  let totalOrphanAgents = $derived(
    cleanupPreview?.reduce((sum, p) => sum + p.orphanAgentCount, 0) ?? 0
  )
  let totalOrphanTodos = $derived(
    cleanupPreview?.reduce((sum, p) => sum + p.orphanTodoCount, 0) ?? 0
  )
  let effectiveDeleteCount = $derived(skipWithTodos ? totalEmpty - totalWithTodos : totalEmpty)

  onMount(async () => {
    try {
      const res = await api.getVersion()
      version = res.version
    } catch {
      version = 'unknown'
    }
  })

  const handleShutdown = async () => {
    if (!confirm('Shutdown the server?')) return

    shuttingDown = true
    try {
      await api.shutdown()
    } catch {
      // Server is shutting down, connection will be lost
    }
  }

  const openCleanupModal = async () => {
    try {
      cleanupPreview = await api.previewCleanup()
      showCleanupModal = true
    } catch (e) {
      alert(`Error: ${e}`)
    }
  }

  const closeCleanupModal = () => {
    showCleanupModal = false
    cleanupPreview = null
  }

  const executeCleanup = async () => {
    if (effectiveDeleteCount === 0 && !clearOrphanAgents && !clearOrphanTodos) {
      alert('Nothing to clean up')
      return
    }

    cleaning = true
    try {
      cleanupResult = await api.clearSessions({
        clearEmpty,
        clearInvalid: false,
        skipWithTodos,
        clearOrphanAgents,
        clearOrphanTodos,
      })
      showCleanupModal = false
      cleanupPreview = null
      setTimeout(() => {
        cleanupResult = null
        window.location.reload()
      }, 2000)
    } catch (e) {
      alert(`Error: ${e}`)
    } finally {
      cleaning = false
    }
  }
</script>

<svelte:head>
  <title>Claude Session Manager</title>
</svelte:head>

<div class="min-h-screen flex flex-col bg-gh-bg text-gh-text">
  <header
    class="bg-gh-bg-secondary border-b border-gh-border px-8 py-4 flex justify-between items-center"
  >
    <div class="flex items-center gap-3">
      <h1 class="text-2xl font-semibold">Claude Session Manager</h1>
      {#if version}
        <span class="text-xs text-gh-text-secondary bg-gh-border px-2 py-0.5 rounded"
          >v{version}</span
        >
      {/if}
    </div>
    <div class="flex gap-2">
      <button
        class="bg-gh-border-subtle border border-gh-border text-gh-text px-4 py-2 rounded-md text-sm transition-colors hover:bg-gh-border hover:border-gh-text-secondary disabled:opacity-50 disabled:cursor-not-allowed"
        onclick={openCleanupModal}
        disabled={cleaning}
      >
        {cleaning ? 'Cleaning...' : 'Cleanup'}
      </button>
      <button
        class="bg-gh-red border border-gh-red text-white px-4 py-2 rounded-md text-sm transition-colors hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
        onclick={handleShutdown}
        disabled={shuttingDown}
      >
        {shuttingDown ? 'Shutting down...' : 'Shutdown'}
      </button>
    </div>
  </header>

  <main class="flex-1 p-8 max-w-7xl mx-auto w-full">
    {@render children()}
  </main>
</div>

<!-- Cleanup Modal -->
{#if showCleanupModal && cleanupPreview}
  <div
    class="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
    onclick={(e) => e.target === e.currentTarget && closeCleanupModal()}
    role="dialog"
    aria-modal="true"
    aria-labelledby="cleanup-modal-title"
  >
    <div class="bg-gh-bg-secondary border border-gh-border rounded-lg p-6 w-[400px] shadow-xl">
      <h2 id="cleanup-modal-title" class="text-lg font-semibold mb-4">Cleanup Options</h2>

      <div class="space-y-3">
        <!-- Clear Empty Sessions -->
        <label class="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            bind:checked={clearEmpty}
            class="w-4 h-4 rounded border-gh-border bg-gh-bg text-gh-green focus:ring-gh-green"
          />
          <span class="flex-1">
            Delete empty sessions
            <span class="text-gh-text-secondary">({totalEmpty})</span>
          </span>
        </label>

        <!-- Skip With Todos (indented, disabled if clearEmpty is false) -->
        <label class="flex items-center gap-3 cursor-pointer ml-6" class:opacity-50={!clearEmpty}>
          <input
            type="checkbox"
            bind:checked={skipWithTodos}
            disabled={!clearEmpty}
            class="w-4 h-4 rounded border-gh-border bg-gh-bg text-gh-green focus:ring-gh-green disabled:opacity-50"
          />
          <span class="flex-1">
            Skip sessions with todos
            <span class="text-gh-text-secondary">({totalWithTodos})</span>
          </span>
        </label>

        <!-- Clear Orphan Agents -->
        <label class="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            bind:checked={clearOrphanAgents}
            class="w-4 h-4 rounded border-gh-border bg-gh-bg text-gh-green focus:ring-gh-green"
          />
          <span class="flex-1">
            Delete orphan agents
            <span class="text-gh-text-secondary">({totalOrphanAgents})</span>
          </span>
        </label>

        <!-- Clear Orphan Todos -->
        <label class="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            bind:checked={clearOrphanTodos}
            class="w-4 h-4 rounded border-gh-border bg-gh-bg text-gh-green focus:ring-gh-green"
          />
          <span class="flex-1">
            Delete orphan todos
            <span class="text-gh-text-secondary">({totalOrphanTodos})</span>
          </span>
        </label>
      </div>

      <!-- Summary -->
      <div class="mt-4 pt-4 border-t border-gh-border text-sm text-gh-text-secondary">
        {#if clearEmpty}
          Will delete {effectiveDeleteCount} session{effectiveDeleteCount !== 1 ? 's' : ''}
          {#if skipWithTodos && totalWithTodos > 0}
            (skipping {totalWithTodos} with todos)
          {/if}
        {/if}
        {#if clearOrphanAgents && totalOrphanAgents > 0}
          {#if clearEmpty},{/if}
          {totalOrphanAgents} orphan agent{totalOrphanAgents !== 1 ? 's' : ''}
        {/if}
        {#if clearOrphanTodos && totalOrphanTodos > 0}
          {#if clearEmpty || clearOrphanAgents},{/if}
          {totalOrphanTodos} orphan todo{totalOrphanTodos !== 1 ? 's' : ''}
        {/if}
        {#if !clearEmpty && !clearOrphanAgents && !clearOrphanTodos}
          Nothing selected
        {/if}
      </div>

      <!-- Buttons -->
      <div class="flex gap-2 mt-6 justify-end">
        <button
          class="px-4 py-2 text-sm rounded-md border border-gh-border hover:bg-gh-border-subtle"
          onclick={closeCleanupModal}
        >
          Cancel
        </button>
        <button
          class="px-4 py-2 text-sm rounded-md bg-gh-red text-white hover:bg-red-700 disabled:opacity-50"
          onclick={executeCleanup}
          disabled={cleaning ||
            (effectiveDeleteCount === 0 && !clearOrphanAgents && !clearOrphanTodos)}
        >
          {cleaning ? 'Cleaning...' : 'Execute Cleanup'}
        </button>
      </div>
    </div>
  </div>
{/if}

{#if cleanupResult}
  <div class="fixed bottom-4 right-4 bg-gh-green text-white px-5 py-3 rounded-md text-sm z-50">
    {#if cleanupResult.removedMessageCount > 0}
      Removed {cleanupResult.removedMessageCount} invalid messages.
    {/if}
    {#if cleanupResult.deletedCount > 0}
      Deleted {cleanupResult.deletedCount} empty sessions.
    {/if}
    {#if cleanupResult.deletedOrphanAgentCount > 0}
      Deleted {cleanupResult.deletedOrphanAgentCount} orphan agents.
    {/if}
    {#if cleanupResult.deletedOrphanTodoCount > 0}
      Deleted {cleanupResult.deletedOrphanTodoCount} orphan todos.
    {/if}
  </div>
{/if}
