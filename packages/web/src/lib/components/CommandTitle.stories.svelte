<script module>
  import { defineMeta } from '@storybook/addon-svelte-csf'
  import CommandTitle from './CommandTitle.svelte'

  const { Story } = defineMeta({
    title: 'Components/CommandTitle',
    component: CommandTitle,
    tags: ['autodocs'],
    argTypes: {
      title: { control: 'text' },
      class: { control: 'text' },
    },
  })
</script>

<Story name="Command Only" args={{ title: '/vsix' }}>
  {#snippet children(args)}
    <div class="p-4 bg-gh-canvas text-gh-text">
      <CommandTitle {...args} />
    </div>
  {/snippet}
</Story>

<Story
  name="Command With Args"
  args={{ title: '/session repair --dry-run e15f9f9a-db7a-4729-965c-c0beb8d75039' }}
>
  {#snippet children(args)}
    <div class="p-4 bg-gh-canvas text-gh-text">
      <CommandTitle {...args} />
    </div>
  {/snippet}
</Story>

<Story name="Command With Multiple Args" args={{ title: '/commit -m "Fix bug" --no-verify' }}>
  {#snippet children(args)}
    <div class="p-4 bg-gh-canvas text-gh-text">
      <CommandTitle {...args} />
    </div>
  {/snippet}
</Story>

<Story name="Normal Text" args={{ title: 'This is normal text without slash command' }}>
  {#snippet children(args)}
    <div class="p-4 bg-gh-canvas text-gh-text">
      <CommandTitle {...args} />
    </div>
  {/snippet}
</Story>

<Story name="Custom Class" args={{ title: '/test custom-class', class: 'text-lg font-bold' }}>
  {#snippet children(args)}
    <div class="p-4 bg-gh-canvas text-gh-text">
      <CommandTitle {...args} />
    </div>
  {/snippet}
</Story>

<Story
  name="Plain Text With Embedded JSON"
  args={{
    title:
      'display title with parseCommandMessage not applied - {"message":{"content":"<command-name>/session</command-name>\\n<command-args>repair</command-args>"}}',
  }}
>
  {#snippet children(args)}
    <div class="p-4 bg-gh-canvas text-gh-text">
      <div class="space-y-2">
        <div class="text-sm text-gh-text-secondary">
          Plain text (no slash prefix) — embedded JSON rendered as-is, no command parsing:
        </div>
        <CommandTitle {...args} />
      </div>
    </div>
  {/snippet}
</Story>
