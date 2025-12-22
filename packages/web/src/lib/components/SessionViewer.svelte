<script lang="ts">
  import type { Message, SessionMeta, TodoItem, AgentInfo } from '$lib/api'
  import { truncate, getDisplayTitle } from '$lib/utils'
  import MessageItem from './MessageItem.svelte'
  import * as api from '$lib/api'

  // Tab type - messages, todos, or agent:<agentId>
  type TabType = 'messages' | 'todos' | `agent:${string}`

  interface Props {
    session: SessionMeta | null
    messages: Message[]
    todos?: TodoItem[]
    agents?: AgentInfo[]
    customTitle?: string
    currentSummary?: string
    onDeleteMessage?: (msg: Message) => void // Called after actual deletion
    onMessagesChange?: (messages: Message[]) => void // Called when messages array changes
    onEditTitle?: (msg: Message) => void
    onSplitSession?: (msg: Message) => void
    showHeader?: boolean
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
    onDeleteMessage,
    onMessagesChange,
    onEditTitle,
    onSplitSession,
    showHeader = true,
    enableScroll = true,
    externalScrollContainer = null,
    fullWidth = false,
  }: Props = $props()

  // Get display title: customTitle > currentSummary > session.title > 'Untitled'
  const displayTitle = $derived(getDisplayTitle(customTitle, currentSummary, session?.title, 50))

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

  // Undo all deletions - restore messages via API
  const undoAllDeletes = async () => {
    if (undoTimeoutId) clearTimeout(undoTimeoutId)
    if (!session || undoStack.length === 0) return

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
  }

  // Handle message deletion with undo (works for both session and agent messages)
  // Deletes immediately via API, stores in undo stack for potential restore
  const handleMessageDeleteWithUndo = async (msg: Message, isAgent: boolean) => {
    if (!session) return
    const msgId = msg.uuid || msg.messageId || msg.leafUuid
    if (!msgId) return

    const targetSessionId = isAgent && selectedAgentId ? selectedAgentId : session.id
    let index: number

    if (isAgent) {
      index = agentMessages.findIndex((m) => (m.uuid || m.messageId || m.leafUuid) === msgId)
      if (index === -1) return
    } else {
      index = messages.findIndex((m) => (m.uuid || m.messageId || m.leafUuid) === msgId)
      if (index === -1) return
    }

    try {
      // Delete immediately via API
      await api.deleteMessage(session.projectName, targetSessionId, msgId)

      // Remove from UI
      if (isAgent) {
        agentMessages = agentMessages.filter((m) => (m.uuid || m.messageId || m.leafUuid) !== msgId)
      } else {
        const newMessages = messages.filter((m) => (m.uuid || m.messageId || m.leafUuid) !== msgId)
        onMessagesChange?.(newMessages)
      }

      // Add to undo stack
      undoStack = [...undoStack, { msg, index, isAgent, sessionId: targetSessionId }]

      // Reset countdown and timer
      if (undoTimeoutId) clearTimeout(undoTimeoutId)
      undoCountdown = 10
      undoTimeoutId = setTimeout(() => {
        undoStack = []
        undoCountdown = 0
        undoTimeoutId = null
      }, 10000)

      onDeleteMessage?.(msg)
    } catch (e) {
      console.error('Failed to delete message:', e)
    }
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

  // Find index of first meaningful message (user/assistant, not metadata)
  const firstMeaningfulIndex = $derived(
    messages.findIndex((m) => m.type === 'user' || m.type === 'assistant' || m.type === 'human')
  )

  // Find last compact summary (context continuation point)
  const lastCompactIndex = $derived.by(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if ((messages[i] as Message & { isCompactSummary?: boolean }).isCompactSummary) {
        return i
      }
    }
    return -1
  })

  // Scroll container reference for navigation (internal or external)
  let internalScrollContainer: HTMLDivElement | undefined = $state()
  const scrollContainer = $derived(externalScrollContainer ?? internalScrollContainer)

  const scrollToTop = () => {
    scrollContainer?.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const scrollToBottom = () => {
    scrollContainer?.scrollTo({ top: scrollContainer.scrollHeight, behavior: 'smooth' })
  }

  const scrollToCompact = () => {
    if (lastCompactIndex < 0 || !scrollContainer) return
    const msgId = messages[lastCompactIndex].uuid ?? `idx-${lastCompactIndex}`
    const element = scrollContainer.querySelector(`[data-msg-id="${msgId}"]`)
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }
</script>

<section
  class="bg-gh-bg-secondary overflow-hidden flex flex-col {fullWidth
    ? ''
    : 'border border-gh-border rounded-lg'}"
>
  <!-- Header -->
  {#if showHeader}
    <div
      class="p-4 border-b border-gh-border bg-gh-bg flex flex-wrap justify-between items-start gap-2"
    >
      <div class="flex-1 min-w-[200px]">
        {#if session}
          <h2 class="text-base font-semibold">
            {truncate(displayTitle, 50)}
          </h2>
          <button
            class="text-xs text-gh-text-secondary font-mono mt-1 hover:text-gh-accent
                   hover:underline cursor-pointer bg-transparent border-none p-0 text-left"
            onclick={openSessionFile}
            title="Open session file in VSCode"
          >
            {session.id}
          </button>
        {:else}
          <h2 class="text-base font-semibold">Messages</h2>
        {/if}
      </div>
      {#if session && messages.length > 0 && activeTab === 'messages'}
        <div class="flex gap-1 flex-shrink-0">
          <button
            class="px-2 py-1 text-xs rounded border border-gh-border hover:bg-gh-border-subtle
                   text-gh-text-secondary hover:text-gh-text transition-colors"
            onclick={scrollToTop}
            title="Go to top"
          >
            ↑ Top
          </button>
          {#if lastCompactIndex >= 0}
            <button
              class="px-2 py-1 text-xs rounded border border-gh-border hover:bg-gh-border-subtle
                     text-gh-text-secondary hover:text-gh-text transition-colors"
              onclick={scrollToCompact}
              title="Jump to last compacted point (context continuation)"
            >
              📍 Last Compacted
            </button>
          {/if}
          <button
            class="px-2 py-1 text-xs rounded border border-gh-border hover:bg-gh-border-subtle
                   text-gh-text-secondary hover:text-gh-text transition-colors"
            onclick={scrollToBottom}
            title="Go to bottom"
          >
            ↓ Bottom
          </button>
        </div>
      {/if}
    </div>
  {/if}

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
        <div class="p-4 flex flex-col gap-4">
          {#each messages as msg, i (msg.uuid ?? `idx-${i}`)}
            <MessageItem
              {msg}
              sessionId={session?.id ?? ''}
              onDelete={handleSessionMessageDelete}
              {onEditTitle}
              onSplit={onSplitSession}
              isFirst={i === firstMeaningfulIndex}
            />
          {/each}
        </div>
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
        <div class="p-4 flex flex-col gap-4">
          {#each agentMessages as msg, i (msg.uuid)}
            <MessageItem
              {msg}
              sessionId={selectedAgentId}
              onDelete={handleAgentMessageDelete}
              isFirst={i === 0}
            />
          {/each}
        </div>
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
