<script module>
  import { defineMeta } from '@storybook/addon-svelte-csf'
  import MessageList from './MessageList.svelte'

  const { Story } = defineMeta({
    title: 'Components/MessageList',
    component: MessageList,
    tags: ['autodocs'],
    parameters: {
      layout: 'padded',
    },
  })

  const mockSessionId = 'demo-session'

  // Basic conversation
  const basicMessages = [
    {
      type: 'user',
      uuid: 'user-1',
      parentUuid: null,
      timestamp: '2026-01-20T10:00:00.000Z',
      message: { role: 'user', content: 'Hello, can you help me with a coding task?' },
    },
    {
      type: 'assistant',
      uuid: 'assistant-1',
      parentUuid: 'user-1',
      timestamp: '2026-01-20T10:00:05.000Z',
      message: {
        role: 'assistant',
        content: [{ type: 'text', text: 'Of course! I would be happy to help. What do you need?' }],
      },
    },
    {
      type: 'user',
      uuid: 'user-2',
      parentUuid: 'assistant-1',
      timestamp: '2026-01-20T10:00:30.000Z',
      message: { role: 'user', content: 'Can you write a function to calculate factorial?' },
    },
    {
      type: 'assistant',
      uuid: 'assistant-2',
      parentUuid: 'user-2',
      timestamp: '2026-01-20T10:00:35.000Z',
      message: {
        role: 'assistant',
        content: [
          {
            type: 'text',
            text: 'Here is a factorial function:\n\n```typescript\nfunction factorial(n: number): number {\n  if (n <= 1) return 1;\n  return n * factorial(n - 1);\n}\n```',
          },
        ],
      },
    },
  ]

  // Messages with tool use
  const toolUseMessages = [
    {
      type: 'user',
      uuid: 'user-1',
      parentUuid: null,
      timestamp: '2026-01-20T10:00:00.000Z',
      message: { role: 'user', content: 'Read the package.json file' },
    },
    {
      type: 'assistant',
      uuid: 'assistant-1',
      parentUuid: 'user-1',
      timestamp: '2026-01-20T10:00:05.000Z',
      message: {
        role: 'assistant',
        content: [
          {
            type: 'tool_use',
            id: 'toolu_read_1',
            name: 'Read',
            input: { file_path: '/project/package.json' },
          },
        ],
      },
    },
    {
      type: 'user',
      uuid: 'user-2',
      parentUuid: 'assistant-1',
      timestamp: '2026-01-20T10:00:06.000Z',
      message: {
        role: 'user',
        content: [
          {
            type: 'tool_result',
            tool_use_id: 'toolu_read_1',
            content: '{\n  "name": "my-project",\n  "version": "1.0.0"\n}',
          },
        ],
      },
    },
    {
      type: 'assistant',
      uuid: 'assistant-2',
      parentUuid: 'user-2',
      timestamp: '2026-01-20T10:00:10.000Z',
      message: {
        role: 'assistant',
        content: [
          {
            type: 'text',
            text: 'The package.json shows this is "my-project" at version 1.0.0.',
          },
        ],
      },
    },
  ]

  // Messages with file-history-snapshot (same messageId as assistant uuid)
  const snapshotMessages = [
    {
      type: 'assistant',
      uuid: 'shared-uuid-123',
      parentUuid: null,
      timestamp: '2026-01-20T10:00:00.000Z',
      message: {
        role: 'assistant',
        content: [
          {
            type: 'tool_use',
            id: 'toolu_write_1',
            name: 'Write',
            input: { file_path: '/tmp/test.ts', content: 'console.log("hello")' },
          },
        ],
      },
    },
    {
      type: 'file-history-snapshot',
      messageId: 'shared-uuid-123',
      timestamp: '2026-01-20T10:00:01.000Z',
      snapshot: {
        trackedFileBackups: {
          '/tmp/test.ts': { backupFileName: 'test.ts.bak' },
        },
      },
    },
    {
      type: 'user',
      uuid: 'user-1',
      parentUuid: 'shared-uuid-123',
      timestamp: '2026-01-20T10:00:02.000Z',
      message: {
        role: 'user',
        content: [
          {
            type: 'tool_result',
            tool_use_id: 'toolu_write_1',
            content: 'File written successfully',
          },
        ],
      },
    },
  ]

  // Empty messages
  const emptyMessages = []

  // Handlers for actions
  const handleDelete = (msg) => console.log('Delete:', msg.uuid)
  const handleEditTitle = (msg) => console.log('Edit title:', msg.uuid)
  const handleSplit = (msg) => console.log('Split at:', msg.uuid)
</script>

<Story
  name="Basic Conversation"
  args={{
    sessionId: mockSessionId,
    messages: basicMessages,
    onDeleteMessage: handleDelete,
    onEditTitle: handleEditTitle,
    onSplitSession: handleSplit,
  }}
>
  {#snippet children(args)}
    <div class="max-w-4xl">
      <MessageList {...args} />
    </div>
  {/snippet}
</Story>

<Story
  name="With Tool Use"
  args={{
    sessionId: mockSessionId,
    messages: toolUseMessages,
    onDeleteMessage: handleDelete,
    onEditTitle: handleEditTitle,
    onSplitSession: handleSplit,
  }}
>
  {#snippet children(args)}
    <div class="max-w-4xl">
      <MessageList {...args} />
    </div>
  {/snippet}
</Story>

<Story
  name="With File History Snapshot"
  args={{
    sessionId: mockSessionId,
    messages: snapshotMessages,
    onDeleteMessage: handleDelete,
    onEditTitle: handleEditTitle,
    onSplitSession: handleSplit,
  }}
>
  {#snippet children(args)}
    <div class="max-w-4xl">
      <MessageList {...args} />
    </div>
  {/snippet}
</Story>

<Story
  name="Full Width"
  args={{
    sessionId: mockSessionId,
    messages: basicMessages,
    onDeleteMessage: handleDelete,
    fullWidth: true,
  }}
>
  {#snippet children(args)}
    <MessageList {...args} />
  {/snippet}
</Story>

<Story
  name="Empty Messages"
  args={{
    sessionId: mockSessionId,
    messages: emptyMessages,
    onDeleteMessage: handleDelete,
  }}
>
  {#snippet children(args)}
    <div class="max-w-4xl">
      <MessageList {...args} />
    </div>
  {/snippet}
</Story>
