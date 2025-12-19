<script lang="ts">
  import { onMount } from 'svelte'
  import { page } from '$app/state'
  import * as api from '$lib/api'
  import type { Message, SessionMeta } from '$lib/api'
  import { MessageList } from '$lib/components'

  // State
  let session = $state<SessionMeta | null>(null)
  let messages = $state<Message[]>([])
  let loading = $state(true)
  let error = $state<string | null>(null)
  let projectDisplayName = $state<string>('')

  // Scroll container for MessageList
  let scrollContainer: HTMLDivElement | undefined = $state()

  // Get params from URL
  const projectName = $derived(decodeURIComponent(page.params.project ?? ''))
  const sessionId = $derived(decodeURIComponent(page.params.id ?? ''))

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
  <title>{session?.title ?? 'Session'} - Claude Sessions</title>
</svelte:head>

<div class="min-h-screen flex flex-col bg-gh-bg">
  <!-- Header with back button -->
  <header class="flex-shrink-0 p-4 border-b border-gh-border bg-gh-canvas">
    <div class="flex items-center gap-4">
      <a href="/" class="text-gh-muted hover:text-gh-fg" title="Back to home">
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M10 19l-7-7m0 0l7-7m-7 7h18"
          />
        </svg>
      </a>
      <p class="text-sm text-gh-muted">{projectDisplayName}</p>
    </div>
  </header>

  <!-- Messages -->
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
      <MessageList
        {session}
        {messages}
        onDeleteMessage={handleDeleteMessage}
        onEditTitle={handleEditTitle}
        onSplitSession={handleSplitSession}
        externalScrollContainer={scrollContainer}
        enableScroll={false}
      />
    {/if}
  </div>
</div>
