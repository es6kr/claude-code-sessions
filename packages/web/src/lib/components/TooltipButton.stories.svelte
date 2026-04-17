<script module>
  import { defineMeta } from '@storybook/addon-svelte-csf'
  import TooltipButton from './TooltipButton.svelte'

  const { Story } = defineMeta({
    title: 'Components/TooltipButton',
    component: TooltipButton,
    tags: ['autodocs'],
    argTypes: {
      position: {
        control: 'select',
        options: ['top', 'bottom'],
      },
    },
    parameters: {
      layout: 'centered',
    },
  })
</script>

<Story name="Default" args={{ title: 'Click to perform action', position: 'bottom' }}>
  {#snippet children(args)}
    <div class="p-20 bg-gh-bg flex items-center justify-center">
      <TooltipButton {...args}>
        <span class="text-gh-text-primary text-lg">🔧</span>
      </TooltipButton>
    </div>
  {/snippet}
</Story>

<Story name="Tooltip Top" args={{ title: 'Tooltip appears above', position: 'top' }}>
  {#snippet children(args)}
    <div class="p-20 bg-gh-bg flex items-center justify-center">
      <TooltipButton {...args}>
        <span class="text-gh-text-primary text-lg">⬆️</span>
      </TooltipButton>
    </div>
  {/snippet}
</Story>

<Story
  name="Disabled"
  args={{ title: 'This button is disabled', position: 'bottom', disabled: true }}
>
  {#snippet children(args)}
    <div class="p-20 bg-gh-bg flex items-center justify-center">
      <TooltipButton {...args}>
        <span class="text-gh-text-secondary text-lg opacity-50">🚫</span>
      </TooltipButton>
    </div>
  {/snippet}
</Story>

<Story name="With Text" args={{ title: 'Compress session', position: 'bottom' }}>
  {#snippet children(args)}
    <div class="p-20 bg-gh-bg flex items-center justify-center">
      <TooltipButton {...args} class="px-2 py-1 rounded bg-gh-btn text-gh-text-primary text-sm">
        Compress
      </TooltipButton>
    </div>
  {/snippet}
</Story>
