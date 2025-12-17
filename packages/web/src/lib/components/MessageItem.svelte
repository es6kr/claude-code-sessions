<script lang="ts">
  import type { Message } from '$lib/api'
  import * as api from '$lib/api'
  import { formatDate, getMessageContent, parseIdeTags } from '$lib/utils'
  import ExpandableContent from './ExpandableContent.svelte'
  import IdeTag from './IdeTag.svelte'
  import TodoItem from './TodoItem.svelte'

  interface Props {
    msg: Message
    sessionId: string
    isFirst?: boolean
    onDelete: (msg: Message) => void
    onEditTitle?: (msg: Message) => void
    onSplit?: (msg: Message) => void
  }

  let { msg, sessionId, isFirst = false, onDelete, onEditTitle, onSplit }: Props = $props()

  // Type guards for different message types
  const isAssistant = $derived(msg.type === 'assistant')
  const isCustomTitle = $derived(msg.type === 'custom-title')
  const isFileSnapshot = $derived(msg.type === 'file-history-snapshot')
  const isHuman = $derived(msg.type === 'human' || msg.type === 'user')
  const isLocalCommand = $derived(msg.type === 'system' && msg.subtype === 'local_command')
  const isQueueOperation = $derived(msg.type === 'queue-operation')
  const isToolResult = $derived(
    msg.type === 'user' && msg.message?.content?.[0]?.type === 'tool_result'
  )

  // Parse file snapshot data
  const snapshotData = $derived.by(() => {
    if (!isFileSnapshot) return null
    const snapshot = (
      msg as unknown as {
        snapshot?: {
          messageId?: string
          trackedFileBackups?: Record<string, { backupFileName?: string }>
          timestamp?: string
        }
      }
    ).snapshot
    const backups = snapshot?.trackedFileBackups ?? {}
    return {
      files: Object.entries(backups),
      timestamp: snapshot?.timestamp,
    }
  })

  // Parse command data
  const commandData = $derived.by(() => {
    if (!isLocalCommand) return null
    const name = msg.content?.match(/<command-name>([^<]+)<\/command-name>/)?.[1] ?? ''
    const message = msg.content?.match(/<command-message>([^<]+)<\/command-message>/)?.[1] ?? ''
    return { name, message }
  })

  // Parse tool_use data from assistant messages
  interface ToolUse {
    type: 'tool_use'
    name: string
    input: Record<string, unknown>
  }
  const FILE_TOOLS = ['Read', 'Write', 'Edit'] as const
  const toolUseData = $derived.by(() => {
    if (!isAssistant) return null
    const m = msg.message as { content?: unknown[] } | undefined
    if (!Array.isArray(m?.content)) return null
    const toolUse = m.content.find(
      (item): item is ToolUse =>
        typeof item === 'object' && item !== null && (item as ToolUse).type === 'tool_use'
    )
    if (!toolUse) return null
    return {
      name: toolUse.name,
      input: toolUse.input,
      // Extract file path for file tools (Read, Write, Edit)
      filePath: FILE_TOOLS.includes(toolUse.name as (typeof FILE_TOOLS)[number])
        ? (toolUse.input.file_path as string)
        : null,
    }
  })

  // Get custom title
  const customTitle = $derived((msg as Message & { customTitle?: string }).customTitle ?? '')

  // Get message ID (uuid or messageId for file-history-snapshot)
  const messageId = $derived(msg.uuid || (msg as unknown as { messageId?: string }).messageId || '')

  // Check if message has displayable content
  const hasContent = $derived.by(() => {
    // Queue operations have no displayable content but are valid
    if (isQueueOperation) return false
    if (isFileSnapshot || isLocalCommand || isCustomTitle || toolUseData) return true

    // Check message.content first (primary content source)
    const content = getMessageContent(msg)
    if (content.trim().length > 0) return true

    // Warn for messages without content
    if (msg.type === 'user' || msg.type === 'human') {
      const label = isToolResult ? 'Tool result' : 'User message'
      console.warn(`${label} without content:`, $state.snapshot(msg))
    }
    return false
  })

  // CSS classes for message type
  const messageClass = $derived.by(() => {
    if (isHuman) return 'bg-gh-accent/15 border-l-3 border-l-gh-accent'
    if (isAssistant) return 'bg-gh-green/15 border-l-3 border-l-gh-green'
    if (isCustomTitle) return 'bg-purple-500/15 border-l-3 border-l-purple-500'
    return 'bg-gh-border-subtle'
  })
</script>

