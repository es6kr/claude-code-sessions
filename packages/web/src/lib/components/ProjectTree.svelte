<script lang="ts">
  import type { Project, SessionMeta, SessionData } from '$lib/api'
  import { formatProjectName } from '$lib/utils'
  import { sortProjects } from '@claude-sessions/core'
  import { appConfig } from '$lib/stores/config'

  interface Props {
    projects: Project[]
    projectSessions: Map<string, SessionMeta[]>
    projectSessionData: Map<string, Map<string, SessionData>>
    expandedProjects: Set<string>
    selectedSession: SessionMeta | null
    loadingProject: string | null
    onToggleProject: (name: string) => void
    onSelectSession: (session: SessionMeta) => void
    onRenameSession: (e: Event, session: SessionMeta) => void
    onDeleteSession: (e: Event, session: SessionMeta) => void
    onMoveSession?: (session: SessionMeta, targetProject: string) => void
    onResumeSession?: (e: Event, session: SessionMeta) => void
  }

  let {
    projects,
    projectSessions,
    projectSessionData,
    expandedProjects,
    selectedSession,
    loadingProject,
    onToggleProject,
    onSelectSession,
    onRenameSession,
    onDeleteSession,
    onMoveSession,
    onResumeSession,
  }: Props = $props()

  // Get session data with summary info
  const getSessionData = (projectName: string, sessionId: string): SessionData | undefined => {
    return projectSessionData.get(projectName)?.get(sessionId)
  }

  // Get display title: customTitle > currentSummary > title > 'Untitled'
  const getDisplayTitle = (session: SessionMeta): string => {
    const data = getSessionData(session.projectName, session.id)
    // 1. Custom title from session data (user-set)
    if (data?.customTitle) return data.customTitle
    // 2. Current summary as fallback title
    if (data?.currentSummary) {
      const summary = data.currentSummary
      return summary.length > 60 ? summary.slice(0, 57) + '...' : summary
    }
    // 3. Title from session metadata
    if (session.title && session.title !== 'Untitled') return session.title
    return 'Untitled'
  }

  // Get tooltip text based on what's displayed as title
  const getTooltipText = (session: SessionMeta): string => {
    const data = getSessionData(session.projectName, session.id)
    // If customTitle is displayed, show currentSummary in tooltip
    if (data?.customTitle && data?.currentSummary) {
      return data.currentSummary
    }
    // If currentSummary is displayed as title, show original title in tooltip
    if (data?.currentSummary && session.title && session.title !== 'Untitled') {
      return session.title
    }
    // If title is displayed, show currentSummary if available
    if (data?.currentSummary) {
      return data.currentSummary
    }
    return session.title ?? 'No summary available'
  }

  // Check if session has agents or todos
  const getSessionInfo = (
    session: SessionMeta
  ): { agents: number; todos: number; summaries: number } => {
    const data = getSessionData(session.projectName, session.id)
    const todoCount = data?.todos
      ? data.todos.sessionTodos.length +
        data.todos.agentTodos.reduce((acc, at) => acc + at.todos.length, 0)
      : 0
    return {
      agents: data?.agents.length ?? 0,
      todos: todoCount,
      summaries: data?.summaries.length ?? 0,
    }
  }

  // Sort projects: current project first, then user's home paths, then others
  const sortedProjects = $derived(
    sortProjects(projects, {
      currentProjectName: $appConfig.currentProjectName,
      homeDir: $appConfig.homeDir,
    })
  )

  // Expanded sessions state (for showing summaries, todos, agents sublist)
  let expandedSessions = $state<Set<string>>(new Set())

  const toggleSessionExpand = (e: Event, sessionId: string) => {
    e.stopPropagation()
    if (expandedSessions.has(sessionId)) {
      expandedSessions.delete(sessionId)
    } else {
      expandedSessions.add(sessionId)
    }
    expandedSessions = new Set(expandedSessions)
  }

  // Drag and drop state
  let draggedSession = $state<SessionMeta | null>(null)
  let dropTargetProject = $state<string | null>(null)

  const handleDragStart = (e: DragEvent, session: SessionMeta) => {
    if (!e.dataTransfer) return
    draggedSession = session
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData(
      'text/plain',
      JSON.stringify({ id: session.id, project: session.projectName })
    )
  }

  const handleDragEnd = () => {
    draggedSession = null
    dropTargetProject = null
  }

  const handleDragOver = (e: DragEvent, projectName: string) => {
    if (!draggedSession || draggedSession.projectName === projectName) return
    e.preventDefault()
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
    dropTargetProject = projectName
  }

  const handleDragLeave = () => {
    dropTargetProject = null
  }

  const handleDrop = (e: DragEvent, targetProject: string) => {
    e.preventDefault()
    dropTargetProject = null
    if (!draggedSession || draggedSession.projectName === targetProject) return
    onMoveSession?.(draggedSession, targetProject)
    draggedSession = null
  }
</script>

