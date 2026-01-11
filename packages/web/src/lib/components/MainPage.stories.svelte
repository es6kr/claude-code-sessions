<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf'
  import ProjectTree from './ProjectTree.svelte'
  import SessionViewer from './SessionViewer.svelte'

  const { Story } = defineMeta({
    title: 'Pages/MainPage',
    tags: ['autodocs'],
    parameters: {
      layout: 'fullscreen',
    },
  })

  // Mock projects data - webapp first (~/works), others in /Users/Shared
  const mockProjects = [
    {
      name: '-Users-dev-works-webapp',
      displayName: '~/works/webapp',
      path: '/Users/dev/works/webapp',
      sessionCount: 12,
    },
    {
      name: '-Users-Shared-projects-api-server',
      displayName: '/Users/Shared/projects/api-server',
      path: '/Users/Shared/projects/api-server',
      sessionCount: 8,
    },
    {
      name: '-Users-Shared-projects-mobile-app',
      displayName: '/Users/Shared/projects/mobile-app',
      path: '/Users/Shared/projects/mobile-app',
      sessionCount: 5,
    },
    {
      name: '-Users-Shared-projects-documentation',
      displayName: '/Users/Shared/projects/documentation',
      path: '/Users/Shared/projects/documentation',
      sessionCount: 3,
    },
  ]

  // Mock sessions for webapp project
  const mockSessions = [
    {
      id: 'session-001',
      projectName: '-Users-dev-works-webapp',
      title: 'Add authentication flow',
      messageCount: 24,
      createdAt: '2026-01-11T10:30:00Z',
      updatedAt: '2026-01-11T14:45:00Z',
    },
    {
      id: 'session-002',
      projectName: '-Users-dev-works-webapp',
      title: 'Fix responsive layout issues',
      messageCount: 18,
      createdAt: '2026-01-10T09:00:00Z',
      updatedAt: '2026-01-10T16:30:00Z',
    },
    {
      id: 'session-003',
      projectName: '-Users-dev-works-webapp',
      title: 'Implement dark mode toggle',
      messageCount: 32,
      createdAt: '2026-01-09T11:15:00Z',
      updatedAt: '2026-01-09T18:20:00Z',
    },
    {
      id: 'session-004',
      projectName: '-Users-dev-works-webapp',
      title: 'Refactor state management',
      messageCount: 45,
      createdAt: '2026-01-08T08:45:00Z',
      updatedAt: '2026-01-08T17:00:00Z',
    },
    {
      id: 'session-005',
      projectName: '-Users-dev-works-webapp',
      title: 'Add unit tests for utils',
      messageCount: 15,
      createdAt: '2026-01-07T14:00:00Z',
      updatedAt: '2026-01-07T16:45:00Z',
    },
  ]

  // Mock session data with summaries (multiple summaries for session-001)
  const mockSessionData = new Map([
    [
      'session-001',
      {
        id: 'session-001',
        customTitle: null,
        currentSummary:
          'Implementing JWT-based authentication with refresh tokens and secure cookie storage',
        summaries: [
          {
            summary:
              'Implementing JWT-based authentication with refresh tokens and secure cookie storage',
          },
          { summary: 'Set up Express routes for /auth endpoints with validation middleware' },
          { summary: 'Created User model with bcrypt password hashing and email verification' },
        ],
        agents: [{ id: 'agent-explore-001', type: 'Explore' }],
        todos: { sessionTodos: [], agentTodos: [] },
      },
    ],
    [
      'session-002',
      {
        id: 'session-002',
        customTitle: 'Layout Bug Fixes',
        currentSummary: 'Fixed mobile breakpoints and flexbox issues in the dashboard',
        summaries: [{ summary: 'Fixed mobile breakpoints and flexbox issues in the dashboard' }],
        agents: [],
        todos: { sessionTodos: [], agentTodos: [] },
      },
    ],
    [
      'session-003',
      {
        id: 'session-003',
        customTitle: null,
        currentSummary:
          'Added system preference detection and manual toggle with localStorage persistence',
        summaries: [
          {
            summary:
              'Added system preference detection and manual toggle with localStorage persistence',
          },
        ],
        agents: [{ id: 'agent-1', type: 'Explore' }],
        todos: { sessionTodos: [], agentTodos: [] },
      },
    ],
  ])

  // Mock messages for selected session
  const mockMessages = [
    {
      uuid: 'msg-001',
      type: 'user',
      content:
        'I need help implementing authentication for my web app. It should support email/password login and OAuth with Google.',
      timestamp: '2026-01-11T10:30:00Z',
    },
    {
      uuid: 'msg-002',
      parentUuid: 'msg-001',
      type: 'assistant',
      content:
        "I'll help you implement authentication. Let me first explore your current project structure to understand the existing setup.\n\nBased on what I see, I recommend using JWT tokens with secure HTTP-only cookies for session management. Here's my plan:\n\n1. Set up authentication routes\n2. Create user model and database schema\n3. Implement password hashing with bcrypt\n4. Add JWT token generation and validation\n5. Configure Google OAuth integration",
      timestamp: '2026-01-11T10:31:00Z',
    },
    {
      uuid: 'msg-003',
      parentUuid: 'msg-002',
      type: 'user',
      content: 'Sounds good! Please start with the authentication routes.',
      timestamp: '2026-01-11T10:35:00Z',
    },
    {
      uuid: 'msg-004',
      parentUuid: 'msg-003',
      type: 'assistant',
      content:
        "I'll create the authentication routes now. I'm setting up endpoints for:\n\n- `POST /auth/register` - New user registration\n- `POST /auth/login` - Email/password login\n- `POST /auth/logout` - Clear session\n- `GET /auth/google` - Initiate Google OAuth\n- `GET /auth/google/callback` - OAuth callback handler\n- `GET /auth/me` - Get current user",
      timestamp: '2026-01-11T10:36:00Z',
    },
    {
      uuid: 'msg-005',
      parentUuid: 'msg-004',
      type: 'user',
      content: 'Perfect! Can you also add rate limiting to prevent brute force attacks?',
      timestamp: '2026-01-11T11:00:00Z',
    },
    {
      uuid: 'msg-006',
      parentUuid: 'msg-005',
      type: 'assistant',
      content:
        "Great security consideration! I'll add rate limiting using `express-rate-limit`. Here's the configuration:\n\n- Login attempts: 5 per 15 minutes per IP\n- Registration: 3 per hour per IP\n- Password reset: 3 per hour per email\n\nI'm also adding account lockout after 5 failed attempts, requiring email verification to unlock.",
      timestamp: '2026-01-11T11:02:00Z',
    },
  ]

  // Mock todos
  const mockTodos = [
    {
      content: 'Set up authentication routes',
      activeForm: 'Setting up auth routes',
      status: 'completed',
    },
    {
      content: 'Create user database model',
      activeForm: 'Creating user model',
      status: 'completed',
    },
    {
      content: 'Implement JWT token handling',
      activeForm: 'Implementing JWT',
      status: 'in_progress',
    },
    { content: 'Add Google OAuth integration', activeForm: 'Adding OAuth', status: 'pending' },
    { content: 'Write authentication tests', activeForm: 'Writing tests', status: 'pending' },
  ]

  // Build Map structures for ProjectTree
  const projectSessions = new Map([['-Users-dev-works-webapp', mockSessions]])
  const projectSessionData = new Map([['-Users-dev-works-webapp', mockSessionData]])
  const expandedProjects = new Set(['-Users-dev-works-webapp'])

  // Handlers (no-op for storybook)
  const noop = () => {}
  const noopEvent = (_e: Event) => {}
