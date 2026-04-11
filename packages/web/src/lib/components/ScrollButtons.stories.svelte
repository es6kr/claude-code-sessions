<script module>
  import { defineMeta } from '@storybook/addon-svelte-csf'
  import ScrollButtons from './ScrollButtons.svelte'

  // Sample messages with various types for navigation modes
  const baseMessages = [
    {
      uuid: 'msg-1',
      type: 'user',
      timestamp: '2025-01-01T00:00:00Z',
      message: { content: 'Hello' },
    },
    {
      uuid: 'msg-2',
      type: 'assistant',
      timestamp: '2025-01-01T00:01:00Z',
      message: { content: 'Hi!' },
    },
    {
      uuid: 'msg-3',
      type: 'user',
      timestamp: '2025-01-01T00:02:00Z',
      message: { content: 'How are you?' },
    },
    {
      uuid: 'msg-4',
      type: 'assistant',
      timestamp: '2025-01-01T00:03:00Z',
      isCompactSummary: true,
      message: { content: 'Compact summary point' },
    },
    {
      uuid: 'msg-5',
      type: 'progress',
      timestamp: '2025-01-01T00:04:00Z',
      data: { type: 'hook_progress', hookEvent: 'PostToolUse' },
    },
    {
      uuid: 'msg-6',
      type: 'user',
      timestamp: '2025-01-01T00:05:00Z',
      message: { content: 'Continue' },
    },
    { uuid: 'msg-7', type: 'compact_boundary', timestamp: '2025-01-01T00:06:00Z' },
    {
      uuid: 'msg-8',
      type: 'progress',
      timestamp: '2025-01-01T00:07:00Z',
      data: { type: 'hook_progress', hookEvent: 'Stop' },
    },
    {
      uuid: 'msg-9',
      type: 'user',
      timestamp: '2025-01-01T00:08:00Z',
      message: { content: 'Last message' },
    },
  ]

  const { Story } = defineMeta({
    title: 'Components/ScrollButtons',
    component: ScrollButtons,
    tags: ['autodocs'],
    args: {
      messages: baseMessages,
      scrollContainer: null,
    },
  })
</script>

<Story name="Default (Stop Hook Mode)">
  {#snippet children(args)}
    <div class="p-4 bg-gh-canvas text-gh-text">
      <p class="text-sm text-gh-text-secondary mb-4">
        Click the middle button to cycle navigation mode: Stop Hook → Compact → User
      </p>
      <ScrollButtons {...args} />
    </div>
  {/snippet}
</Story>

<Story
  name="Minimal Messages"
  args={{
    messages: [
      {
        uuid: 'msg-1',
        type: 'user',
        timestamp: '2025-01-01T00:00:00Z',
        message: { content: 'Hello' },
      },
    ],
  }}
>
  {#snippet children(args)}
    <div class="p-4 bg-gh-canvas text-gh-text">
      <p class="text-sm text-gh-text-secondary mb-4">
        Single user message — only user mode has targets
      </p>
      <ScrollButtons {...args} />
    </div>
  {/snippet}
</Story>

<Story name="Empty Messages" args={{ messages: [] }}>
  {#snippet children(args)}
    <div class="p-4 bg-gh-canvas text-gh-text">
      <p class="text-sm text-gh-text-secondary mb-4">No messages — buttons hidden</p>
      <ScrollButtons {...args} />
    </div>
  {/snippet}
</Story>
