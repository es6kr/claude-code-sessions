<script module>
  import { defineMeta } from '@storybook/addon-svelte-csf'
  import MessageEditor from './MessageEditor.svelte'

  const { Story } = defineMeta({
    title: 'Components/MessageEditor',
    component: MessageEditor,
    tags: ['autodocs'],
    parameters: {
      layout: 'fullscreen',
    },
  })
</script>

<script>
  import { fn } from 'storybook/test'

  const onSave = fn()
  const onCancel = fn()
</script>

<Story
  name="Default"
  args={{
    show: true,
    initialValue: 'Hello, this is a simple message to edit.',
  }}
>
  {#snippet children(args)}
    <div class="h-screen w-full relative bg-gh-bg">
      <MessageEditor {...args} {onSave} {onCancel} />
    </div>
  {/snippet}
</Story>

<Story
  name="With Markdown Content"
  args={{
    show: true,
    initialValue:
      '# Heading\n\nThis is a **bold** and *italic* text.\n\n- Item 1\n- Item 2\n- Item 3\n\n```typescript\nconst hello = "world";\nconsole.log(hello);\n```\n',
  }}
>
  {#snippet children(args)}
    <div class="h-screen w-full relative bg-gh-bg">
      <MessageEditor {...args} {onSave} {onCancel} />
    </div>
  {/snippet}
</Story>

<Story
  name="Empty Content"
  args={{
    show: true,
    initialValue: '',
  }}
>
  {#snippet children(args)}
    <div class="h-screen w-full relative bg-gh-bg">
      <MessageEditor {...args} {onSave} {onCancel} />
    </div>
  {/snippet}
</Story>
