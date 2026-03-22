<script module>
  import { defineMeta } from '@storybook/addon-svelte-csf'
  import MessageItem from './MessageItem.svelte'

  const noop = () => {}

  const { Story } = defineMeta({
    title: 'Components/MessageItem',
    component: MessageItem,
    tags: ['autodocs'],
    args: {
      sessionId: 'test-session',
      onDelete: noop,
    },
  })
</script>

<Story
  name="Slash Command Without Args"
  args={{
    msg: {
      uuid: 'msg-1',
      type: 'human',
      timestamp: new Date().toISOString(),
      message: { content: '<command-name>/vsix</command-name>' },
    },
  }}
>
  {#snippet children(args)}
    <div class="p-4 bg-gh-canvas text-gh-text max-w-2xl">
      <MessageItem {...args} />
    </div>
  {/snippet}
</Story>

<Story
  name="Slash Command With Args"
  args={{
    msg: {
      uuid: 'msg-2',
      type: 'human',
      timestamp: new Date().toISOString(),
      message: {
        content:
          '<command-name>/session</command-name>\n<command-args>repair --dry-run e15f9f9a</command-args>',
      },
    },
  }}
>
  {#snippet children(args)}
    <div class="p-4 bg-gh-canvas text-gh-text max-w-2xl">
      <MessageItem {...args} />
    </div>
  {/snippet}
</Story>

<Story
  name="Slash Command With Short Args"
  args={{
    msg: {
      uuid: 'msg-3',
      type: 'human',
      timestamp: new Date().toISOString(),
      message: {
        content: '<command-name>/skill-name</command-name>\n<command-args>topic</command-args>',
      },
    },
  }}
>
  {#snippet children(args)}
    <div class="p-4 bg-gh-canvas text-gh-text max-w-2xl">
      <MessageItem {...args} />
    </div>
  {/snippet}
</Story>
