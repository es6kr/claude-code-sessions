<script module>
  import { defineMeta } from '@storybook/addon-svelte-csf'
  import ScrollButtons from './ScrollButtons.svelte'

  const noop = () => {}

  // Sample messages with various types for PIN navigation
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
      pinMode: 'compact',
      onPinModeChange: noop,
    },
  })
</script>

<Story name="Default (Compact Mode)">
  {#snippet children(args)}
    <div class="p-4 bg-gh-canvas text-gh-text">
      <p class="text-sm text-gh-text-secondary mb-4">PIN mode: Compact Summary (default)</p>
      <ScrollButtons {...args} />
    </div>
  {/snippet}
</Story>

<Story name="Compact Boundary Mode" args={{ pinMode: 'compact_boundary' }}>
  {#snippet children(args)}
    <div class="p-4 bg-gh-canvas text-gh-text">
      <p class="text-sm text-gh-text-secondary mb-4">PIN mode: Compact Boundary</p>
      <ScrollButtons {...args} />
    </div>
  {/snippet}
</Story>

<Story name="Stop Hook Mode" args={{ pinMode: 'hook_stop' }}>
  {#snippet children(args)}
    <div class="p-4 bg-gh-canvas text-gh-text">
      <p class="text-sm text-gh-text-secondary mb-4">PIN mode: Stop Hook</p>
      <ScrollButtons {...args} />
    </div>
  {/snippet}
</Story>

<Story name="Any Hook Mode" args={{ pinMode: 'hook_any' }}>
  {#snippet children(args)}
    <div class="p-4 bg-gh-canvas text-gh-text">
      <p class="text-sm text-gh-text-secondary mb-4">PIN mode: Any Hook</p>
      <ScrollButtons {...args} />
    </div>
  {/snippet}
</Story>

<Story
  name="No Pin Target"
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
      <p class="text-sm text-gh-text-secondary mb-4">No pin target available (pin button hidden)</p>
      <ScrollButtons {...args} />
    </div>
  {/snippet}
</Story>
