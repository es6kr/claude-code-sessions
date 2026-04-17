<script lang="ts">
  import { goto } from '$app/navigation'
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
  let toastDuration = $state(3000)
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

            // Refresh session metadata so title/summary reflects the new first message
            try {
              const sessionData = await api.getSessionTreeData(session!.projectName, session!.id)
              currentSummary = sessionData.currentSummary
              customTitle = sessionData.customTitle
              agents = sessionData.agents ?? []
              const sessionTodos = sessionData.todos?.sessionTodos ?? []
              const agentTodoItems = sessionData.todos?.agentTodos?.flatMap((a) => a.todos) ?? []
              todos = [...sessionTodos, ...agentTodoItems]
            } catch {
              // Non-critical: metadata refresh failure does not block the split result
            }
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

  const handleRenameSession = () => {
    if (!session) return

    showInput(
      'Rename Session',
      'Session title:',
      customTitle ?? currentSummary ?? session.title ?? '',
      async (newTitle) => {
        closeInput()
        const trimmed = newTitle.trim()

        try {
          await api.renameSession(session!.projectName, session!.id, trimmed)
          customTitle = trimmed || undefined
          // Also refresh currentSummary to stay in sync
          const sessionData = await api.getSessionTreeData(session!.projectName, session!.id)
          currentSummary = sessionData.currentSummary
        } catch (e) {
          error = String(e)
        }
      }
    )
  }

  const handleCompressSession = () => {
    if (!session) return

    showConfirm(
      'Compress Session',
      'Compress this session?\n\nThis will remove redundant data (progress messages and intermediate snapshots, keeping only the first and last) to reduce file size. This action cannot be undone.',
      async () => {
        closeConfirm()
        try {
          loading = true
          const result = await api.compressSession(session!.projectName, session!.id)
          if (result.success) {
            const saved =
              result.originalSize > 0
                ? Math.round((1 - result.compressedSize / result.originalSize) * 100)
                : 0
            toastDuration = 8000
            toast = `Session compressed! Saved ~${saved}% (removed ${result.removedProgress} progress, ${result.removedSnapshots} snapshots)`
            messages = await api.getSession(session!.projectName, session!.id)
          }
        } catch (e) {
          error = String(e)
        } finally {
          loading = false
        }
      }
    )
  }

  const handleResumeSession = async () => {
    if (!session) return
    try {
      const result = await api.resumeSession(session.projectName, session.id)
      if (result.success) {
        toast = `Session resumed (PID: ${result.pid})`
      } else {
        error = result.error ?? 'Failed to resume session'
      }
    } catch (e) {
      error = String(e)
    }
  }

  const handleDeleteSession = () => {
    if (!session) return

    showConfirm(
      'Delete Session',
      `Delete this session?\n\n"${customTitle ?? session.title}"\n\nThis action cannot be undone.`,
      async () => {
        closeConfirm()
        try {
          await api.deleteSession(session!.projectName, session!.id)
          goto(backUrl)
        } catch (e) {
          error = String(e)
        }
      },
      'danger'
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
      onCompressSession={handleCompressSession}
      onRenameSession={handleRenameSession}
      onResumeSession={handleResumeSession}
      onDeleteSession={handleDeleteSession}
      enableScroll={true}
      fullWidth={true}
    />
  {/if}
</div>

<Toast bind:message={toast} duration={toastDuration} />

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
