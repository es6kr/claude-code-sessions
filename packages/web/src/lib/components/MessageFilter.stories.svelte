<script module>
  import { defineMeta } from '@storybook/addon-svelte-csf'
  import { fn } from 'storybook/test'
  import MessageFilter from './MessageFilter.svelte'
  import { DEFAULT_VISIBLE_CATEGORIES } from '$lib/utils'

  const { Story } = defineMeta({
    title: 'Components/MessageFilter',
    component: MessageFilter,
    tags: ['autodocs'],
    parameters: {
      layout: 'padded',
    },
  })

  const sampleMessages = [
    { uuid: '1', type: 'human', message: { content: 'Hello' } },
    { uuid: '2', type: 'assistant', message: { content: [{ type: 'text', text: 'Hi there!' }] } },
    {
      uuid: '3',
      type: 'assistant',
      message: { content: [{ type: 'thinking', thinking: 'Let me think...' }] },
    },
    {
      uuid: '4',
      type: 'assistant',
      message: {
        content: [{ type: 'tool_use', id: 'tu1', name: 'Read', input: { path: '/tmp' } }],
      },
    },
    {
      uuid: '5',
      type: 'user',
      message: { content: [{ type: 'tool_result', tool_use_id: 'tu1', content: 'file data' }] },
    },
    { uuid: '6', type: 'system', subtype: 'local_command', content: 'git status' },
    { uuid: '7', type: 'summary', summary: 'Session summary text' },
    { uuid: '8', type: 'user', message: { content: 'Another question' } },
    {
      uuid: '9',
      type: 'assistant',
      message: { content: [{ type: 'text', text: 'Another answer' }] },
    },
    { uuid: '10', type: 'progress', data: { type: 'hook_progress' } },
  ]
</script>

<Story
  name="Default Filter"
  args={{
    messages: sampleMessages,
    visibleCategories: new Set(DEFAULT_VISIBLE_CATEGORIES),
    onToggle: fn(),
    onShowAll: fn(),
    onReset: fn(),
  }}
>
  {#snippet children(args)}
    <div class="bg-gh-bg p-2">
      <MessageFilter {...args} />
    </div>
  {/snippet}
</Story>

<Story
  name="All Categories Visible"
  args={{
    messages: sampleMessages,
    visibleCategories: new Set([
      'user',
      'assistant',
      'thinking',
      'tool_use',
      'tool_result',
      'system',
      'summary',
      'progress',
    ]),
    onToggle: fn(),
    onShowAll: fn(),
    onReset: fn(),
  }}
>
  {#snippet children(args)}
    <div class="bg-gh-bg p-2">
      <MessageFilter {...args} />
    </div>
  {/snippet}
</Story>

<Story
  name="Only User Messages"
  args={{
    messages: sampleMessages,
    visibleCategories: new Set(['user']),
    onToggle: fn(),
    onShowAll: fn(),
    onReset: fn(),
  }}
>
  {#snippet children(args)}
    <div class="bg-gh-bg p-2">
      <MessageFilter {...args} />
    </div>
  {/snippet}
</Story>
