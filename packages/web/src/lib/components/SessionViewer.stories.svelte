<script module>
  import { defineMeta } from '@storybook/addon-svelte-csf'
  import SessionViewer from './SessionViewer.svelte'

  const { Story } = defineMeta({
    title: 'Components/SessionViewer',
    component: SessionViewer,
    tags: ['autodocs'],
    parameters: {
      layout: 'fullscreen',
    },
  })

  const mockSession = {
    id: 'demo-session-id',
    projectName: 'demo-project',
    title: 'Demo Session',
    messageCount: 3,
    updatedAt: '2026-01-20T10:00:00.000Z',
  }

  const mockMessages = [
    {
      type: 'user',
      uuid: 'user-1',
      parentUuid: null,
      timestamp: '2026-01-20T10:00:00.000Z',
      message: { role: 'user', content: 'Hello, can you help me?' },
    },
    {
      type: 'assistant',
      uuid: 'assistant-1',
      parentUuid: 'user-1',
      timestamp: '2026-01-20T10:00:05.000Z',
      message: {
        role: 'assistant',
        content: [{ type: 'text', text: 'Of course! How can I help you today?' }],
      },
    },
    {
      type: 'user',
      uuid: 'user-2',
      parentUuid: 'assistant-1',
      timestamp: '2026-01-20T10:00:30.000Z',
      message: { role: 'user', content: 'Write a hello world function in TypeScript.' },
    },
  ]

  const mockTodos = [
    { content: 'Implement feature', status: 'completed' },
    { content: 'Write tests', status: 'in_progress' },
    { content: 'Update docs', status: 'pending' },
  ]

  const noop = () => {}
</script>

<Story
  name="Default"
  args={{
    session: mockSession,
    messages: mockMessages,
    enableScroll: true,
  }}
>
  {#snippet children(args)}
    <div class="bg-gh-canvas" style="height: 600px;">
      <SessionViewer {...args} />
    </div>
  {/snippet}
</Story>

<Story
  name="With All Header Buttons"
  args={{
    session: mockSession,
    messages: mockMessages,
    backUrl: '/',
    onResumeSession: noop,
    onRenameSession: noop,
    onCompressSession: noop,
    onDeleteSession: noop,
    enableScroll: true,
  }}
>
  {#snippet children(args)}
    <div class="bg-gh-canvas" style="height: 600px;">
      <SessionViewer {...args} />
    </div>
  {/snippet}
</Story>

<Story
  name="With Compress Button Only"
  args={{
    session: mockSession,
    messages: mockMessages,
    onCompressSession: noop,
    enableScroll: true,
  }}
>
  {#snippet children(args)}
    <div class="bg-gh-canvas" style="height: 600px;">
      <SessionViewer {...args} />
    </div>
  {/snippet}
</Story>

<Story
  name="With Resume Button"
  args={{
    session: mockSession,
    messages: mockMessages,
    onResumeSession: noop,
    enableScroll: true,
  }}
>
  {#snippet children(args)}
    <div class="bg-gh-canvas" style="height: 600px;">
      <SessionViewer {...args} />
    </div>
  {/snippet}
</Story>

<Story
  name="With Todos"
  args={{
    session: mockSession,
    messages: mockMessages,
    todos: mockTodos,
    onResumeSession: noop,
    onRenameSession: noop,
    onCompressSession: noop,
    onDeleteSession: noop,
    enableScroll: true,
  }}
>
  {#snippet children(args)}
    <div class="bg-gh-canvas" style="height: 600px;">
      <SessionViewer {...args} />
    </div>
  {/snippet}
</Story>

<Story
  name="No Session Selected"
  args={{
    session: null,
    messages: [],
    enableScroll: true,
  }}
>
  {#snippet children(args)}
    <div class="bg-gh-canvas" style="height: 400px;">
      <SessionViewer {...args} />
    </div>
  {/snippet}
</Story>

<Story
  name="Empty Messages"
  args={{
    session: mockSession,
    messages: [],
    onResumeSession: noop,
    onRenameSession: noop,
    onCompressSession: noop,
    onDeleteSession: noop,
    enableScroll: true,
  }}
>
  {#snippet children(args)}
    <div class="bg-gh-canvas" style="height: 400px;">
      <SessionViewer {...args} />
    </div>
  {/snippet}
</Story>
