<script module>
  import { defineMeta } from '@storybook/addon-svelte-csf'
  import { fn } from 'storybook/test'
  import ProjectTree from './ProjectTree.svelte'

  const mockProjects = [
    {
      name: '/home/user/projects/my-app',
      displayName: '/home/user/projects/my-app',
      path: '/home/user/projects/my-app',
      sessionCount: 3,
    },
    {
      name: '/home/user/projects/api-server',
      displayName: '/home/user/projects/api-server',
      path: '/home/user/projects/api-server',
      sessionCount: 1,
    },
    {
      name: '/home/user/projects/empty-project',
      displayName: '/home/user/projects/empty-project',
      path: '/home/user/projects/empty-project',
      sessionCount: 0,
    },
  ]

  // Canonical session fixtures — single source of truth for both SessionMeta and SessionData
  const canonicalSessions = [
    {
      id: 'session-1',
      projectName: '/home/user/projects/my-app',
      title: 'Implement auth flow',
      messageCount: 42,
      createdAt: '2026-01-15T09:00:00Z',
      updatedAt: '2026-01-15T11:30:00Z',
      currentSummary: 'Implemented OAuth2 authentication with Google and GitHub providers',
      summaries: [
        {
          summary: 'Implemented OAuth2 authentication with Google and GitHub providers',
          timestamp: '2026-01-15T11:00:00Z',
        },
      ],
      agents: [{ id: 'agent-1', name: 'Auth Helper', messageCount: 12 }],
      todos: {
        sessionId: 'session-1',
        sessionTodos: [{ content: 'Add refresh token rotation', status: 'pending' }],
        agentTodos: [],
        hasTodos: true,
      },
    },
    {
      id: 'session-2',
      projectName: '/home/user/projects/my-app',
      title: 'Fix database migration',
      customTitle: 'DB Migration Fix',
      messageCount: 15,
      createdAt: '2026-01-14T14:00:00Z',
      updatedAt: '2026-01-14T15:00:00Z',
      summaries: [],
      agents: [],
      todos: { sessionId: 'session-2', sessionTodos: [], agentTodos: [], hasTodos: false },
    },
    {
      id: 'session-3',
      projectName: '/home/user/projects/my-app',
      title: 'Review PR comments',
      agentName: 'Code Review Agent',
      messageCount: 8,
      createdAt: '2026-01-13T10:00:00Z',
      updatedAt: '2026-01-13T10:30:00Z',
      summaries: [],
      agents: [
        { id: 'agent-2', name: 'Reviewer', messageCount: 5 },
        { id: 'agent-3', name: 'Linter', messageCount: 3 },
      ],
      todos: { sessionId: 'session-3', sessionTodos: [], agentTodos: [], hasTodos: false },
    },
    {
      id: 'session-4',
      projectName: '/home/user/projects/api-server',
      title: 'Add rate limiting',
      messageCount: 25,
      createdAt: '2026-01-12T08:00:00Z',
      updatedAt: '2026-01-12T12:00:00Z',
      currentSummary: 'Implemented token bucket rate limiter with Redis backend',
      summaries: [
        {
          summary: 'Implemented token bucket rate limiter with Redis backend',
          timestamp: '2026-01-12T11:00:00Z',
        },
        {
          summary: 'Initial rate limiting design discussion',
          timestamp: '2026-01-12T09:00:00Z',
        },
      ],
      agents: [],
      todos: {
        sessionId: 'session-4',
        sessionTodos: [
          { content: 'Add rate limit headers', status: 'completed' },
          { content: 'Write integration tests', status: 'in_progress' },
        ],
        agentTodos: [],
        hasTodos: true,
      },
    },
  ]

  // Derive SessionMeta[] from canonical fixtures
  const mockSessions = canonicalSessions.map(
    ({ id, projectName, title, messageCount, createdAt, updatedAt, customTitle, agentName }) => ({
      id,
      projectName,
      title,
      messageCount,
      createdAt,
      updatedAt,
      ...(customTitle && { customTitle }),
      ...(agentName && { agentName }),
    })
  )

  // Derive SessionData map from canonical fixtures
  const mockSessionData = new Map()
  for (const session of canonicalSessions) {
    const { projectName } = session
    if (!mockSessionData.has(projectName)) {
      mockSessionData.set(projectName, new Map())
    }
    mockSessionData.get(projectName).set(session.id, session)
  }

  const projectSessionsMap = new Map([
    [
      '/home/user/projects/my-app',
      mockSessions.filter((s) => s.projectName === '/home/user/projects/my-app'),
    ],
    [
      '/home/user/projects/api-server',
      mockSessions.filter((s) => s.projectName === '/home/user/projects/api-server'),
    ],
    ['/home/user/projects/empty-project', []],
  ])

  const WRAPPER_CLASS = 'w-80 h-[600px]'

  const { Story } = defineMeta({
    title: 'Components/ProjectTree',
    component: ProjectTree,
    tags: ['autodocs'],
    args: {
      projects: mockProjects,
      projectSessions: projectSessionsMap,
      projectSessionData: mockSessionData,
      expandedProjects: new Set(['/home/user/projects/my-app']),
      selectedSession: null,
      loadingProject: null,
      sortField: 'modified',
      sortOrder: 'desc',
      titleDisplayMode: 'message',
      onToggleProject: fn(),
      onSelectSession: fn(),
      onRenameSession: fn(),
      onDeleteSession: fn(),
      onMoveSession: fn(),
      onResumeSession: fn(),
      onSortChange: fn(),
      onTitleModeChange: fn(),
    },
    parameters: {
      layout: 'padded',
    },
  })
</script>

<Story name="Default (One Expanded)">
  {#snippet children(args)}
    <div class={WRAPPER_CLASS}>
      <ProjectTree {...args} />
    </div>
  {/snippet}
</Story>

<Story name="Session Selected" args={{ selectedSession: mockSessions[0] }}>
  {#snippet children(args)}
    <div class={WRAPPER_CLASS}>
      <ProjectTree {...args} />
    </div>
  {/snippet}
</Story>

<Story name="All Collapsed" args={{ expandedProjects: new Set() }}>
  {#snippet children(args)}
    <div class={WRAPPER_CLASS}>
      <ProjectTree {...args} />
    </div>
  {/snippet}
</Story>

<Story
  name="Loading State"
  args={{
    expandedProjects: new Set(['/home/user/projects/api-server']),
    loadingProject: '/home/user/projects/api-server',
  }}
>
  {#snippet children(args)}
    <div class={WRAPPER_CLASS}>
      <ProjectTree {...args} />
    </div>
  {/snippet}
</Story>

<Story name="DateTime Title Mode" args={{ titleDisplayMode: 'datetime' }}>
  {#snippet children(args)}
    <div class={WRAPPER_CLASS}>
      <ProjectTree {...args} />
    </div>
  {/snippet}
</Story>

<Story name="Sort Ascending" args={{ sortOrder: 'asc' }}>
  {#snippet children(args)}
    <div class={WRAPPER_CLASS}>
      <ProjectTree {...args} />
    </div>
  {/snippet}
</Story>

<Story
  name="Empty Project List"
  args={{
    projects: [],
    projectSessions: new Map(),
    projectSessionData: new Map(),
    expandedProjects: new Set(),
  }}
>
  {#snippet children(args)}
    <div class={WRAPPER_CLASS}>
      <ProjectTree {...args} />
    </div>
  {/snippet}
</Story>
