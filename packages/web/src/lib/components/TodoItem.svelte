<script lang="ts">
  interface Todo {
    activeForm: string
    content: string
    status: 'pending' | 'in_progress' | 'completed'
  }

  interface Props {
    todos: Todo[]
  }

  const { todos }: Props = $props()

  const statusIcon = (status: Todo['status']) => {
    switch (status) {
      case 'completed':
        return '✅'
      case 'in_progress':
        return '🔄'
      case 'pending':
        return '⬜'
    }
  }

  const statusClass = (status: Todo['status']) => {
    switch (status) {
      case 'completed':
        return 'text-gh-green'
      case 'in_progress':
        return 'text-gh-accent'
      case 'pending':
        return 'text-gh-text-secondary'
    }
  }
</script>

<ul class="space-y-1.5 mt-1">
  {#each todos as todo}
    <li class="flex items-start gap-2 text-sm {statusClass(todo.status)}">
      <span class="flex-shrink-0">{statusIcon(todo.status)}</span>
      <span class={todo.status === 'completed' ? 'line-through opacity-70' : ''}>
        {todo.status === 'in_progress' ? todo.activeForm : todo.content}
      </span>
    </li>
  {/each}
</ul>