</script>

<Story name="Default View">
  {#snippet children(_args)}
    <div class="h-screen bg-gh-bg text-gh-text p-4">
      <div class="grid grid-cols-[350px_1fr] gap-4 h-[calc(100vh-32px)]">
        <ProjectTree
          projects={mockProjects}
          {projectSessions}
          {projectSessionData}
          {expandedProjects}
          selectedSession={mockSessions[0]}
          loadingProject={null}
          onToggleProject={noop}
          onSelectSession={noop}
          onRenameSession={noopEvent}
          onDeleteSession={noopEvent}
          onMoveSession={noop}
          onResumeSession={noopEvent}
        />

        <SessionViewer
          session={mockSessions[0]}
          messages={mockMessages}
          todos={mockTodos}
          agents={[{ id: 'agent-explore-001', messageCount: 8 }]}
          customTitle={null}
          currentSummary="Implementing JWT-based authentication with refresh tokens and secure cookie storage"
          onDeleteMessage={noop}
          onMessagesChange={noop}
          onEditTitle={noop}
          onSplitSession={noop}
        />
      </div>
    </div>
  {/snippet}
</Story>

<Story name="With Todos Tab">
  {#snippet children(_args)}
    <div class="h-screen bg-gh-bg text-gh-text p-4">
      <div class="grid grid-cols-[350px_1fr] gap-4 h-[calc(100vh-32px)]">
        <ProjectTree
          projects={mockProjects}
          {projectSessions}
          {projectSessionData}
          {expandedProjects}
          selectedSession={mockSessions[0]}
          loadingProject={null}
          onToggleProject={noop}
          onSelectSession={noop}
          onRenameSession={noopEvent}
          onDeleteSession={noopEvent}
          onMoveSession={noop}
          onResumeSession={noopEvent}
        />

        <SessionViewer
          session={mockSessions[0]}
          messages={mockMessages}
          todos={mockTodos}
          agents={[
            { id: 'agent-explore-1', messageCount: 12 },
            { id: 'agent-bash-1', messageCount: 5 },
          ]}
          customTitle="Authentication Implementation"
          currentSummary="Implementing JWT-based authentication with refresh tokens"
          onDeleteMessage={noop}
          onMessagesChange={noop}
          onEditTitle={noop}
          onSplitSession={noop}
        />
      </div>
    </div>
  {/snippet}
</Story>

<Story name="Empty State">
  {#snippet children(_args)}
    <div class="h-screen bg-gh-bg text-gh-text p-4">
      <div class="grid grid-cols-[350px_1fr] gap-4 h-[calc(100vh-32px)]">
        <ProjectTree
          projects={mockProjects}
          projectSessions={new Map()}
          projectSessionData={new Map()}
          expandedProjects={new Set()}
          selectedSession={null}
          loadingProject={null}
          onToggleProject={noop}
          onSelectSession={noop}
          onRenameSession={noopEvent}
          onDeleteSession={noopEvent}
          onMoveSession={noop}
          onResumeSession={noopEvent}
        />

        <SessionViewer
          session={null}
          messages={[]}
          todos={[]}
          agents={[]}
          onDeleteMessage={noop}
          onMessagesChange={noop}
          onEditTitle={noop}
          onSplitSession={noop}
        />
      </div>
    </div>
  {/snippet}
</Story>
