<script module>
  import { defineMeta } from '@storybook/addon-svelte-csf'
  import InputModal from './InputModal.svelte'

  const { Story } = defineMeta({
    title: 'Components/InputModal',
    component: InputModal,
    tags: ['autodocs'],
    parameters: {
      layout: 'fullscreen',
    },
  })
</script>

<script>
  import { fn } from 'storybook/test'

  const onConfirm = fn()
  const onCancel = fn()
</script>

<Story
  name="Default"
  args={{ show: true, title: 'Enter Value', confirmText: 'Confirm', cancelText: 'Cancel' }}
>
  {#snippet children(args)}
    <div class="h-screen w-full relative bg-gh-bg">
      <InputModal {...args} {onConfirm} {onCancel} />
    </div>
  {/snippet}
</Story>

<Story
  name="With Label"
  args={{
    show: true,
    title: 'Rename Session',
    label: 'Enter a new name for this session',
    placeholder: 'My Session',
    confirmText: 'Confirm',
    cancelText: 'Cancel',
  }}
>
  {#snippet children(args)}
    <div class="h-screen w-full relative bg-gh-bg">
      <InputModal {...args} {onConfirm} {onCancel} />
    </div>
  {/snippet}
</Story>

<Story
  name="With Initial Value"
  args={{
    show: true,
    title: 'Edit Title',
    label: 'Session title',
    initialValue: 'feat: implement user authentication',
    confirmText: 'Update',
    cancelText: 'Cancel',
  }}
>
  {#snippet children(args)}
    <div class="h-screen w-full relative bg-gh-bg">
      <InputModal {...args} {onConfirm} {onCancel} />
    </div>
  {/snippet}
</Story>

<Story
  name="Custom Buttons"
  args={{
    show: true,
    title: 'New Branch',
    label: 'Branch name',
    placeholder: 'feature/my-feature',
    confirmText: 'Create',
    cancelText: 'Back',
  }}
>
  {#snippet children(args)}
    <div class="h-screen w-full relative bg-gh-bg">
      <InputModal {...args} {onConfirm} {onCancel} />
    </div>
  {/snippet}
</Story>
