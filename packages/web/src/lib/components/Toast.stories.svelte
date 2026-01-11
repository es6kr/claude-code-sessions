<script module>
  import { defineMeta } from '@storybook/addon-svelte-csf'
  import Toast from './Toast.svelte'

  const { Story } = defineMeta({
    title: 'Components/Toast',
    component: Toast,
    tags: ['autodocs'],
    argTypes: {
      variant: {
        control: 'select',
        options: ['success', 'error', 'info', 'warning'],
      },
    },
    parameters: {
      layout: 'fullscreen',
    },
  })
</script>

<Story
  name="Success"
  args={{ message: 'Operation completed successfully!', variant: 'success', duration: 999999 }}
>
  {#snippet children(args)}
    <div class="h-screen w-full relative bg-gh-bg">
      <Toast {...args} />
    </div>
  {/snippet}
</Story>

<Story
  name="Error"
  args={{ message: 'An error occurred while processing.', variant: 'error', duration: 999999 }}
>
  {#snippet children(args)}
    <div class="h-screen w-full relative bg-gh-bg">
      <Toast {...args} />
    </div>
  {/snippet}
</Story>

<Story name="Info" args={{ message: 'New updates available.', variant: 'info', duration: 999999 }}>
  {#snippet children(args)}
    <div class="h-screen w-full relative bg-gh-bg">
      <Toast {...args} />
    </div>
  {/snippet}
</Story>

<Story
  name="Warning"
  args={{ message: 'Your session will expire in 5 minutes.', variant: 'warning', duration: 999999 }}
>
  {#snippet children(args)}
    <div class="h-screen w-full relative bg-gh-bg">
      <Toast {...args} />
    </div>
  {/snippet}
</Story>
