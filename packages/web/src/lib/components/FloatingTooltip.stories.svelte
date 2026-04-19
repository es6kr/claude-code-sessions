<script module>
  import { defineMeta } from '@storybook/addon-svelte-csf'
  import FloatingTooltip from './FloatingTooltip.svelte'

  const { Story } = defineMeta({
    title: 'Components/FloatingTooltip',
    component: FloatingTooltip,
    tags: ['autodocs'],
    parameters: {
      layout: 'centered',
    },
  })
</script>

<Story name="Default" args={{ content: 'Session created 3 days ago' }}>
  {#snippet children(args)}
    <div class="p-20 bg-gh-bg">
      <FloatingTooltip {...args}>
        <span class="text-gh-text-primary cursor-default px-3 py-1 border border-gh-border rounded">
          Hover me
        </span>
      </FloatingTooltip>
    </div>
  {/snippet}
</Story>

<Story
  name="Long Content"
  args={{
    content:
      '/Users/demo/projects/my-app/src/components/Header.tsx\nLine 42-58\nSelected: export default function Header()',
  }}
>
  {#snippet children(args)}
    <div class="p-20 bg-gh-bg">
      <FloatingTooltip {...args}>
        <span
          class="text-blue-400 cursor-default px-3 py-1 bg-blue-900/20 rounded font-mono text-sm"
        >
          Header.tsx
        </span>
      </FloatingTooltip>
    </div>
  {/snippet}
</Story>

<Story name="In List Context" args={{ content: 'Last active: 2 hours ago' }}>
  {#snippet children(args)}
    <div class="p-8 bg-gh-bg space-y-2">
      {#each ['Project Alpha', 'Project Beta', 'Project Gamma'] as name}
        <FloatingTooltip {...args} content={`${name}: ${args.content}`}>
          <div
            class="px-3 py-2 border border-gh-border rounded text-gh-text-primary text-sm hover:bg-gh-btn transition-colors cursor-default"
          >
            📁 {name}
          </div>
        </FloatingTooltip>
      {/each}
    </div>
  {/snippet}
</Story>
