<script lang="ts">
  import type { Snippet } from 'svelte'
  import { provideSessionContext, type SessionContext } from '../context'

  interface Props {
    context: SessionContext
    children: Snippet
  }

  const { context, children }: Props = $props()

  provideSessionContext(context)
</script>

{@render children()}
