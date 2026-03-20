<script module>
  import { defineMeta } from '@storybook/addon-svelte-csf'
  import MessageItem from './MessageItem.svelte'

  const { Story } = defineMeta({
    title: 'Components/MessageItem',
    component: MessageItem,
    tags: ['autodocs'],
  })

  /** Slash command without args */
  const slashCommandNoArgs = {
    uuid: 'msg-1',
    type: 'human',
    timestamp: new Date().toISOString(),
    message: {
      content: '<command-name>/vsix</command-name>',
    },
  }

  /** Slash command with args */
  const slashCommandWithArgs = {
    uuid: 'msg-2',
    type: 'human',
    timestamp: new Date().toISOString(),
    message: {
      content:
        '<command-name>/session</command-name>\n<command-args>repair --dry-run e15f9f9a</command-args>',
    },
  }

  /** Slash command with short args */
  const slashCommandShortArgs = {
    uuid: 'msg-3',
    type: 'human',
    timestamp: new Date().toISOString(),
    message: {
      content: '<command-name>/skill-name</command-name>\n<command-args>topic</command-args>',
    },
  }

  const noop = () => {}
</script>

<Story name="Slash Command Without Args">
  {#snippet children()}
    <div class="p-4 bg-gh-canvas text-gh-text max-w-2xl">
      <MessageItem msg={slashCommandNoArgs} sessionId="test-session" onDelete={noop} />
    </div>
  {/snippet}
</Story>

<Story name="Slash Command With Args">
  {#snippet children()}
    <div class="p-4 bg-gh-canvas text-gh-text max-w-2xl">
      <MessageItem msg={slashCommandWithArgs} sessionId="test-session" onDelete={noop} />
    </div>
  {/snippet}
</Story>

<Story name="Slash Command With Short Args">
  {#snippet children()}
    <div class="p-4 bg-gh-canvas text-gh-text max-w-2xl">
      <MessageItem msg={slashCommandShortArgs} sessionId="test-session" onDelete={noop} />
    </div>
  {/snippet}
</Story>
