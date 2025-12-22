<script lang="ts">
  import { onMount } from 'svelte'
  import { page } from '$app/state'
  import * as api from '$lib/api'
  import type { Message, SessionMeta, TodoItem, AgentInfo } from '$lib/api'
  import { SessionViewer } from '$lib/components'

  // State
  let session = $state<SessionMeta | null>(null)
  let messages = $state<Message[]>([])
  let todos = $state<TodoItem[]>([])
  let agents = $state<AgentInfo[]>([])
  let loading = $state(true)
  let error = $state<string | null>(null)
  let projectDisplayName = $state<string>('')
  let customTitle = $state<string | undefined>(undefined)
  let currentSummary = $state<string | undefined>(undefined)

  // Scroll container for SessionViewer
  let scrollContainer: HTMLDivElement | undefined = $state()

  // Get params from URL
  const projectName = $derived(decodeURIComponent(page.params.project ?? ''))
  const sessionId = $derived(decodeURIComponent(page.params.id ?? ''))

  // Display title: customTitle > currentSummary (truncated) > session.title > 'Untitled'
  const displayTitle = $derived(
    customTitle ??
      (currentSummary && currentSummary.length > 50
        ? currentSummary.slice(0, 47) + '...'
        : currentSummary) ??
      session?.title ??
      'Untitled'
  )

  // Load session data
  const loadSession = async () => {
    loading = true
    error = null
    try {
      // Load projects to get displayName (real path)
      const projects = await api.listProjects()
      const project = projects.find((p) => p.name === projectName)
      projectDisplayName = project?.displayName ?? projectName

      // Load sessions to get metadata
      const sessions = await api.listSessions(projectName)
      session = sessions.find((s) => s.id === sessionId) ?? {
        id: sessionId,
        projectName: projectName,
        title: sessionId,
        messageCount: 0,
        updatedAt: new Date().toISOString(),
      }

      // Load messages
      messages = await api.getSession(projectName, sessionId)

      // Load session tree data for todos, agents, and summary info
      const sessionData = await api.getSessionTreeData(projectName, sessionId)
      // Flatten session todos and agent todos
      const sessionTodos = sessionData.todos?.sessionTodos ?? []
      const agentTodoItems = sessionData.todos?.agentTodos?.flatMap((a) => a.todos) ?? []
      todos = [...sessionTodos, ...agentTodoItems]
      agents = sessionData.agents ?? []
      customTitle = sessionData.customTitle
      currentSummary = sessionData.currentSummary
    } catch (e) {
      error = String(e)
    } finally {
      loading = false
    }
  }

  // Event handlers (read-only in standalone view)
  const handleDeleteMessage = async (msg: Message) => {
    if (!session || !confirm('Delete this message?')) return

    const msgId = msg.uuid || msg.messageId
    if (!msgId) return

    try {
      await api.deleteMessage(session.projectName, session.id, msgId)
      messages = messages.filter((m) => (m.uuid || m.messageId) !== msgId)
    } catch (e) {
      error = String(e)
    }
  }

  const handleEditTitle = async (msg: Message) => {
    if (!session) return

    const currentTitle = (msg as Message & { customTitle?: string }).customTitle ?? ''
    const newTitle = prompt('Enter new custom title:', currentTitle)
    if (newTitle === null || newTitle === currentTitle) return

    try {
      await api.updateCustomTitle(session.projectName, session.id, msg.uuid, newTitle)
      ;(msg as Message & { customTitle?: string }).customTitle = newTitle
      messages = [...messages]
    } catch (e) {
      error = String(e)
    }
  }

  const handleSplitSession = async (msg: Message) => {
    if (!session) return

    const msgIndex = messages.findIndex((m) => m.uuid === msg.uuid)
    const remainingCount = msgIndex
    const movingCount = messages.length - msgIndex

    if (
      !confirm(
        `Split session at this message?\n\nThis session will keep ${remainingCount} messages.\nNew session will have ${movingCount} messages.`
      )
    )
      return

    try {
      loading = true
      const result = await api.splitSession(session.projectName, session.id, msg.uuid)

      if (result.success && result.newSessionId) {
        messages = messages.slice(0, msgIndex)
        alert(`Session split successfully!\nNew session ID: ${result.newSessionId}`)
      } else {
        error = result.error ?? 'Failed to split session'
      }
    } catch (e) {
      error = String(e)
    } finally {
      loading = false
    }
  }

  onMount(loadSession)
</script>

<svelte:head>
  <title>{displayTitle} - Claude Sessions</title>
</svelte:head>

<div class="min-h-screen flex flex-col bg-gh-bg">
  <!-- Header with back button -->
  <header class="flex-shrink-0 border-b border-gh-border bg-gh-canvas">
    <div class="flex items-center gap-4 p-4">
      <a
        href={`/#project=${encodeURIComponent(projectName)}`}
        class="text-gh-muted hover:text-gh-fg flex-shrink-0"
        title="Back to project"
      >
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M10 19l-7-7m0 0l7-7m-7 7h18"
          />
        </svg>
      </a>
      <div class="flex-1 min-w-0">
        <h1 class="text-base font-semibold truncate">{displayTitle}</h1>
        <p class="text-sm text-gh-muted truncate">{projectDisplayName}</p>
      </div>
    </div>
  </header>

  <!-- Content -->
  <div bind:this={scrollContainer} class="flex-1 overflow-y-auto">
    {#if loading}
      <div class="flex items-center justify-center h-full">
        <div class="text-gh-muted">Loading...</div>
      </div>
    {:else if error}
      <div class="flex items-center justify-center h-full">
        <div class="text-gh-red">{error}</div>
      </div>
    {:else}
      <SessionViewer
        {session}
        {messages}
        {agents}
        {todos}
        onMessagesChange={(newMessages) => (messages = newMessages)}
        onDeleteMessage={handleDeleteMessage}
        onEditTitle={handleEditTitle}
        onSplitSession={handleSplitSession}
        externalScrollContainer={scrollContainer}
        enableScroll={false}
        fullWidth={true}
        showHeader={false}
      />
    {/if}
  </div>
</div>
