<script module>
  import { defineMeta } from '@storybook/addon-svelte-csf'
  import ValidationDemo from './ValidationDemo.svelte'

  const { Story } = defineMeta({
    title: 'Utilities/ValidationDemo',
    component: ValidationDemo,
    tags: ['autodocs'],
    parameters: {
      layout: 'padded',
    },
  })

  // Real-world scenario from crud.test.ts
  const validChain = [
    {
      type: 'assistant',
      uuid: '42a525c3-9656-4619-b0f7-f3099a3082ec',
      parentUuid: null,
      timestamp: '2026-01-20T04:35:23.280Z',
      message: {
        role: 'assistant',
        content: [
          {
            type: 'tool_use',
            id: 'toolu_01L9za',
            name: 'Write',
            input: { file_path: '/tmp/test.ts', content: 'hello' },
          },
        ],
      },
    },
    {
      type: 'file-history-snapshot',
      messageId: '42a525c3-9656-4619-b0f7-f3099a3082ec',
      timestamp: '2026-01-20T04:35:23.300Z',
      snapshot: { trackedFileBackups: { '/tmp/test.ts': { backupFileName: 'test.ts.bak' } } },
    },
    {
      type: 'user',
      uuid: 'da7e4183-fedd-4075-81ca-7ba40aa162e8',
      parentUuid: '42a525c3-9656-4619-b0f7-f3099a3082ec',
      timestamp: '2026-01-20T04:35:23.332Z',
      message: {
        role: 'user',
        content: [
          {
            type: 'tool_result',
            tool_use_id: 'toolu_01L9za',
            content: 'File written successfully',
          },
        ],
      },
    },
    {
      type: 'progress',
      uuid: '30e9bb84-a7b8-4e56-9f0b-01b00541b3e9',
      parentUuid: 'da7e4183-fedd-4075-81ca-7ba40aa162e8',
      timestamp: '2026-01-20T04:35:23.354Z',
      data: { type: 'hook_progress', hookEvent: 'PostToolUse' },
    },
    {
      type: 'assistant',
      uuid: '05aa9fcd-674e-4945-80db-e8e1c5eeea44',
      parentUuid: '30e9bb84-a7b8-4e56-9f0b-01b00541b3e9',
      timestamp: '2026-01-20T04:35:27.376Z',
      message: {
        role: 'assistant',
        content: [{ type: 'thinking', thinking: 'Let me analyze the result...' }],
      },
    },
  ]

  // Broken chain - parentUuid is null for non-first message
  const brokenChain = [
    {
      type: 'assistant',
      uuid: '42a525c3-9656-4619-b0f7-f3099a3082ec',
      parentUuid: null,
      timestamp: '2026-01-20T04:35:23.280Z',
      message: {
        role: 'assistant',
        content: [
          {
            type: 'tool_use',
            id: 'toolu_01L9za',
            name: 'Write',
            input: { file_path: '/tmp/test.ts', content: 'hello' },
          },
        ],
      },
    },
    {
      type: 'user',
      uuid: 'da7e4183-fedd-4075-81ca-7ba40aa162e8',
      parentUuid: null, // BROKEN - should reference previous message
      timestamp: '2026-01-20T04:35:23.332Z',
      message: {
        role: 'user',
        content: [
          {
            type: 'tool_result',
            tool_use_id: 'toolu_01L9za',
            content: 'File written successfully',
          },
        ],
      },
    },
    {
      type: 'assistant',
      uuid: '05aa9fcd-674e-4945-80db-e8e1c5eeea44',
      parentUuid: 'da7e4183-fedd-4075-81ca-7ba40aa162e8',
      timestamp: '2026-01-20T04:35:27.376Z',
      message: {
        role: 'assistant',
        content: [{ type: 'text', text: 'Done! File has been written.' }],
      },
    },
  ]

  // Orphan tool_result - no matching tool_use
  const orphanToolResult = [
    {
      type: 'assistant',
      uuid: '42a525c3-9656-4619-b0f7-f3099a3082ec',
      parentUuid: null,
      timestamp: '2026-01-20T04:35:23.280Z',
      message: {
        role: 'assistant',
        content: [
          {
            type: 'tool_use',
            id: 'toolu_01L9za',
            name: 'Write',
            input: { file_path: '/tmp/test.ts', content: 'hello' },
          },
        ],
      },
    },
    {
      type: 'user',
      uuid: 'da7e4183-fedd-4075-81ca-7ba40aa162e8',
      parentUuid: '42a525c3-9656-4619-b0f7-f3099a3082ec',
      timestamp: '2026-01-20T04:35:23.332Z',
      message: {
        role: 'user',
        content: [
          { type: 'tool_result', tool_use_id: 'non_existent_tool_id', content: 'Orphan result!' },
        ], // ORPHAN
      },
    },
  ]

  // Missing parentUuid (undefined)
  const undefinedParent = [
    {
      type: 'human',
      uuid: 'first-user',
      // parentUuid is undefined (missing)
      timestamp: '2026-01-20T04:35:00.000Z',
      message: { role: 'user', content: 'Hello, can you help me?' },
    },
    {
      type: 'assistant',
      uuid: 'second-assistant',
      parentUuid: 'first-user',
      timestamp: '2026-01-20T04:35:01.000Z',
      message: {
        role: 'assistant',
        content: [{ type: 'text', text: 'Hi! How can I assist you today?' }],
      },
    },
  ]
</script>

<Story name="Valid Chain" args={{ initialMessages: validChain, title: 'Valid Chain' }}>
  {#snippet children(args)}
    <ValidationDemo {...args} />
  {/snippet}
</Story>

<Story
  name="Broken Chain (null parentUuid)"
  args={{ initialMessages: brokenChain, title: 'Broken Chain' }}
>
  {#snippet children(args)}
    <ValidationDemo {...args} />
  {/snippet}
</Story>

<Story
  name="Orphan Tool Result"
  args={{ initialMessages: orphanToolResult, title: 'Orphan Tool Result' }}
>
  {#snippet children(args)}
    <ValidationDemo {...args} />
  {/snippet}
</Story>

<Story
  name="Undefined parentUuid"
  args={{ initialMessages: undefinedParent, title: 'Undefined parentUuid' }}
>
  {#snippet children(args)}
    <ValidationDemo {...args} />
  {/snippet}
</Story>
