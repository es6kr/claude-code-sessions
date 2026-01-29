<script lang="ts">
  import {
    deleteMessageWithChainRepair,
    validateChain,
    validateProgressMessages,
  } from '@claude-sessions/core'
  import type { AgentInfo, Message, SessionMeta, TodoItem } from '$lib/api'
  import * as api from '$lib/api'
  import { getDisplayTitle, truncate } from '$lib/utils'
  import MessageList from './MessageList.svelte'
  import ScrollButtons from './ScrollButtons.svelte'
  import ValidationBadge from './ValidationBadge.svelte'

  // Tab type - messages, todos, or agent:<agentId>
  type TabType = 'messages' | 'todos' | `agent:${string}`

  interface Props {
    session: SessionMeta | null
    messages: Message[]
    todos?: TodoItem[]
    agents?: AgentInfo[]
    customTitle?: string
    currentSummary?: string
    projectDisplayName?: string
    backUrl?: string // If provided, shows back button header
    onDeleteMessage?: (msg: Message) => void // Called after actual deletion
    onMessagesChange?: (messages: Message[]) => void // Called when messages array changes
    onRefresh?: () => Promise<void> // Called to refresh messages from server
    onEditTitle?: (msg: Message) => void
    onSplitSession?: (msg: Message) => void
    enableScroll?: boolean
    externalScrollContainer?: HTMLElement | null
    fullWidth?: boolean
  }

  let {
    session,
    messages,
    todos = [],
    agents = [],
    customTitle,
    currentSummary,
    backUrl,
    onDeleteMessage,
    onMessagesChange,
    onRefresh,
    onEditTitle,
    onSplitSession,
    enableScroll = true,
    externalScrollContainer = null,
    fullWidth = false,
  }: Props = $props()

  // Get display title: customTitle > currentSummary > session.title > 'Untitled'
  const displayTitle = $derived(getDisplayTitle(customTitle, currentSummary, session?.title, 50))

  // Validation (logging is done server-side in /api/session)
  const chainResult = $derived(validateChain(messages))
  const progressResult = $derived(validateProgressMessages(messages))
  let isRepairing = $state(false)

  const handleRepairChain = async () => {
    if (!session || isRepairing) return
    isRepairing = true
    try {
      const result = await api.repairChain(session.projectName, session.id)
      if (result.success && result.repairCount > 0) {
        // Refresh messages from server
        await syncFromServer()
      }
    } catch (e) {
      console.error('Failed to repair chain:', e)
    } finally {
      isRepairing = false
    }
  }

  let activeTab = $state<TabType>('messages')
  let agentMessages = $state<Message[]>([])
  let loadingAgent = $state(false)

  // Undo stack - stores already-deleted messages that can be restored
  interface DeletedMessage {
    msg: Message
    index: number
    isAgent: boolean
    sessionId: string // The session/agent ID where it was deleted from
  }
  let undoStack = $state<DeletedMessage[]>([])
  let undoCountdown = $state(0)
  let undoTimeoutId = $state<ReturnType<typeof setTimeout> | null>(null)

  // Delete operation queue - ensures sequential execution to prevent race conditions
  let deleteQueue: Promise<void> = Promise.resolve()

  // Countdown timer effect for undo availability
  $effect(() => {
    if (undoCountdown <= 0) return

    const intervalId = setInterval(() => {
      undoCountdown = Math.max(0, undoCountdown - 1)
      if (undoCountdown === 0) {
        // Time expired, clear undo stack
        undoStack = []
      }
    }, 1000)

    return () => clearInterval(intervalId)
  })

  // Reset to messages tab when session changes
  $effect(() => {
    // Track session.id to detect session change
    const _sessionId = session?.id
    activeTab = 'messages'
    agentMessages = []
  })

  // Get currently selected agent ID from tab
  const selectedAgentId = $derived(activeTab.startsWith('agent:') ? activeTab.slice(6) : null)

  // Load agent messages when agent tab is selected
  $effect(() => {
    if (selectedAgentId && session) {
      loadingAgent = true
      api
        .getAgentMessages(session.projectName, session.id, selectedAgentId)
        .then((msgs) => {
          agentMessages = msgs
        })
        .catch((e) => {
          console.error('Failed to load agent messages:', e)
          agentMessages = []
        })
        .finally(() => {
          loadingAgent = false
        })
    }
  })

  // Server sync - refreshes messages from server to get chain repair results
  const syncFromServer = async () => {
    if (!onRefresh) return
    await onRefresh()
  }

  // Undo all deletions - restore messages via API
  const undoAllDeletes = async () => {
    if (undoTimeoutId) clearTimeout(undoTimeoutId)
    if (!session || undoStack.length === 0) return

    // Wait for all pending delete operations to complete before restoring
    await deleteQueue

    // Restore in reverse order (most recent first) to maintain correct indices
    const toRestore = [...undoStack].reverse()

    for (const item of toRestore) {
      try {
        await api.restoreMessage(
          session.projectName,
          item.sessionId,
          item.msg as unknown as Record<string, unknown>,
          item.index
        )
        // Update UI
        if (item.isAgent) {
          const newAgentMessages = [...agentMessages]
          newAgentMessages.splice(item.index, 0, item.msg)
          agentMessages = newAgentMessages
        } else {
          const newMessages = [...messages]
          newMessages.splice(item.index, 0, item.msg)
          onMessagesChange?.(newMessages)
        }
      } catch (e) {
        console.error('Failed to restore message:', e)
      }
    }

    // Clear undo stack
    undoStack = []
    undoCountdown = 0
    undoTimeoutId = null

    // Sync from server to ensure consistent state after restore
    await syncFromServer()
  }

  // Handle message deletion with undo (works for both session and agent messages)
  // Deletes immediately via API, stores in undo stack for potential restore
  const handleMessageDeleteWithUndo = async (msg: Message, isAgent: boolean) => {
    if (!session) return
    const msgId = msg.uuid || msg.messageId || msg.leafUuid
    if (!msgId) return

    // Determine targetType for disambiguation when uuid/messageId collision exists
    const targetType =
      msg.type === 'file-history-snapshot'
        ? ('file-history-snapshot' as const)
        : msg.type === 'summary'
          ? ('summary' as const)
          : undefined

    const targetSessionId = isAgent && selectedAgentId ? selectedAgentId : session.id
    let index: number

    if (isAgent) {
      index = agentMessages.findIndex((m) => (m.uuid || m.messageId || m.leafUuid) === msgId)
      if (index === -1) return
    } else {
      index = messages.findIndex((m) => (m.uuid || m.messageId || m.leafUuid) === msgId)
      if (index === -1) return
    }

    // 1. Remove from UI immediately with chain repair (optimistic update)
    if (isAgent) {
      const copy = [...agentMessages] as unknown as Record<string, unknown>[]
      deleteMessageWithChainRepair(copy, msgId, targetType)
      agentMessages = copy as unknown as Message[]
    } else {
      const copy = [...messages] as unknown as Record<string, unknown>[]
      deleteMessageWithChainRepair(copy, msgId, targetType)
      onMessagesChange?.(copy as unknown as Message[])
    }

    // 2. Add to undo stack
    undoStack = [...undoStack, { msg, index, isAgent, sessionId: targetSessionId }]

    // 3. Reset countdown and timer
    if (undoTimeoutId) clearTimeout(undoTimeoutId)
    undoCountdown = 10
    undoTimeoutId = setTimeout(() => {
      undoStack = []
      undoCountdown = 0
      undoTimeoutId = null
    }, 10000)

    // 4. Delete via API - queued to prevent race conditions
    deleteQueue = deleteQueue.then(async () => {
      try {
        await api.deleteMessage(session.projectName, targetSessionId, msgId, targetType)
      } catch (e) {
        console.error('Failed to delete message:', e)
      }
    })

    onDeleteMessage?.(msg)
  }

  // Handle agent message deletion with undo
  const handleAgentMessageDelete = (msg: Message) => {
    handleMessageDeleteWithUndo(msg, true)
  }

  // Handle session message deletion with undo
  const handleSessionMessageDelete = (msg: Message) => {
    handleMessageDeleteWithUndo(msg, false)
  }

  const openSessionFile = async () => {
    if (!session) return
    const filePath = `~/.claude/projects/${session.projectName}/${session.id}.jsonl`
    try {
      await api.openFile(filePath)
    } catch (e) {
      console.error('Failed to open file:', e)
    }
  }

  // Scroll container reference for navigation (internal or external)
  let internalScrollContainer: HTMLDivElement | undefined = $state()
  const scrollContainer = $derived(externalScrollContainer ?? internalScrollContainer)
