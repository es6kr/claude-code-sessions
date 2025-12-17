<script lang="ts">
  import { onMount } from 'svelte'
  import { browser } from '$app/environment'
  import * as api from '$lib/api'
  import type { Project, SessionMeta, Message } from '$lib/api'
  import { ProjectTree, MessageList } from '$lib/components'

  // State
  let projects = $state<Project[]>([])
  let projectSessions = $state<Map<string, SessionMeta[]>>(new Map())
  let expandedProjects = $state<Set<string>>(new Set())
  let selectedSession = $state<SessionMeta | null>(null)
  let messages = $state<Message[]>([])
  let loading = $state(false)
  let loadingProject = $state<string | null>(null)
  let error = $state<string | null>(null)

  // URL hash helpers
  const parseHash = (): { project?: string; session?: string } => {
    if (!browser) return {}
    const hash = window.location.hash.slice(1)
    const params = new URLSearchParams(hash)
    return {
      project: params.get('project') ?? undefined,
      session: params.get('session') ?? undefined,
    }
  }

  const updateHash = (project?: string, session?: string) => {
    if (!browser) return
    const params = new URLSearchParams()
    if (project) params.set('project', project)
    if (session) params.set('session', session)
    const hash = params.toString()
    window.history.replaceState(null, '', hash ? `#${hash}` : window.location.pathname)
  }

  // Data loading
  const loadProjects = async () => {
    loading = true
    error = null
    try {
      projects = await api.listProjects()
    } catch (e) {
      error = String(e)
    } finally {
      loading = false
    }
  }

  const loadSessions = async (projectName: string) => {
    if (projectSessions.has(projectName)) return

    loadingProject = projectName
    try {
      const sessions = await api.listSessions(projectName)
      projectSessions.set(projectName, sessions)
      projectSessions = new Map(projectSessions)
    } catch (e) {
      error = String(e)
    } finally {
      loadingProject = null
    }
  }

  const restoreFromHash = async () => {
    const { project, session } = parseHash()
    if (!project) return

    await loadSessions(project)
    expandedProjects.add(project)
    expandedProjects = new Set(expandedProjects)

    if (session) {
      const sessions = projectSessions.get(project)
      const found = sessions?.find((s) => s.id === session)
      if (found) await selectSession(found, false)
    }
  }

  // Event handlers
  const toggleProject = async (name: string) => {
    if (expandedProjects.has(name)) {
      expandedProjects.delete(name)
      expandedProjects = new Set(expandedProjects)
      if (selectedSession?.projectName === name) updateHash()
    } else {
      await loadSessions(name)
      expandedProjects.add(name)
      expandedProjects = new Set(expandedProjects)
      updateHash(name, selectedSession?.projectName === name ? selectedSession.id : undefined)
    }
  }

  const selectSession = async (session: SessionMeta, shouldUpdateHash = true) => {
    selectedSession = session
    loading = true
    error = null
    try {
      messages = await api.getSession(session.projectName, session.id)
      if (shouldUpdateHash) updateHash(session.projectName, session.id)
    } catch (e) {
      error = String(e)
    } finally {
      loading = false
    }
  }

  const handleDeleteSession = async (e: Event, session: SessionMeta) => {
    e.stopPropagation()
    if (!confirm(`Delete session "${session.title}"?`)) return

    try {
      await api.deleteSession(session.projectName, session.id)
      const sessions = projectSessions.get(session.projectName)
      if (sessions) {
        projectSessions.set(
          session.projectName,
          sessions.filter((s) => s.id !== session.id)
        )
        projectSessions = new Map(projectSessions)
      }
      if (selectedSession?.id === session.id) {
        selectedSession = null
        messages = []
        updateHash(session.projectName)
      }
    } catch (e) {
      error = String(e)
    }
  }

  const handleRenameSession = async (e: Event, session: SessionMeta) => {
    e.stopPropagation()
    const newTitle = prompt('Enter new title:', session.title)
    if (!newTitle) return

    try {
      await api.renameSession(session.projectName, session.id, newTitle)
      session.title = newTitle
      projectSessions = new Map(projectSessions)
    } catch (e) {
      error = String(e)
    }
  }

  const handleDeleteMessage = async (msg: Message) => {
    if (!selectedSession || !confirm('Delete this message?')) return

    // Use uuid or messageId (for file-history-snapshot type)
    const msgId = msg.uuid || msg.messageId
    if (!msgId) return

    try {
      await api.deleteMessage(selectedSession.projectName, selectedSession.id, msgId)
      messages = messages.filter((m) => (m.uuid || m.messageId) !== msgId)

      // Update session message count
      const sessions = projectSessions.get(selectedSession.projectName)
      const session = sessions?.find((s) => s.id === selectedSession!.id)
      if (session) {
        session.messageCount = messages.length
        projectSessions = new Map(projectSessions)
      }
    } catch (e) {
      error = String(e)
    }
  }

  const handleEditCustomTitle = async (msg: Message) => {
    if (!selectedSession) return

    const currentTitle = (msg as Message & { customTitle?: string }).customTitle ?? ''
    const newTitle = prompt('Enter new custom title:', currentTitle)
    if (newTitle === null || newTitle === currentTitle) return

    try {
      await api.updateCustomTitle(
        selectedSession.projectName,
        selectedSession.id,
        msg.uuid,
        newTitle
      )
      ;(msg as Message & { customTitle?: string }).customTitle = newTitle
      messages = [...messages]
    } catch (e) {
      error = String(e)
    }
  }

  const handleSplitSession = async (msg: Message) => {
    if (!selectedSession) return

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
      const result = await api.splitSession(
        selectedSession.projectName,
        selectedSession.id,
        msg.uuid
      )

      if (result.success && result.newSessionId) {
        // Refresh session list for current project
        const newSessions = await api.listSessions(selectedSession.projectName)
        projectSessions.set(selectedSession.projectName, newSessions)
        projectSessions = new Map(projectSessions)

        // Update current session view (show remaining messages)
        messages = messages.slice(0, msgIndex)

        // Update session metadata
        const sessions = projectSessions.get(selectedSession.projectName)
        const currentSession = sessions?.find((s) => s.id === selectedSession!.id)
        if (currentSession) {
          currentSession.messageCount = messages.length
          projectSessions = new Map(projectSessions)
        }

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

  const handleMoveSession = async (session: SessionMeta, targetProject: string) => {
    if (!confirm(`Move session "${session.title}" to ${targetProject.split('-').pop()}?`)) return

    try {
      loading = true
      const result = await api.moveSession(session.projectName, session.id, targetProject)

      if (result.success) {
        // Remove from source project
        const sourceSessions = projectSessions.get(session.projectName)
        if (sourceSessions) {
          projectSessions.set(
            session.projectName,
            sourceSessions.filter((s) => s.id !== session.id)
          )
        }

        // Add to target project (refresh list)
        const targetSessions = await api.listSessions(targetProject)
        projectSessions.set(targetProject, targetSessions)
        projectSessions = new Map(projectSessions)

        // Update project counts
        const sourceProject = projects.find((p) => p.name === session.projectName)
        const destProject = projects.find((p) => p.name === targetProject)
        if (sourceProject) sourceProject.sessionCount--
        if (destProject) destProject.sessionCount++
        projects = [...projects]

        // Clear selection if moved session was selected
        if (selectedSession?.id === session.id) {
          selectedSession = null
          messages = []
          updateHash()
        }
      } else {
        error = result.error ?? 'Failed to move session'
      }
    } catch (e) {
      error = String(e)
    } finally {
      loading = false
    }
  }

  // Lifecycle
  onMount(async () => {
    await loadProjects()
    await restoreFromHash()

    window.addEventListener('hashchange', restoreFromHash)
    return () => window.removeEventListener('hashchange', restoreFromHash)
  })
</script>

<div class="grid grid-cols-[350px_1fr] gap-4 h-[calc(100vh-120px)]">
  <ProjectTree
    {projects}
    {projectSessions}
    {expandedProjects}
    {selectedSession}
    {loadingProject}
    onToggleProject={toggleProject}
    onSelectSession={selectSession}
    onRenameSession={handleRenameSession}
    onDeleteSession={handleDeleteSession}
    onMoveSession={handleMoveSession}
  />

  <MessageList
    session={selectedSession}
    {messages}
    onDeleteMessage={handleDeleteMessage}
    onEditTitle={handleEditCustomTitle}
    onSplitSession={handleSplitSession}
  />
</div>

{#if loading}
  <div class="fixed bottom-4 right-4 bg-gh-accent text-white px-4 py-2 rounded">Loading...</div>
{/if}

{#if error}
  <div class="fixed bottom-4 right-4 bg-gh-red text-white px-4 py-2 rounded">
    {error}
  </div>
{/if}
