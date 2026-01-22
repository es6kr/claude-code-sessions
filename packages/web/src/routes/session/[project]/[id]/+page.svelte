<script lang="ts">
  import { page } from '$app/state'
  import type { AgentInfo, Message, SessionMeta, TodoItem } from '$lib/api'
  import * as api from '$lib/api'
  import { ConfirmModal, InputModal, SessionViewer, Toast } from '$lib/components'
  import { onMount } from 'svelte'

  // State
  let session = $state<SessionMeta | null>(null)
  let messages = $state<Message[]>([])
  let todos = $state<TodoItem[]>([])
  let agents = $state<AgentInfo[]>([])
  let loading = $state(true)
  let error = $state<string | null>(null)
  let toast = $state<string | null>(null)
  let projectDisplayName = $state<string>('')
  let customTitle = $state<string | undefined>(undefined)
  let currentSummary = $state<string | undefined>(undefined)

  // Modal states
  let confirmModal = $state<{
    show: boolean
    title: string
    message: string
    variant: 'danger' | 'default'
    onConfirm: () => void
  }>({
    show: false,
    title: '',
    message: '',
    variant: 'default',
    onConfirm: () => {},
  })

  let inputModal = $state<{
    show: boolean
    title: string
    label: string
    initialValue: string
    onConfirm: (value: string) => void
  }>({
    show: false,
    title: '',
    label: '',
    initialValue: '',
    onConfirm: () => {},
  })

  const showConfirm = (
    title: string,
    message: string,
    onConfirm: () => void,
    variant: 'danger' | 'default' = 'default'
  ) => {
    confirmModal = { show: true, title, message, variant, onConfirm }
  }

  const closeConfirm = () => {
    confirmModal = { ...confirmModal, show: false }
  }

  const showInput = (
    title: string,
    label: string,
    initialValue: string,
    onConfirm: (value: string) => void
  ) => {
    inputModal = { show: true, title, label, initialValue, onConfirm }
  }

  const closeInput = () => {
    inputModal = { ...inputModal, show: false }
  }

  // Get params from URL
  const projectName = $derived(decodeURIComponent(page.params.project ?? ''))
  const sessionId = $derived(decodeURIComponent(page.params.id ?? ''))

  // Display title for page title
  const displayTitle = $derived(
    customTitle ??
      (currentSummary && currentSummary.length > 50
        ? currentSummary.slice(0, 47) + '...'
        : currentSummary) ??
      session?.title ??
      'Untitled'
  )

  // Back URL
  const backUrl = $derived(`/#project=${encodeURIComponent(projectName)}`)

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

  const handleEditTitle = (msg: Message) => {
    if (!session) return

    const currentTitle = (msg as Message & { customTitle?: string }).customTitle ?? ''
    showInput('Edit Custom Title', 'Custom title:', currentTitle, async (newTitle) => {
      closeInput()
      if (newTitle === currentTitle) return

      try {
        await api.updateCustomTitle(session!.projectName, session!.id, msg.uuid, newTitle)
        ;(msg as Message & { customTitle?: string }).customTitle = newTitle
        messages = [...messages]
      } catch (e) {
        error = String(e)
      }
    })
  }

  const handleSplitSession = (msg: Message) => {
    if (!session) return

    const msgIndex = messages.findIndex((m) => m.uuid === msg.uuid)
    const oldMessagesCount = msgIndex
    const keptMessagesCount = messages.length - msgIndex

    showConfirm(
      'Split Session',
      `Split session at this message?\n\nThis session will keep ${keptMessagesCount} messages (from here onwards).\nOld messages (${oldMessagesCount}) will be moved to a new session.`,
      async () => {
        closeConfirm()
        try {
          loading = true
          const result = await api.splitSession(session!.projectName, session!.id, msg.uuid)

          if (result.success && result.newSessionId) {
            // Keep messages from split point onwards (original session keeps newer messages)
            messages = messages.slice(msgIndex)
            toast = `Session split! Old messages moved to new session: ${result.newSessionId.slice(0, 8)}...`
          } else {
            error = result.error ?? 'Failed to split session'
          }
        } catch (e) {
          error = String(e)
        } finally {
          loading = false
        }
      }
    )
  }

  onMount(loadSession)
</script>

<svelte:head>
  <title>{displayTitle} - Claude Sessions</title>
</svelte:head>

<div class="h-screen bg-gh-bg">
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
      {customTitle}
      {currentSummary}
      {projectDisplayName}
      {backUrl}
      onMessagesChange={(newMessages) => (messages = newMessages)}
      onRefresh={async () => {
        if (session) {
          messages = await api.getSession(session.projectName, session.id)
        }
      }}
      onEditTitle={handleEditTitle}
      onSplitSession={handleSplitSession}
      enableScroll={true}
      fullWidth={true}
    />
  {/if}
</div>

<Toast bind:message={toast} />

<ConfirmModal
  show={confirmModal.show}
  title={confirmModal.title}
  message={confirmModal.message}
  variant={confirmModal.variant}
  onConfirm={confirmModal.onConfirm}
  onCancel={closeConfirm}
/>

<InputModal
  show={inputModal.show}
  title={inputModal.title}
  label={inputModal.label}
  initialValue={inputModal.initialValue}
  onConfirm={inputModal.onConfirm}
  onCancel={closeInput}
/>
