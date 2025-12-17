<script lang="ts">
  import type { Project, SessionMeta } from '$lib/api'
  import { formatProjectName } from '$lib/utils'

  interface Props {
    projects: Project[]
    projectSessions: Map<string, SessionMeta[]>
    expandedProjects: Set<string>
    selectedSession: SessionMeta | null
    loadingProject: string | null
    onToggleProject: (name: string) => void
    onSelectSession: (session: SessionMeta) => void
    onRenameSession: (e: Event, session: SessionMeta) => void
    onDeleteSession: (e: Event, session: SessionMeta) => void
    onMoveSession?: (session: SessionMeta, targetProject: string) => void
  }

  let {
    projects,
    projectSessions,
    expandedProjects,
    selectedSession,
    loadingProject,
    onToggleProject,
    onSelectSession,
    onRenameSession,
    onDeleteSession,
    onMoveSession,
  }: Props = $props()

  // Filter out empty projects
  const nonEmptyProjects = $derived(projects.filter((p) => p.sessionCount > 0))

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
    Projects ({nonEmptyProjects.length})
  </h2>

  <ul class="overflow-y-auto flex-1">
    {#each nonEmptyProjects as project}
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
                <li
                  class="flex items-center border-t border-gh-border-subtle group {isSelected
                    ? 'bg-gh-accent/20 border-l-3 border-l-gh-accent'
                    : ''} {isDragging ? 'opacity-50' : ''}"
                  draggable="true"
                  ondragstart={(e) => handleDragStart(e, session)}
                  ondragend={handleDragEnd}
                >
                  <button
                    class="flex-1 min-w-0 py-2 pr-2 bg-transparent border-none text-gh-text cursor-pointer text-left flex items-center gap-2 text-sm hover:bg-gh-border-subtle {isSelected
                      ? 'pl-[calc(2rem-3px)]'
                      : 'pl-8'}"
                    onclick={() => onSelectSession(session)}
                  >
                    <span class="flex-1 min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">
                      {session.title ?? 'Untitled'}
                    </span>
                    <span
                      class="flex-shrink-0 text-xs text-gh-text-secondary bg-gh-border
                             px-1.5 py-px rounded-lg"
                    >
                      {session.messageCount}
                    </span>
                  </button>

                  <!-- Session Actions -->
                  <div
                    class="flex gap-0.5 pr-2 opacity-0 group-hover:opacity-100 transition-opacity"
                  >
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
                </li>
              {/each}
            {/if}
          </ul>
        {/if}
      </li>
    {/each}
  </ul>
</aside>
