<script lang="ts">
  import type { Message } from '$lib/api'

  const NAV_MODES = ['user', 'compact', 'hook_stop'] as const
  export type NavMode = (typeof NAV_MODES)[number]

  const NAV_MODE_CONFIG: Record<NavMode, { label: string; prevLabel: string; nextLabel: string }> =
    {
      user: {
        label: 'User messages',
        prevLabel: 'Previous user message',
        nextLabel: 'Next user message',
      },
      compact: {
        label: 'Compact summaries',
        prevLabel: 'Previous compact summary',
        nextLabel: 'Next compact summary',
      },
      hook_stop: {
        label: 'Stop hooks',
        prevLabel: 'Previous stop hook',
        nextLabel: 'Next stop hook',
      },
    }

  interface Props {
    messages: Message[]
    scrollContainer: HTMLElement | null | undefined
    class?: string
  }

  let { messages, scrollContainer, class: className = '' }: Props = $props()

  // Navigation mode state with localStorage persistence
  const storedMode =
    typeof window !== 'undefined'
      ? (localStorage.getItem('claude-sessions-nav-mode') as NavMode | null)
      : null
  let navMode = $state<NavMode>(storedMode && NAV_MODES.includes(storedMode) ? storedMode : 'user')

  const cycleNavMode = () => {
    const idx = NAV_MODES.indexOf(navMode)
    navMode = NAV_MODES[(idx + 1) % NAV_MODES.length]
    localStorage.setItem('claude-sessions-nav-mode', navMode)
  }

  // Check if message has user text content (not just tool_result without user input)
  const hasUserTextContent = (m: Message): boolean => {
    if (m.type !== 'user') return false
    if (!m.uuid) return false

    // Check toolUseResult for user responses
    const toolUseResult = (m as { toolUseResult?: string | object }).toolUseResult
    if (toolUseResult) {
      // AskUserQuestion response (object with answers)
      if (typeof toolUseResult === 'object') {
        return 'answers' in toolUseResult
      }
      // Tool rejection with user-provided reason
      if (typeof toolUseResult === 'string') {
        const marker = 'The user provided the following reason for the rejection:'
        const idx = toolUseResult.indexOf(marker)
        if (idx !== -1) {
          const afterMarker = toolUseResult.slice(idx + marker.length)
          return afterMarker.trim().length > 0
        }
      }
      return false
    }

    // Check message.content array for text type
    const content = (m.message as { content?: unknown } | undefined)?.content ?? m.content
    if (!content) return false
    if (typeof content === 'string') return content.trim().length > 0
    if (!Array.isArray(content)) return false

    for (const item of content as Array<{ type?: string; text?: string }>) {
      if (item.type === 'text' && item.text?.trim()) {
        return true
      }
    }
    return false
  }

  // Check if message matches current navigation mode
  const matchesNavMode = (m: Message, mode: NavMode): boolean => {
    switch (mode) {
      case 'user':
        return hasUserTextContent(m)
      case 'compact':
        return (m as Message & { isCompactSummary?: boolean }).isCompactSummary === true
      case 'hook_stop': {
        if (m.type !== 'progress') return false
        const data = (m as { data?: { hookEvent?: string } }).data
        return data?.hookEvent === 'Stop'
      }
    }
  }

  // Lazy-compute navigable indices based on current mode
  let cachedIndices: number[] | null = null
  let cachedMessagesRef: Message[] | null = null
  let cachedMode: NavMode | null = null

  const getNavigableIndices = (): number[] => {
    if (cachedIndices === null || cachedMessagesRef !== messages || cachedMode !== navMode) {
      cachedIndices = []
      for (let i = 0; i < messages.length; i++) {
        if (matchesNavMode(messages[i], navMode)) {
          cachedIndices.push(i)
        }
      }
      cachedMessagesRef = messages
      cachedMode = navMode
    }
    return cachedIndices
  }

  // Track currently visible message index
  let _currentVisibleIndex = $state(0)

  // Get currently visible message's index in the messages array
  const getCurrentVisibleMessageIndex = (): number => {
    if (!scrollContainer) return 0
    const containerRect = scrollContainer.getBoundingClientRect()
    const elements = scrollContainer.querySelectorAll('[data-msg-id]')

    for (let i = 0; i < elements.length; i++) {
      const el = elements[i] as HTMLElement
      const rect = el.getBoundingClientRect()
      if (rect.top >= containerRect.top - 50) {
        const msgId = el.getAttribute('data-msg-id')
        const msgIndex = messages.findIndex(
          (m) => (m.uuid ?? `idx-${messages.indexOf(m)}`) === msgId
        )
        return msgIndex >= 0 ? msgIndex : i
      }
    }
    return 0
  }

  const scrollToIndex = (index: number) => {
    if (!scrollContainer || index < 0 || index >= messages.length) return
    const msgId = messages[index].uuid ?? `idx-${index}`
    const element = scrollContainer.querySelector(`[data-msg-id="${msgId}"]`)
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' })
      _currentVisibleIndex = index
    }
  }

  const scrollToTop = () => {
    scrollContainer?.scrollTo({ top: 0, behavior: 'smooth' })
    _currentVisibleIndex = 0
  }

  const scrollToBottom = () => {
    if (!scrollContainer) return
    scrollContainer.scrollTo({ top: scrollContainer.scrollHeight + 10000, behavior: 'smooth' })
    _currentVisibleIndex = messages.length - 1
  }

  // Navigate to previous message matching current mode
  const scrollToPrev = () => {
    const currentIdx = getCurrentVisibleMessageIndex()
    const indices = getNavigableIndices()
    for (let i = indices.length - 1; i >= 0; i--) {
      if (indices[i] < currentIdx) {
        scrollToIndex(indices[i])
        return
      }
    }
    scrollToTop()
  }

  // Navigate to next message matching current mode
  const scrollToNext = () => {
    const currentIdx = getCurrentVisibleMessageIndex()
    const indices = getNavigableIndices()
    for (const idx of indices) {
      if (idx > currentIdx) {
        scrollToIndex(idx)
        return
      }
    }
    scrollToBottom()
  }

  const buttonClass =
    'p-1.5 text-sm rounded border border-gh-border hover:bg-gh-border-subtle text-gh-text-secondary hover:text-gh-text transition-colors bg-gh-bg'
