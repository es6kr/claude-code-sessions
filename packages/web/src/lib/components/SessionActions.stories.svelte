<script module>
  import { defineMeta } from '@storybook/addon-svelte-csf'
  import { fn } from 'storybook/test'
  import SessionActions from './SessionActions.svelte'

  const { Story } = defineMeta({
    title: 'Components/SessionActions',
    component: SessionActions,
    tags: ['autodocs'],
    args: {
      onResumeSession: fn(),
      onCompressSession: fn(),
      onRenameSession: fn(),
      onDeleteSession: fn(),
    },
  })
</script>

<Story name="All Actions">
  {#snippet children(args)}
    <div class="p-4 bg-gh-canvas text-gh-text">
      <p class="text-sm text-gh-text-secondary mb-4">
        All session actions: Resume, Compress, Rename, Delete
      </p>
      <SessionActions {...args} />
    </div>
  {/snippet}
</Story>

<Story
  name="Without Resume"
  args={{
    onResumeSession: undefined,
  }}
>
  {#snippet children(args)}
    <div class="p-4 bg-gh-canvas text-gh-text">
      <p class="text-sm text-gh-text-secondary mb-4">
        Non-resumable session: Compress, Rename, Delete only
      </p>
      <SessionActions {...args} />
    </div>
  {/snippet}
</Story>

<Story
  name="Read Only"
  args={{
    onResumeSession: undefined,
    onCompressSession: undefined,
    onDeleteSession: undefined,
  }}
>
  {#snippet children(args)}
    <div class="p-4 bg-gh-canvas text-gh-text">
      <p class="text-sm text-gh-text-secondary mb-4">Read-only context: Rename only</p>
      <SessionActions {...args} />
    </div>
  {/snippet}
</Story>

<Story
  name="Destructive Only"
  args={{
    onResumeSession: undefined,
    onCompressSession: undefined,
    onRenameSession: undefined,
  }}
>
  {#snippet children(args)}
    <div class="p-4 bg-gh-canvas text-gh-text">
      <p class="text-sm text-gh-text-secondary mb-4">
        Destructive action only: Delete button in red
      </p>
      <SessionActions {...args} />
    </div>
  {/snippet}
</Story>

<Story
  name="No Actions"
  args={{
    onResumeSession: undefined,
    onCompressSession: undefined,
    onRenameSession: undefined,
    onDeleteSession: undefined,
  }}
>
  {#snippet children(args)}
    <div class="p-4 bg-gh-canvas text-gh-text">
      <p class="text-sm text-gh-text-secondary mb-4">No callbacks provided — nothing renders</p>
      <SessionActions {...args} />
      <p class="text-xs text-gh-text-secondary mt-2 italic">(Empty space above is expected)</p>
    </div>
  {/snippet}
</Story>
