<script module>
  import { defineMeta } from '@storybook/addon-svelte-csf'
  import ValidationBadge from './ValidationBadge.svelte'

  const { Story } = defineMeta({
    title: 'Components/ValidationBadge',
    component: ValidationBadge,
    tags: ['autodocs'],
    parameters: {
      layout: 'centered',
    },
  })
</script>

<Story
  name="Single Chain Error"
  args={{
    chainErrors: [{ type: 'broken_chain', uuid: 'msg-1', line: 42, parentUuid: null }],
  }}
>
  {#snippet children(args)}
    <div class="p-8 bg-gh-bg">
      <ValidationBadge {...args} />
    </div>
  {/snippet}
</Story>

<Story
  name="Multiple Chain Errors"
  args={{
    chainErrors: [
      { type: 'broken_chain', uuid: 'msg-1', line: 10, parentUuid: null },
      { type: 'orphan_parent', uuid: 'msg-2', line: 25, parentUuid: 'dead-ref-1' },
      { type: 'broken_chain', uuid: 'msg-3', line: 58, parentUuid: null },
    ],
  }}
>
  {#snippet children(args)}
    <div class="p-8 bg-gh-bg">
      <ValidationBadge {...args} />
    </div>
  {/snippet}
</Story>

<Story
  name="With Repair Button"
  args={{
    chainErrors: [{ type: 'broken_chain', uuid: 'msg-1', line: 42, parentUuid: null }],
    onRepair: () => alert('Repair triggered'),
  }}
>
  {#snippet children(args)}
    <div class="p-8 bg-gh-bg">
      <ValidationBadge {...args} />
    </div>
  {/snippet}
</Story>

<Story
  name="Repairing"
  args={{
    chainErrors: [{ type: 'broken_chain', uuid: 'msg-1', line: 42, parentUuid: null }],
    onRepair: () => {},
    isRepairing: true,
  }}
>
  {#snippet children(args)}
    <div class="p-8 bg-gh-bg">
      <ValidationBadge {...args} />
    </div>
  {/snippet}
</Story>

<Story
  name="Progress Errors"
  args={{
    progressErrors: [
      { type: 'unwanted_progress', line: 5, hookName: 'pre-commit', hookEvent: 'PreToolUse' },
      { type: 'unwanted_progress', line: 12, messageType: 'progress' },
    ],
  }}
>
  {#snippet children(args)}
    <div class="p-8 bg-gh-bg">
      <ValidationBadge {...args} />
    </div>
  {/snippet}
</Story>

<Story
  name="Progress With Remove Button"
  args={{
    progressErrors: [{ type: 'unwanted_progress', line: 5, hookName: 'pre-commit' }],
    onRepairProgress: () => alert('Remove triggered'),
  }}
>
  {#snippet children(args)}
    <div class="p-8 bg-gh-bg">
      <ValidationBadge {...args} />
    </div>
  {/snippet}
</Story>

<Story
  name="Both Error Types"
  args={{
    chainErrors: [{ type: 'broken_chain', uuid: 'msg-1', line: 10, parentUuid: null }],
    progressErrors: [{ type: 'unwanted_progress', line: 5, hookName: 'pre-commit' }],
    onRepair: () => alert('Chain repair'),
    onRepairProgress: () => alert('Progress remove'),
  }}
>
  {#snippet children(args)}
    <div class="p-8 bg-gh-bg">
      <ValidationBadge {...args} />
    </div>
  {/snippet}
</Story>

<Story name="No Errors">
  {#snippet children()}
    <div class="p-8 bg-gh-bg">
      <p class="text-gh-text-secondary text-sm">No badge rendered when no errors</p>
      <ValidationBadge />
    </div>
  {/snippet}
</Story>
