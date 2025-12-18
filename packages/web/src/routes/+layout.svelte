<script lang="ts">
  import '../app.css'
  import { onMount } from 'svelte'
  import { goto } from '$app/navigation'
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

  // Search state
  let searchQuery = $state('')
  let searchResults = $state<api.SearchResult[]>([])
  let searchingTitle = $state(false)
  let searchingContent = $state(false)
  let showSearchDropdown = $state(false)
  let searchDebounceTimer: ReturnType<typeof setTimeout> | null = null

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

  // Search functions
  const handleSearchInput = (e: Event) => {
    const query = (e.target as HTMLInputElement).value
    searchQuery = query

    if (searchDebounceTimer) clearTimeout(searchDebounceTimer)

    if (!query.trim()) {
      searchResults = []
      showSearchDropdown = false
      return
    }

    // Debounce: search after 300ms of no typing
    searchDebounceTimer = setTimeout(() => performSearch(query), 300)
  }

  const performSearch = async (query: string) => {
    if (!query.trim()) return

    // Phase 1: Title search (fast)
    searchingTitle = true
    showSearchDropdown = true
    try {
      const titleResults = await api.searchSessions(query, { searchContent: false })
      searchResults = titleResults
    } catch (e) {
      console.error('Title search error:', e)
    } finally {
      searchingTitle = false
    }

    // Phase 2: Content search (slow, runs in background)
    searchingContent = true
    try {
      const allResults = await api.searchSessions(query, { searchContent: true })
      // Merge results, keeping title matches first
      const titleIds = new Set(searchResults.map((r) => `${r.projectName}:${r.sessionId}`))
      const contentOnly = allResults.filter((r) => !titleIds.has(`${r.projectName}:${r.sessionId}`))
      searchResults = [...searchResults, ...contentOnly]
    } catch (e) {
      console.error('Content search error:', e)
    } finally {
      searchingContent = false
    }
  }

  const selectSearchResult = (result: api.SearchResult) => {
    searchQuery = ''
    searchResults = []
    showSearchDropdown = false
    goto(`/#project=${encodeURIComponent(result.projectName)}&session=${encodeURIComponent(result.sessionId)}`)
  }

  const closeSearchDropdown = () => {
    // Delay to allow click on result
    setTimeout(() => {
      showSearchDropdown = false
    }, 200)
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
      <a href="/" class="text-2xl font-semibold hover:text-gh-accent">Claude Session Manager</a>
      {#if version}
        <span class="text-xs text-gh-text-secondary bg-gh-border px-2 py-0.5 rounded"
          >v{version}</span
        >
      {/if}
    </div>

    <!-- Search -->
    <div class="relative flex-1 max-w-md mx-8">
      <input
        type="text"
        placeholder="Search sessions..."
        value={searchQuery}
        oninput={handleSearchInput}
        onfocus={() => searchQuery && (showSearchDropdown = true)}
        onblur={closeSearchDropdown}
        class="w-full px-4 py-2 bg-gh-bg border border-gh-border rounded-md text-sm focus:outline-none focus:border-gh-accent"
      />
      {#if searchingTitle || searchingContent}
        <div class="absolute right-3 top-1/2 -translate-y-1/2">
          <svg class="animate-spin h-4 w-4 text-gh-text-secondary" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" fill="none" />
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
        </div>
      {/if}

      <!-- Search Dropdown -->
      {#if showSearchDropdown && (searchResults.length > 0 || searchingTitle)}
        <div class="absolute top-full left-0 right-0 mt-1 bg-gh-bg-secondary border border-gh-border rounded-md shadow-lg max-h-80 overflow-y-auto z-50">
          {#if searchResults.length === 0 && searchingTitle}
            <div class="px-4 py-3 text-sm text-gh-text-secondary">Searching...</div>
          {:else if searchResults.length === 0}
            <div class="px-4 py-3 text-sm text-gh-text-secondary">No results found</div>
          {:else}
            {#each searchResults as result}
              <button
                class="w-full text-left px-4 py-2 hover:bg-gh-border-subtle border-b border-gh-border last:border-b-0"
                onclick={() => selectSearchResult(result)}
              >
                <div class="flex items-center gap-2">
                  <span class="text-xs px-1.5 py-0.5 rounded {result.matchType === 'title' ? 'bg-gh-green/20 text-gh-green' : 'bg-gh-accent/20 text-gh-accent'}">
                    {result.matchType === 'title' ? 'Title' : 'Content'}
                  </span>
                  <span class="text-sm font-medium truncate">{result.title}</span>
                </div>
                <div class="text-xs text-gh-text-secondary mt-0.5 truncate">
                  {result.projectName.split('-').slice(-2).join('/')}
                </div>
                {#if result.snippet}
                  <div class="text-xs text-gh-text-secondary mt-1 line-clamp-2">{result.snippet}</div>
                {/if}
              </button>
            {/each}
            {#if searchingContent}
              <div class="px-4 py-2 text-xs text-gh-text-secondary border-t border-gh-border">
                Searching content...
              </div>
            {/if}
          {/if}
        </div>
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