{#snippet splitButton()}
  {#if onSplit && !isFirst}
    <button
      class="opacity-0 group-hover:opacity-100 transition-opacity bg-transparent border-none cursor-pointer p-1 rounded hover:bg-gh-accent/20 text-xs"
      onclick={() => onSplit(msg)}
      title="Split session from this message"
    >
      ✂️
    </button>
  {/if}
{/snippet}

{#snippet deleteButton()}
  <button
    class="opacity-0 group-hover:opacity-100 transition-opacity bg-transparent border-none cursor-pointer p-1 rounded hover:bg-gh-red/20 text-xs"
    onclick={() => onDelete(msg)}
    title="Delete message"
  >
    🗑️
  </button>
{/snippet}

{#if isQueueOperation}
  <!-- Queue operations are internal system messages, don't render -->
{:else if isFileSnapshot && snapshotData}
  <!-- File history snapshot -->
  <div class="p-4 rounded-lg bg-amber-500/10 border-l-3 border-l-amber-500 group relative">
    <div class="flex justify-between mb-2 text-xs text-gh-text-secondary">
      <span class="uppercase font-semibold text-amber-400">
        📁 File Backups ({snapshotData.files.length})
      </span>
      <div class="flex items-center gap-2">
        <span>{formatDate(snapshotData.timestamp)}</span>
        {@render splitButton()}
        {@render deleteButton()}
      </div>
    </div>
    <ul class="space-y-1">
      {#each snapshotData.files as [filePath, info]}
        {@const hasBackup = !!(info.backupFileName && sessionId)}
        <li class="font-mono text-xs truncate" title={filePath}>
          {#if hasBackup}
            <button
              class="text-gh-accent hover:underline cursor-pointer bg-transparent border-none p-0"
              onclick={() => api.openFileInVscode(sessionId, info.backupFileName!)}
              title="Open backup in VS Code"
            >
              {filePath}
            </button>
          {:else}
            <span class="text-gh-text-secondary">{filePath}</span>
          {/if}
        </li>
      {/each}
    </ul>
  </div>
{:else if isLocalCommand && commandData}
  <!-- Local command message -->
  <div class="p-3 rounded-lg bg-cyan-500/10 border-l-3 border-l-cyan-500 group relative">
    <div class="flex justify-between items-center text-xs text-gh-text-secondary">
      <span class="font-semibold text-cyan-400">⚡ {commandData.name || 'Command'}</span>
      <div class="flex items-center gap-2">
        <span>{formatDate(msg.timestamp)}</span>
        {@render splitButton()}
        {@render deleteButton()}
      </div>
    </div>
    {#if commandData.message && commandData.message !== commandData.name?.slice(1)}
      <p class="mt-1 text-sm text-gh-text-secondary">{commandData.message}</p>
    {/if}
  </div>
{:else if toolUseData}
  <!-- Tool use message -->
  <div class="p-3 rounded-lg bg-violet-500/10 border-l-3 border-l-violet-500 group relative">
    <div class="flex justify-between items-center text-xs text-gh-text-secondary">
      <span class="font-semibold text-violet-400">🔧 {toolUseData.name}</span>
      <div class="flex items-center gap-2">
        <span>{formatDate(msg.timestamp)}</span>
        {@render splitButton()}
        {@render deleteButton()}
      </div>
    </div>
    {#if toolUseData.filePath}
      {#await api.checkFileExists(toolUseData.filePath)}
        <span class="mt-1 text-sm text-gh-text-secondary font-mono">
          {toolUseData.filePath.split('/').pop()}
        </span>
      {:then exists}
        {#if exists}
          <button
            class="mt-1 text-sm text-gh-accent hover:underline cursor-pointer bg-transparent border-none p-0 font-mono truncate block max-w-full text-left"
            onclick={() => api.openFile(toolUseData.filePath!)}
            title={toolUseData.filePath}
          >
            {toolUseData.filePath.split('/').pop()}
          </button>
        {:else}
          <span class="mt-1 text-sm text-gh-text-secondary font-mono" title={toolUseData.filePath}>
            {toolUseData.filePath.split('/').pop()}
          </span>
        {/if}
      {/await}
    {:else if toolUseData.input.command}
      {#if toolUseData.input.description}
        <p class="mt-1 text-sm text-gh-text-secondary">{toolUseData.input.description}</p>
      {/if}
      <ExpandableContent content={String(toolUseData.input.command)} lang="sh" maxLines={3} />
    {:else}
      {@const { path: _path, ...input } = toolUseData.input}
      {@const keys = Object.keys(input)}
      {#if keys.length === 1}
        {@const key = keys[0]}
        {@const value = input[key]}
        {(() => {
          console.info(`${key} =`, value)
          return ''
        })()}
        {#if key === 'todos' && Array.isArray(value)}
          <TodoItem todos={value} />
        {:else}
          <ExpandableContent
            content={`${key} = ${JSON.stringify(value, null, 2)}`}
            lang="js"
            maxLines={1}
          />
        {/if}
      {:else}
        <ExpandableContent content={JSON.stringify(input, null, 2)} lang="json" maxLines={6} />
      {/if}
    {/if}
  </div>
{:else}
  <!-- Standard message (human, assistant, custom-title, etc.) -->
  <div
    class="p-4 rounded-lg group relative {messageClass} flex flex-col {hasContent ? 'gap-2' : ''}"
  >
    <div class="flex justify-between text-xs text-gh-text-secondary">
      <span class="uppercase font-semibold">{isToolResult ? 'OUT' : msg.type}</span>
      <div class="flex items-center gap-2">
        <span class="group-hover:hidden">{formatDate(msg.timestamp)}</span>
        <span class="hidden group-hover:inline font-mono text-gh-text-secondary/70">
          {messageId}
        </span>
        {#if isCustomTitle && onEditTitle}
          <button
            class="opacity-0 group-hover:opacity-100 transition-opacity bg-transparent border-none cursor-pointer p-1 rounded hover:bg-gh-border text-xs"
            onclick={() => onEditTitle(msg)}
            title="Edit title"
          >
            ✏️
          </button>
        {/if}
        {@render splitButton()}
        {@render deleteButton()}
      </div>
    </div>
    {#if hasContent}
      <div class="message-content text-sm">
        {#if isCustomTitle}
          <span class="font-semibold text-purple-400">{customTitle}</span>
        {:else}
          {@const msgContent = getMessageContent(msg)}
          {@const segments = parseIdeTags(msgContent)}
          {#each segments as segment}
            {#if segment.type === 'ide_tag' && segment.tag}
              <IdeTag tag={segment.tag} content={segment.content} />
            {:else}
              {@const textLines = segment.content.split('\n')}
              {#if textLines.length > 10}
                <ExpandableContent content={segment.content} maxLines={10} />
              {:else}
                <p class="whitespace-pre-wrap">{segment.content}</p>
              {/if}
            {/if}
          {/each}
        {/if}
      </div>
    {/if}
  </div>
{/if}
