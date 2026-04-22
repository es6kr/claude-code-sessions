<script lang="ts">
  import type { Message } from '$lib/api'

  const NAV_MODES = ['user', 'assistant', 'all', 'compact', 'hook_stop'] as const
  type NavMode = (typeof NAV_MODES)[number]

  const NAV_MODE_CONFIG: Record<
    NavMode,
    { label: string; icon: string; prevLabel: string; nextLabel: string }
  > = {
    user: {
      label: 'User messages',
      icon: '👤',
      prevLabel: 'Previous user message',
      nextLabel: 'Next user message',
    },
    assistant: {
      label: 'Assistant messages',
      icon: '✨',
      prevLabel: 'Previous assistant message',
      nextLabel: 'Next assistant message',
    },
    all: {
      label: 'All messages',
      icon: '💬',
      prevLabel: 'Previous message',
      nextLabel: 'Next message',
    },
    compact: {
      label: 'Compact summaries',
      icon: '📍',
      prevLabel: 'Previous compact summary',
      nextLabel: 'Next compact summary',
    },
    hook_stop: {
      label: 'Stop hooks',
      icon: '⏹',
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
  const normalizeStoredMode = (mode: NavMode | null): NavMode => {
    return mode && NAV_MODES.includes(mode) ? mode : 'user'
  }

  const storedMode =
    typeof window !== 'undefined'
      ? (localStorage.getItem('claude-sessions-nav-mode') as NavMode | null)
      : null
  let navMode = $state<NavMode>(normalizeStoredMode(storedMode))

  $effect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('claude-sessions-nav-mode', navMode)
    }
  })

  // Dropdown state
  let dropdownOpen = $state(false)
  let dropdownRef: HTMLDivElement | undefined = $state()
  let focusedIndex = $state(-1)

  const toggleDropdown = () => {
    dropdownOpen = !dropdownOpen
    if (dropdownOpen) {
      focusedIndex = NAV_MODES.indexOf(navMode)
    }
  }

  const selectMode = (mode: NavMode) => {
    navMode = mode
    dropdownOpen = false
  }

  const handleClickOutside = (event: MouseEvent) => {
    if (dropdownRef && !dropdownRef.contains(event.target as Node)) {
      dropdownOpen = false
    }
  }

  const handleDropdownKeydown = (event: KeyboardEvent) => {
    if (!dropdownOpen) return
    switch (event.key) {
      case 'Escape':
        dropdownOpen = false
        ;(dropdownRef?.querySelector('.mode-btn') as HTMLElement)?.focus()
        event.preventDefault()
        break
      case 'ArrowDown':
        focusedIndex = (focusedIndex + 1) % NAV_MODES.length
        event.preventDefault()
        break
      case 'ArrowUp':
        focusedIndex = (focusedIndex - 1 + NAV_MODES.length) % NAV_MODES.length
        event.preventDefault()
        break
      case 'Enter':
      case ' ':
        if (focusedIndex >= 0) selectMode(NAV_MODES[focusedIndex])
        event.preventDefault()
        break
    }
  }

  $effect(() => {
    if (dropdownOpen && focusedIndex >= 0) {
      const items = dropdownRef?.querySelectorAll('[role="menuitemradio"]')
      ;(items?.[focusedIndex] as HTMLElement)?.focus()
    }
  })

  $effect(() => {
    if (dropdownOpen) {
      document.addEventListener('click', handleClickOutside, true)
      return () => document.removeEventListener('click', handleClickOutside, true)
    }
  })

  // Recursively check if content contains text (handles string, array, and single ContentItem)
  const contentHasText = (content: unknown): boolean => {
    if (!content) return false
    if (typeof content === 'string') return content.trim().length > 0
    if (Array.isArray(content)) {
      for (const item of content) {
        if (contentHasText(item)) return true
      }
      return false
    }
    if (typeof content === 'object') {
      const item = content as { type?: string; text?: string; content?: unknown }
      if (item.type === 'text' && typeof item.text === 'string' && item.text.trim().length > 0) {
        return true
      }
      if ('content' in item) return contentHasText(item.content)
    }
    return false
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

    const content = (m.message as { content?: unknown } | undefined)?.content ?? m.content
    return contentHasText(content)
  }

  const hasAssistantTextContent = (m: Message): boolean => {
    if (m.type !== 'assistant') return false
    const content = (m.message as { content?: unknown } | undefined)?.content ?? m.content
    return contentHasText(content)
  }

  // Check if message matches current navigation mode
  const matchesNavMode = (m: Message, mode: NavMode): boolean => {
    switch (mode) {
      case 'user':
        return hasUserTextContent(m)
      case 'assistant':
        return hasAssistantTextContent(m)
      case 'all':
        return hasUserTextContent(m) || hasAssistantTextContent(m)
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
    <div class="dropdown-wrapper" bind:this={dropdownRef} onkeydown={handleDropdownKeydown}>
      <button
        class="nav-btn mode-btn {buttonClass}"
        onclick={toggleDropdown}
        aria-haspopup="true"
        aria-expanded={dropdownOpen}
        aria-label="Navigation mode: {NAV_MODE_CONFIG[navMode].label}"
      >
        <span class="mode-icon">{NAV_MODE_CONFIG[navMode].icon}</span>
        <span class="tooltip">Navigate: {NAV_MODE_CONFIG[navMode].label}</span>
      </button>
      {#if dropdownOpen}
        <div class="dropdown-menu" role="menu" aria-label="Navigation modes">
          {#each NAV_MODES as mode, i}
            <button
              class="dropdown-item"
              class:active={mode === navMode}
              class:focused={i === focusedIndex}
              role="menuitemradio"
              aria-checked={mode === navMode}
              tabindex={i === focusedIndex ? 0 : -1}
              onclick={() => selectMode(mode)}
            >
              <span class="dropdown-icon">{NAV_MODE_CONFIG[mode].icon}</span>
              <span>{NAV_MODE_CONFIG[mode].label}</span>
            </button>
          {/each}
        </div>
      {/if}
    </div>
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
  .mode-icon {
    font-size: 0.875rem;
    line-height: 1;
  }
  .dropdown-wrapper {
    position: relative;
  }
  .dropdown-menu {
    position: absolute;
    top: 100%;
    left: 50%;
    transform: translateX(-50%);
    margin-top: 0.25rem;
    min-width: 10rem;
    border-radius: 0.375rem;
    background-color: #1c2128;
    border: 1px solid #30363d;
    box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.3);
    z-index: 50;
    overflow: hidden;
  }
  .dropdown-item {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    width: 100%;
    padding: 0.375rem 0.75rem;
    font-size: 0.75rem;
    color: #c9d1d9;
    background: none;
    border: none;
    cursor: pointer;
    text-align: left;
    white-space: nowrap;
  }
  .dropdown-item:hover,
  .dropdown-item.focused {
    background-color: #30363d;
  }
  .dropdown-item:focus {
    outline: none;
    background-color: #30363d;
  }
  .dropdown-item.active {
    background-color: #1f6feb33;
    color: #58a6ff;
  }
  .dropdown-icon {
    font-size: 0.875rem;
    width: 1.25rem;
    text-align: center;
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