</script>

{#if messages.length > 0}
  <div class="flex gap-0.5 {className}">
    <button class="nav-btn {buttonClass}" onclick={scrollToTop}>
      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          d="M5 11l7-7 7 7M5 19l7-7 7 7"
        />
      </svg>
      <span class="tooltip">Top</span>
    </button>
    <button class="nav-btn {buttonClass}" onclick={scrollToPrev}>
      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 15l7-7 7 7" />
      </svg>
      <span class="tooltip">{NAV_MODE_CONFIG[navMode].prevLabel}</span>
    </button>
    <button class="nav-btn mode-btn {buttonClass}" onclick={cycleNavMode}>
      {#if navMode === 'user'}
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
          />
        </svg>
      {:else if navMode === 'compact'}
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
          />
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
          />
        </svg>
      {:else}
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M9 10a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z"
          />
        </svg>
      {/if}
      <span class="tooltip">Navigate: {NAV_MODE_CONFIG[navMode].label}</span>
    </button>
    <button class="nav-btn {buttonClass}" onclick={scrollToNext}>
      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 9l7 7 7-7" />
      </svg>
      <span class="tooltip">{NAV_MODE_CONFIG[navMode].nextLabel}</span>
    </button>
    <button class="nav-btn {buttonClass}" onclick={scrollToBottom}>
      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          d="M5 5l7 7 7-7M5 13l7 7 7-7"
        />
      </svg>
      <span class="tooltip">Bottom</span>
    </button>
  </div>
{/if}

<style>
  .nav-btn {
    position: relative;
  }
  .mode-btn {
    border-style: dashed;
  }
  .tooltip {
    position: absolute;
    top: 100%;
    left: 50%;
    transform: translateX(-50%);
    margin-top: 0.5rem;
    padding: 0.25rem 0.5rem;
    font-size: 0.75rem;
    white-space: nowrap;
    border-radius: 0.25rem;
    background-color: #1c2128;
    color: #c9d1d9;
    border: 1px solid #30363d;
    box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1);
    opacity: 0;
    visibility: hidden;
    transition: opacity 150ms;
    pointer-events: none;
    z-index: 50;
  }
  .nav-btn:hover .tooltip {
    opacity: 1;
    visibility: visible;
  }
</style>
