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

<Story name="Default">
  <div style="height: 600px;">
    <SessionViewer session={mockSession} messages={mockMessages} enableScroll={true} />
  </div>
</Story>

<Story name="With All Header Buttons">
  <div style="height: 600px;">
    <SessionViewer
      session={mockSession}
      messages={mockMessages}
      backUrl="/"
      onRenameSession={noop}
      onCompressSession={noop}
      onDeleteSession={noop}
      enableScroll={true}
    />
  </div>
</Story>

<Story name="With Compress Button Only">
  <div style="height: 600px;">
    <SessionViewer
      session={mockSession}
      messages={mockMessages}
      onCompressSession={noop}
      enableScroll={true}
    />
  </div>
</Story>

<Story name="With Todos">
  <div style="height: 600px;">
    <SessionViewer
      session={mockSession}
      messages={mockMessages}
      todos={mockTodos}
      onRenameSession={noop}
      onCompressSession={noop}
      onDeleteSession={noop}
      enableScroll={true}
    />
  </div>
</Story>

<Story name="No Session Selected">
  <div style="height: 400px;">
    <SessionViewer session={null} messages={[]} enableScroll={true} />
  </div>
</Story>

<Story name="Empty Messages">
  <div style="height: 400px;">
    <SessionViewer
      session={mockSession}
      messages={[]}
      onRenameSession={noop}
      onCompressSession={noop}
      onDeleteSession={noop}
      enableScroll={true}
    />
  </div>
</Story>
