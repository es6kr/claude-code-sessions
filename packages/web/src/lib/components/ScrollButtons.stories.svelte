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

  const NAV_MODE_KEY = 'claude-sessions-nav-mode'
  const clearNavMode = () => {
    localStorage.removeItem(NAV_MODE_KEY)
  }

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

<Story name="Default (User Mode)">
  {#snippet children(args)}
    {@const _ = clearNavMode()}
    <div class="p-4 bg-gh-canvas text-gh-text">
      <p class="text-sm text-gh-text-secondary mb-4">
        Click the middle button to open navigation mode dropdown with 5 options
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
    {@const _ = clearNavMode()}
    <div class="p-4 bg-gh-canvas text-gh-text">
      <p class="text-sm text-gh-text-secondary mb-4">
        Single user message — only user mode has targets
      </p>
      <ScrollButtons {...args} />
    </div>
  {/snippet}
</Story>

<Story
  name="Rich Message Mix"
  args={{
    messages: [
      ...baseMessages,
      {
        uuid: 'msg-10',
        type: 'assistant',
        timestamp: '2025-01-01T00:09:00Z',
        message: { content: 'Here is a detailed response with text content' },
      },
      {
        uuid: 'msg-11',
        type: 'assistant',
        timestamp: '2025-01-01T00:10:00Z',
        message: { content: [{ type: 'text', text: 'Multi-part assistant message' }] },
      },
    ],
  }}
>
  {#snippet children(args)}
    {@const _ = clearNavMode()}
    <div class="p-4 bg-gh-canvas text-gh-text">
      <p class="text-sm text-gh-text-secondary mb-4">
        Mixed messages including assistant responses — try Assistant and All modes
      </p>
      <ScrollButtons {...args} />
    </div>
  {/snippet}
</Story>

<Story name="Empty Messages" args={{ messages: [] }}>
  {#snippet children(args)}
    {@const _ = clearNavMode()}
    <div class="p-4 bg-gh-canvas text-gh-text">
      <p class="text-sm text-gh-text-secondary mb-4">No messages — buttons hidden</p>
      <ScrollButtons {...args} />
    </div>
  {/snippet}
</Story>