<aside class="bg-gh-bg-secondary border border-gh-border rounded-lg overflow-hidden flex flex-col">
  <h2 class="p-4 text-base font-semibold border-b border-gh-border bg-gh-bg">
    Projects ({sortedProjects.length})
  </h2>

  <ul class="overflow-y-auto flex-1">
    {#each sortedProjects as project}
      {@const isDropTarget = dropTargetProject === project.name}
      <li class="border-b border-gh-border-subtle">
        <!-- Project Header -->
        <button
          class="w-full py-3 px-4 bg-transparent border-none text-gh-text cursor-pointer text-left flex items-center gap-2 font-medium hover:bg-gh-border-subtle {expandedProjects.has(
            project.name
          )
            ? 'bg-gh-accent/10'
            : ''} {isDropTarget ? 'bg-gh-green/20 ring-2 ring-gh-green ring-inset' : ''}"
          onclick={() => onToggleProject(project.name)}
          ondragover={(e) => handleDragOver(e, project.name)}
          ondragleave={handleDragLeave}
          ondrop={(e) => handleDrop(e, project.name)}
        >
          <span class="text-xs w-3 text-gh-text-secondary">
            {expandedProjects.has(project.name) ? '▼' : '▶'}
          </span>
          <span
            class="flex-1 overflow-hidden text-ellipsis whitespace-nowrap"
            title={project.displayName}
          >
            {formatProjectName(project.displayName)}
          </span>
          <span class="bg-gh-border px-2 py-0.5 rounded-full text-xs font-normal">
            {project.sessionCount}
          </span>
        </button>

        <!-- Sessions List -->
        {#if expandedProjects.has(project.name)}
          <ul class="bg-gh-bg">
            {#if loadingProject === project.name}
              <li class="py-2 px-8 text-gh-text-secondary text-sm">Loading...</li>
            {:else}
              {#each projectSessions.get(project.name) ?? [] as session}
                {@const isSelected = selectedSession?.id === session.id}
                {@const isDragging = draggedSession?.id === session.id}
                {@const sessionInfo = getSessionInfo(session)}
                {@const displayTitle = getDisplayTitle(session)}
                {@const tooltipText = getTooltipText(session)}
                {@const data = getSessionData(session.projectName, session.id)}
                {@const isSummaryFallback = !data?.customTitle && !data?.currentSummary}
                {@const isExpanded = expandedSessions.has(session.id)}
                {@const hasSubItems =
                  sessionInfo.summaries > 0 || sessionInfo.agents > 0 || sessionInfo.todos > 0}
                <li
                  class="relative border-t border-gh-border-subtle group {isSelected
                    ? 'bg-gh-accent/20 border-l-3 border-l-gh-accent'
                    : ''} {isDragging ? 'opacity-50' : ''}"
                  draggable="true"
                  ondragstart={(e) => handleDragStart(e, session)}
                  ondragend={handleDragEnd}
                >
                  <!-- Session Row -->
                  <div class="flex items-center">
                    {#if hasSubItems}
                      <button
                        class="flex-shrink-0 w-5 h-8 flex items-center justify-center bg-transparent border-none cursor-pointer text-gh-text-secondary text-xs ml-1 z-10 relative"
                        onclick={(e) => toggleSessionExpand(e, session.id)}
                        title={isExpanded ? 'Collapse' : 'Expand'}
                      >
                        {isExpanded ? '▼' : '▶'}
                      </button>
                    {:else}
                      <span class="w-5 ml-1"></span>
                    {/if}
                    <button
                      class="flex-1 min-w-0 py-2 pr-2 bg-transparent border-none text-gh-text cursor-pointer text-left flex items-center gap-2 text-sm"
                      onclick={() => onSelectSession(session)}
                      title={tooltipText}
                    >
                      <span
                        class="flex-1 min-w-0 overflow-hidden text-ellipsis whitespace-nowrap {isSummaryFallback
                          ? 'italic text-gh-text-secondary'
                          : ''}"
                      >
                        {displayTitle}
                      </span>
                      <span
                        class="flex-shrink-0 flex items-center gap-2 text-xs text-gh-text-secondary"
                      >
                        <span
                          class="flex items-center gap-0.5"
                          title="{session.messageCount} messages"
                        >
                          <span>💬</span><span>{session.messageCount}</span>
                        </span>
                        {#if sessionInfo.agents > 0}
                          <span
                            class="flex items-center gap-0.5"
                            title="{sessionInfo.agents} agent(s)"
                          >
                            <span>🤖</span><span>{sessionInfo.agents}</span>
                          </span>
                        {/if}
                        {#if sessionInfo.todos > 0}
                          <span
                            class="flex items-center gap-0.5"
                            title="{sessionInfo.todos} todo(s)"
                          >
                            <span>📋</span><span>{sessionInfo.todos}</span>
                          </span>
                        {/if}
                      </span>
                    </button>

                    <!-- Hover overlay: summary on left, actions on right (only covers session row, not nested items) -->
                    <div
                      class="absolute left-0 right-0 top-0 h-8 flex items-center opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none {isSelected
                        ? 'bg-gradient-to-r from-[color-mix(in_srgb,var(--color-gh-accent)_20%,var(--color-gh-bg))] via-[color-mix(in_srgb,var(--color-gh-accent)_20%,var(--color-gh-bg))] to-[color-mix(in_srgb,var(--color-gh-accent)_20%,var(--color-gh-bg))]'
                        : 'bg-gradient-to-r from-gh-bg via-gh-bg to-gh-bg'}"
                    >
                      <span
                        class="flex-1 min-w-0 pl-7 pr-2 text-xs text-gh-text-secondary italic overflow-hidden text-ellipsis whitespace-nowrap"
                      >
                        <!-- Left: Summary text on hover -->
                        {#if data?.currentSummary}
                          {data.currentSummary.length > 50
                            ? data.currentSummary.slice(0, 47) + '...'
                            : data.currentSummary}
                        {:else}
                          {displayTitle}
                        {/if}
                      </span>

                      <!-- Right: Action buttons -->
                      <div class="flex-shrink-0 flex gap-0.5 pr-2 pointer-events-auto">
                        {#if onResumeSession}
                          <button
                            class="bg-transparent border-none cursor-pointer p-1 rounded
                                   hover:bg-gh-green/20 text-xs"
                            onclick={(e) => onResumeSession(e, session)}
                            title="Resume session"
                          >
                            ▶️
                          </button>
                        {/if}
                        <button
                          class="bg-transparent border-none cursor-pointer p-1 rounded
                                 hover:bg-gh-border text-xs"
                          onclick={(e) => onRenameSession(e, session)}
                          title="Rename"
                        >
                          ✏️
                        </button>
                        <button
                          class="bg-transparent border-none cursor-pointer p-1 rounded
                                 hover:bg-gh-red/20 text-xs"
                          onclick={(e) => onDeleteSession(e, session)}
                          title="Delete"
                        >
                          🗑️
                        </button>
                      </div>
                    </div>
                  </div>

                  <!-- Session Sub Items (Summaries, Todos, Agents) -->
                  {#if isExpanded && hasSubItems}
                    <ul class="bg-gh-bg-secondary/50 border-t border-gh-border-subtle text-xs">
                      <!-- Summaries (oldest first, current summary at index 0) -->
                      {#if data?.summaries && data.summaries.length > 0}
                        {#each data.summaries as summary, idx}
                          <li
                            class="py-1.5 px-4 pl-8 hover:bg-gh-border-subtle/50 flex flex-col gap-0.5 {idx ===
                            0
                              ? 'text-gh-text'
                              : 'text-gh-text-secondary'}"
                            title={summary.summary}
                          >
                            <div class="flex items-start gap-2">
                              <span class="flex-shrink-0">📝</span>
                              <span class="overflow-hidden text-ellipsis line-clamp-2">
                                {summary.summary.length > 100
                                  ? summary.summary.slice(0, 97) + '...'
                                  : summary.summary}
                              </span>
                            </div>
                            {#if summary.timestamp}
                              <span class="pl-6 text-[10px] text-gh-text-secondary/70">
                                {new Date(summary.timestamp).toLocaleString()}
                              </span>
                            {/if}
                          </li>
                        {/each}
                      {/if}
                      <!-- Todos -->
                      {#if data?.todos?.sessionTodos && data.todos.sessionTodos.length > 0}
                        <li
                          class="py-1.5 px-4 pl-8 text-gh-text-secondary hover:bg-gh-border-subtle/50 flex items-start gap-2"
                        >
                          <span class="flex-shrink-0">📋</span>
                          <span>Session Todos ({data.todos.sessionTodos.length})</span>
                        </li>
                      {/if}
                      {#if data?.todos?.agentTodos}
                        {#each data.todos.agentTodos as agentTodo}
                          <li
                            class="py-1.5 px-4 pl-8 text-gh-text-secondary hover:bg-gh-border-subtle/50 flex items-start gap-2"
                          >
                            <span class="flex-shrink-0">📋</span>
                            <span>Agent Todos ({agentTodo.todos.length})</span>
                          </li>
                        {/each}
                      {/if}
                      <!-- Agents -->
                      {#if data?.agents && data.agents.length > 0}
                        {#each data.agents as agent}
                          <li
                            class="py-1.5 px-4 pl-8 text-gh-text-secondary hover:bg-gh-border-subtle/50 flex items-start gap-2"
                            title={agent.name ?? agent.id}
                          >
                            <span class="flex-shrink-0">🤖</span>
                            <span class="overflow-hidden text-ellipsis whitespace-nowrap">
                              {agent.name ?? agent.id.slice(0, 12) + '...'} ({agent.messageCount} msgs)
                            </span>
                          </li>
                        {/each}
                      {/if}
                    </ul>
                  {/if}
                </li>
              {/each}
            {/if}
          </ul>
        {/if}
      </li>
    {/each}
  </ul>
</aside>
