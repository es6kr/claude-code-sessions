<script module>
  import { defineMeta } from '@storybook/addon-svelte-csf'
  import ConfirmModal from './ConfirmModal.svelte'

  const { Story } = defineMeta({
    title: 'Components/ConfirmModal',
    component: ConfirmModal,
    tags: ['autodocs'],
    argTypes: {
      variant: {
        control: 'select',
        options: ['default', 'danger'],
      },
    },
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
  args={{
    show: true,
    title: 'Confirm Action',
    message: 'Are you sure you want to proceed with this action?',
    variant: 'default',
    confirmText: 'Confirm',
    cancelText: 'Cancel',
  }}
>
  {#snippet children(args)}
    <div class="h-screen w-full relative bg-gh-bg">
      <ConfirmModal {...args} {onConfirm} {onCancel} />
    </div>
  {/snippet}
</Story>

<Story
  name="Danger"
  args={{
    show: true,
    title: 'Delete Session',
    message: 'Are you sure you want to delete this session? This action cannot be undone.',
    variant: 'danger',
    confirmText: 'Delete',
    cancelText: 'Cancel',
  }}
>
  {#snippet children(args)}
    <div class="h-screen w-full relative bg-gh-bg">
      <ConfirmModal {...args} {onConfirm} {onCancel} />
    </div>
  {/snippet}
</Story>

<Story
  name="Custom Buttons"
  args={{
    show: true,
    title: 'Save Changes',
    message: 'Do you want to save your changes before leaving?',
    variant: 'default',
    confirmText: 'Save',
    cancelText: "Don't Save",
  }}
>
  {#snippet children(args)}
    <div class="h-screen w-full relative bg-gh-bg">
      <ConfirmModal {...args} {onConfirm} {onCancel} />
    </div>
  {/snippet}
</Story>

<Story
  name="Long Message"
  args={{
    show: true,
    title: 'Warning',
    message:
      'This operation will affect multiple files in your project.\n\nThe following changes will be made:\n- Update configuration files\n- Modify database schema\n- Reset user preferences\n\nPlease make sure you have backed up your data.',
    variant: 'danger',
    confirmText: 'I understand',
    cancelText: 'Cancel',
  }}
>
  {#snippet children(args)}
    <div class="h-screen w-full relative bg-gh-bg">
      <ConfirmModal {...args} {onConfirm} {onCancel} />
    </div>
  {/snippet}
</Story>
