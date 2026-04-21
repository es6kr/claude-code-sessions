<script module>
  import { defineMeta } from '@storybook/addon-svelte-csf'
  import IdeTag from './IdeTag.svelte'

  const { Story } = defineMeta({
    title: 'Components/IdeTag',
    component: IdeTag,
    tags: ['autodocs'],
    argTypes: {
      tag: {
        control: 'select',
        options: ['ide_opened_file', 'ide_selection', 'ide_unknown'],
      },
      content: { control: 'text' },
    },
  })
</script>

<Story
  name="Opened File With Path"
  args={{ tag: 'ide_opened_file', content: 'opened the file /src/lib/utils.ts' }}
>
  {#snippet children(args)}
    <div class="p-4 bg-gh-canvas text-gh-text">
      <IdeTag {...args} />
    </div>
  {/snippet}
</Story>

<Story
  name="Opened File Without Path"
  args={{ tag: 'ide_opened_file', content: 'some content without a file path' }}
>
  {#snippet children(args)}
    <div class="p-4 bg-gh-canvas text-gh-text">
      <IdeTag {...args} />
    </div>
  {/snippet}
</Story>

<Story
  name="Selection With Path And Lines"
  args={{
    tag: 'ide_selection',
    content: 'selected lines 10 to 25 from /src/lib/components/SessionViewer.svelte',
  }}
>
  {#snippet children(args)}
    <div class="p-4 bg-gh-canvas text-gh-text">
      <IdeTag {...args} />
    </div>
  {/snippet}
</Story>

<Story
  name="Selection Single Line"
  args={{ tag: 'ide_selection', content: 'selected line 42 from /src/routes/+page.svelte' }}
>
  {#snippet children(args)}
    <div class="p-4 bg-gh-canvas text-gh-text">
      <IdeTag {...args} />
    </div>
  {/snippet}
</Story>

<Story
  name="Selection Without Path"
  args={{
    tag: 'ide_selection',
    content: 'const result = sessions.filter(s => s.isActive).map(s => s.title)',
  }}
>
  {#snippet children(args)}
    <div class="p-4 bg-gh-canvas text-gh-text">
      <IdeTag {...args} />
    </div>
  {/snippet}
</Story>

<Story
  name="Direct Path"
  args={{ tag: 'ide_opened_file', content: '/packages/core/src/session.ts' }}
>
  {#snippet children(args)}
    <div class="p-4 bg-gh-canvas text-gh-text">
      <IdeTag {...args} />
    </div>
  {/snippet}
</Story>

<Story
  name="Unknown Tag"
  args={{ tag: 'ide_custom_tag', content: 'unexpected IDE tag content here' }}
>
  {#snippet children(args)}
    <div class="p-4 bg-gh-canvas text-gh-text">
      <IdeTag {...args} />
    </div>
  {/snippet}
</Story>

<Story
  name="All Variants"
  parameters={{
    docs: { description: { story: 'All IdeTag variants side by side for comparison' } },
  }}
>
  {#snippet children()}
    <div class="p-4 bg-gh-canvas text-gh-text space-y-3">
      <IdeTag tag="ide_opened_file" content="opened the file /src/lib/api.ts" />
      <IdeTag
        tag="ide_selection"
        content="selected lines 5 to 15 from /src/lib/components/MessageItem.svelte"
      />
      <IdeTag tag="ide_selection" content="const x = computeHash(input)" />
      <IdeTag tag="ide_unknown" content="some unrecognized tag content" />
    </div>
  {/snippet}
</Story>
