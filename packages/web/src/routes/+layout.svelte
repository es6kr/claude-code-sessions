<script lang="ts">
  import '../app.css'
  import { onMount } from 'svelte'
  import { goto } from '$app/navigation'
  import { page } from '$app/state'
  import type { Snippet } from 'svelte'
  import * as api from '$lib/api'
  import { appConfig } from '$lib/stores/config'

  let { children }: { children: Snippet } = $props()

  // Check if we're on a session page for search context
  const isSessionPage = $derived(page.url.pathname.startsWith('/session/'))

  // Convert project name to display path (e.g., "-Users-david-works--vscode" -> "~/works/.vscode")
  const formatProjectPath = (projectName: string): string => {
    // Replace -- with a placeholder, then - with /, then restore .
    const placeholder = '___DOT___'
    let path = projectName
      .replace(/--/g, placeholder) // Double dash -> placeholder for dot
      .replace(/-/g, '/') // Single dash -> slash
      .replace(new RegExp(placeholder, 'g'), '/.') // Restore dots (add slash before)
    // Convert /Users/username/... to ~/...
    const homeMatch = path.match(/^\/Users\/[^/]+\/(.+)$/)
    if (homeMatch) return `~/${homeMatch[1]}`
    return path
  }
  const currentSessionInfo = $derived.by(() => {
    if (!isSessionPage) return null
    const match = page.url.pathname.match(/^\/session\/([^/]+)\/([^/]+)/)
    if (!match) return null
    return { projectName: decodeURIComponent(match[1]), sessionId: decodeURIComponent(match[2]) }
  })

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
      appConfig.set({
        version: res.version,
        homeDir: res.homeDir,
        currentProjectName: res.currentProjectName,
      })
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

  // Sort results to prioritize current session when on session page
  const sortResultsWithCurrentSession = (results: api.SearchResult[]): api.SearchResult[] => {
    const sessionInfo = currentSessionInfo
    if (!sessionInfo) return results

    return [...results].sort((a, b) => {
      const aIsCurrent =
        a.projectName === sessionInfo.projectName && a.sessionId === sessionInfo.sessionId
      const bIsCurrent =
        b.projectName === sessionInfo.projectName && b.sessionId === sessionInfo.sessionId
      if (aIsCurrent && !bIsCurrent) return -1
      if (!aIsCurrent && bIsCurrent) return 1
      return 0
    })
  }

  const performSearch = async (query: string) => {
    if (!query.trim()) return

    const sessionInfo = currentSessionInfo

    // Phase 1: Title search (fast) - prioritize current session's project
    searchingTitle = true
    showSearchDropdown = true
    try {
      const titleResults = await api.searchSessions(query, {
        searchContent: false,
        project: sessionInfo?.projectName,
      })
      searchResults = sortResultsWithCurrentSession(titleResults)
    } catch (e) {
      console.error('Title search error:', e)
    } finally {
      searchingTitle = false
    }

    // Phase 2: Content search (slow, runs in background) - search current session's project first
    searchingContent = true
    try {
      // If on session page, search current project first for faster results
      if (sessionInfo) {
        const projectResults = await api.searchSessions(query, {
          searchContent: true,
          project: sessionInfo.projectName,
        })
        const titleIds = new Set(searchResults.map((r) => `${r.projectName}:${r.sessionId}`))
        const contentOnly = projectResults.filter(
          (r) => !titleIds.has(`${r.projectName}:${r.sessionId}`)
        )
        searchResults = sortResultsWithCurrentSession([...searchResults, ...contentOnly])
      }

      // Then search all projects
      const allResults = await api.searchSessions(query, { searchContent: true })
      // Merge results, keeping title matches first
      const existingIds = new Set(searchResults.map((r) => `${r.projectName}:${r.sessionId}`))
      const newResults = allResults.filter(
        (r) => !existingIds.has(`${r.projectName}:${r.sessionId}`)
      )
      searchResults = sortResultsWithCurrentSession([...searchResults, ...newResults])
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
    // Use path-based routing for proper navigation
    goto(
      `/session/${encodeURIComponent(result.projectName)}/${encodeURIComponent(result.sessionId)}`
    )
  }

  const closeSearchDropdown = () => {
    // Delay to allow click on result
    setTimeout(() => {
      showSearchDropdown = false
    }, 200)
  }
</script>

<svelte:head>
  <title>Claude Sessions</title>
</svelte:head>

<div class="min-h-screen flex flex-col bg-gh-bg text-gh-text">
  <header
    class="bg-gh-bg-secondary border-b border-gh-border px-8 py-4 flex justify-between items-center"
  >
    <div class="flex items-center gap-3">
      <a
        href={currentSessionInfo
          ? `/#project=${encodeURIComponent(currentSessionInfo.projectName)}`
          : '/'}
        class="flex items-center gap-2 hover:text-gh-accent"
        title={currentSessionInfo ? 'Back to project' : 'Claude Sessions'}
      >
        <!-- Terminal/Session icon -->
        <svg class="w-6 h-6 text-gh-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
          />
        </svg>
        <span class="text-2xl font-semibold hidden sm:inline">Claude Sessions</span>
      </a>
      {#if version}
        <span
          class="text-xs text-gh-text-secondary bg-gh-border px-2 py-0.5 rounded hidden sm:inline"
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
            <circle
              class="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              stroke-width="4"
              fill="none"
            />
            <path
              class="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
        </div>
      {/if}

      <!-- Search Dropdown -->
      {#if showSearchDropdown && (searchResults.length > 0 || searchingTitle)}
        <div
          class="absolute top-full left-0 right-0 mt-1 bg-gh-bg-secondary border border-gh-border rounded-md shadow-lg max-h-80 overflow-y-auto z-50"
        >
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
                  <span
                    class="text-xs px-1.5 py-0.5 rounded {result.matchType === 'title'
                      ? 'bg-gh-green/20 text-gh-green'
                      : 'bg-gh-accent/20 text-gh-accent'}"
                  >
                    {result.matchType === 'title' ? 'Title' : 'Content'}
                  </span>
                  <span class="text-xs text-gh-text-secondary truncate flex-shrink-0 max-w-[120px]"
                    >{formatProjectPath(result.projectName)}</span
                  >
                  <span class="text-sm font-medium truncate">{result.title}</span>
                </div>
                {#if result.snippet}
                  <div class="text-xs text-gh-text-secondary mt-1 line-clamp-2">
                    {result.snippet}
                  </div>
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

  <main class="flex-1 {isSessionPage ? '' : 'p-8 max-w-7xl mx-auto'} w-full overflow-y-auto">
    {@render children()}
  </main>
</div>

<!-- Cleanup Modal -->
{#if showCleanupModal && cleanupPreview}
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <!-- svelte-ignore a11y_interactive_supports_focus -->
  <div
    class="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
    onclick={(e) => e.target === e.currentTarget && closeCleanupModal()}
    onkeydown={(e) => e.key === 'Escape' && closeCleanupModal()}
    role="dialog"
    aria-modal="true"
    aria-labelledby="cleanup-modal-title"
  >
    <div
      class="bg-gh-bg-secondary border border-gh-border rounded-lg p-6 w-[400px] shadow-xl text-gh-text"
    >
      <h2 id="cleanup-modal-title" class="text-lg font-semibold mb-4">Cleanup Options</h2>

      <div class="space-y-3 text-gh-text">
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

        <!-- Preserve With Todos (indented, disabled if clearEmpty is false) -->
        <label class="flex items-center gap-3 cursor-pointer ml-6" class:opacity-50={!clearEmpty}>
          <input
            type="checkbox"
            bind:checked={skipWithTodos}
            disabled={!clearEmpty}
            class="w-4 h-4 rounded border-gh-border bg-gh-bg text-gh-green focus:ring-gh-green disabled:opacity-50"
          />
          <span class="flex-1">
            Preserve sessions with todos
            <span class="text-gh-text-secondary"
              >({totalWithTodos > 0 ? `-${totalWithTodos}` : '0'})</span
            >
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
