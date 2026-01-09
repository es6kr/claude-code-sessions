<script module>
  import { defineMeta } from '@storybook/addon-svelte-csf'
  import TodoItem from './TodoItem.svelte'

  const { Story } = defineMeta({
    title: 'Components/TodoItem',
    component: TodoItem,
    tags: ['autodocs'],
    parameters: {
      layout: 'padded',
    },
  })

  const mixedTodos = [
    {
      content: 'Read project requirements',
      activeForm: 'Reading requirements',
      status: 'completed',
    },
    {
      content: 'Implement user authentication',
      activeForm: 'Implementing authentication',
      status: 'in_progress',
    },
    { content: 'Write unit tests', activeForm: 'Writing tests', status: 'pending' },
    { content: 'Deploy to production', activeForm: 'Deploying', status: 'pending' },
  ]

  const allCompleted = [
    { content: 'Initialize project', activeForm: 'Initializing', status: 'completed' },
    { content: 'Set up CI/CD', activeForm: 'Setting up CI/CD', status: 'completed' },
    { content: 'Configure linting', activeForm: 'Configuring', status: 'completed' },
  ]

  const allPending = [
    { content: 'Review pull request', activeForm: 'Reviewing PR', status: 'pending' },
    { content: 'Update documentation', activeForm: 'Updating docs', status: 'pending' },
    { content: 'Fix reported bugs', activeForm: 'Fixing bugs', status: 'pending' },
  ]

  const singleInProgress = [
    {
      content: 'Building the application',
      activeForm: 'Building application...',
      status: 'in_progress',
    },
  ]
</script>

<Story name="Mixed Status" args={{ todos: mixedTodos }}>
  {#snippet children(args)}
    <div class="bg-gh-canvas p-4 rounded-lg max-w-md">
      <h3 class="text-gh-text font-medium mb-2">Task Progress</h3>
      <TodoItem {...args} />
    </div>
  {/snippet}
</Story>

<Story name="All Completed" args={{ todos: allCompleted }}>
  {#snippet children(args)}
    <div class="bg-gh-canvas p-4 rounded-lg max-w-md">
      <h3 class="text-gh-text font-medium mb-2">Completed Tasks</h3>
      <TodoItem {...args} />
    </div>
  {/snippet}
</Story>

<Story name="All Pending" args={{ todos: allPending }}>
  {#snippet children(args)}
    <div class="bg-gh-canvas p-4 rounded-lg max-w-md">
      <h3 class="text-gh-text font-medium mb-2">Pending Tasks</h3>
      <TodoItem {...args} />
    </div>
  {/snippet}
</Story>

<Story name="Single In Progress" args={{ todos: singleInProgress }}>
  {#snippet children(args)}
    <div class="bg-gh-canvas p-4 rounded-lg max-w-md">
      <h3 class="text-gh-text font-medium mb-2">Current Task</h3>
      <TodoItem {...args} />
    </div>
  {/snippet}
</Story>