</script>

<section
  class="bg-gh-bg-secondary overflow-hidden flex flex-col h-full {fullWidth
    ? ''
    : 'border border-gh-border rounded-lg'}"
>
  <!-- Header -->
  <div
    class="p-4 border-b border-gh-border bg-gh-bg flex flex-wrap justify-between items-start gap-2"
  >
    {#if backUrl}
      <a
        href={backUrl}
        class="text-gh-muted hover:text-gh-fg flex-shrink-0"
        title="Back to project"
      >
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M10 19l-7-7m0 0l7-7m-7 7h18"
          />
        </svg>
      </a>
    {/if}
    <div class="flex-1 min-w-[200px]">
      {#if session}
        <h2 class="text-base font-semibold">
          {truncate(displayTitle, 50)}
        </h2>
        <div class="flex items-center gap-2 mt-1">
          <button
            class="text-xs text-gh-text-secondary font-mono hover:text-gh-accent
                     hover:underline cursor-pointer bg-transparent border-none p-0 text-left"
            onclick={openSessionFile}
            title="Open session file in VSCode"
          >
            {session.id}
          </button>
          <ValidationBadge
            chainErrors={chainResult.errors}
            progressErrors={progressResult.errors}
            {isRepairing}
            onRepair={handleRepairChain}
          />
        </div>
      {:else}
        <h2 class="text-base font-semibold">Messages</h2>
      {/if}
    </div>
    {#if activeTab !== 'todos'}
      <ScrollButtons {messages} {scrollContainer} />
    {/if}
  </div>

  <!-- Tabs -->
  {#if session}
    <div class="flex border-b border-gh-border bg-gh-bg overflow-x-auto">
      <div class="flex-1 flex justify-center">
        <button
          class="px-4 py-2 text-sm font-medium transition-colors whitespace-nowrap {activeTab ===
          'messages'
            ? 'text-gh-accent border-b-2 border-gh-accent'
            : 'text-gh-text-secondary hover:text-gh-text hover:bg-gh-border-subtle'}"
          onclick={() => (activeTab = 'messages')}
        >
          💬 Messages ({messages.length})
        </button>
        {#each agents as agent}
          <button
            class="px-4 py-2 text-sm font-medium transition-colors whitespace-nowrap {activeTab ===
            `agent:${agent.id}`
              ? 'text-gh-accent border-b-2 border-gh-accent'
              : 'text-gh-text-secondary hover:text-gh-text hover:bg-gh-border-subtle'}"
            onclick={() => (activeTab = `agent:${agent.id}`)}
          >
            🤖 <span class="hidden md:inline">{agent.id}</span><span class="md:hidden"
              >{agent.id.replace('agent-', '')}</span
            >
            ({agent.messageCount})
          </button>
        {/each}
      </div>
      {#if todos.length > 0}
        <button
          class="px-4 py-2 text-sm font-medium transition-colors whitespace-nowrap {activeTab ===
          'todos'
            ? 'text-gh-accent border-b-2 border-gh-accent'
            : 'text-gh-text-secondary hover:text-gh-text hover:bg-gh-border-subtle'}"
          onclick={() => (activeTab = 'todos')}
        >
          ✅ Todos ({todos.length})
        </button>
      {/if}
    </div>
  {/if}

  <!-- Content -->
  <div bind:this={internalScrollContainer} class="flex-1 {enableScroll ? 'overflow-y-auto' : ''}">
    {#if !session}
      <div class="flex items-center justify-center h-full text-gh-text-secondary">
        Select a session to view
      </div>
    {:else if activeTab === 'messages'}
      {#if messages.length === 0}
        <div class="flex items-center justify-center h-full text-gh-text-secondary">
          No messages
        </div>
      {:else}
        <MessageList
          sessionId={session.id}
          {messages}
          onDeleteMessage={handleSessionMessageDelete}
          {onEditTitle}
          {onSplitSession}
          enableScroll={false}
          fullWidth={true}
        />
      {/if}
    {:else if activeTab === 'todos'}
      <div class="p-4">
        {#if todos.length === 0}
          <div class="text-gh-text-secondary text-center py-8">No todos</div>
        {:else}
          <ul class="space-y-2">
            {#each todos as todo}
              <li class="flex items-start gap-2 p-3 bg-gh-bg rounded border border-gh-border">
                <span class="flex-shrink-0">
                  {#if todo.status === 'completed'}
                    ✅
                  {:else if todo.status === 'in_progress'}
                    🔄
                  {:else}
                    ⬜
                  {/if}
                </span>
                <span
                  class={todo.status === 'completed' ? 'text-gh-text-secondary line-through' : ''}
                  >{todo.content}</span
                >
              </li>
            {/each}
          </ul>
        {/if}
      </div>
    {:else if selectedAgentId}
      {#if loadingAgent}
        <div class="flex items-center justify-center h-full text-gh-text-secondary">
          Loading agent messages...
        </div>
      {:else if agentMessages.length === 0}
        <div class="flex items-center justify-center h-full text-gh-text-secondary">
          No messages
        </div>
      {:else}
        <MessageList
          sessionId={session.id}
          messages={agentMessages}
          onDeleteMessage={handleAgentMessageDelete}
          enableScroll={false}
          fullWidth={true}
        />
      {/if}
    {/if}
  </div>

  <!-- Undo Toast -->
  {#if undoStack.length > 0}
    <div
      class="fixed bottom-4 left-1/2 -translate-x-1/2 bg-neutral-500/20 border border-neutral-600
             rounded-lg shadow-2xl px-4 py-3 flex items-center gap-4 z-50 backdrop-blur-sm"
    >
      <span class="text-sm text-white">
        {undoStack.length === 1 ? 'Message deleted' : `${undoStack.length} messages deleted`}
      </span>
      <span class="text-xs text-gh-text-secondary tabular-nums">{undoCountdown}s</span>
      <button
        onclick={undoAllDeletes}
        class="px-3 py-1 text-sm font-medium text-gh-accent hover:bg-gh-border-subtle rounded transition-colors"
      >
        Undo
      </button>
      <button
        onclick={() => {
          if (undoTimeoutId) clearTimeout(undoTimeoutId)
          undoStack = []
          undoCountdown = 0
        }}
        class="px-2 py-1 text-sm text-gh-text-secondary hover:text-gh-text hover:bg-gh-border-subtle rounded transition-colors"
        title="Dismiss (already deleted)"
      >
        ✕
      </button>
    </div>
  {/if}
</section>
