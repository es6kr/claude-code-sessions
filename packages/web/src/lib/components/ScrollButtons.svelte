<script lang="ts">
  import type { Message } from '$lib/api'

  export type PinMode = 'compact' | 'compact_boundary' | 'hook_stop' | 'hook_any'

  const PIN_MODE_LABELS: Record<PinMode, string> = {
    compact: 'Compact Summary',
    compact_boundary: 'Compact Boundary',
    hook_stop: 'Stop Hook',
    hook_any: 'Any Hook',
  }

  interface Props {
    messages: Message[]
    scrollContainer: HTMLElement | null | undefined
    class?: string
    pinMode?: PinMode
    onPinModeChange?: (mode: PinMode) => void
  }

  let {
    messages,
    scrollContainer,
    class: className = '',
    pinMode = 'compact',
    onPinModeChange,
  }: Props = $props()

  let showPinDropdown = $state(false)

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
          // Check if there's non-whitespace content after marker
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

    // Array of content items - look for text type (not tool_result)
    for (const item of content as Array<{ type?: string; text?: string }>) {
      if (item.type === 'text' && item.text?.trim()) {
        return true
      }
    }
    return false
  }

  // Lazy-compute navigable indices only when needed (on button click)
  let cachedIndices: number[] | null = null
  let cachedMessagesRef: Message[] | null = null

  const getSplittableIndices = (): number[] => {
    // Invalidate cache if messages array reference changed
    if (cachedIndices === null || cachedMessagesRef !== messages) {
      cachedIndices = []
      for (let i = 0; i < messages.length; i++) {
        if (hasUserTextContent(messages[i])) {
          cachedIndices.push(i)
        }
      }
      cachedMessagesRef = messages
    }
    return cachedIndices
  }

  // Check if a message matches the given pin mode
  const matchesPinMode = (msg: Message, mode: PinMode): boolean => {
    switch (mode) {
      case 'compact':
        return (msg as Message & { isCompactSummary?: boolean }).isCompactSummary === true
      case 'compact_boundary':
        return (
          msg.type === 'compact_boundary' ||
          (msg.type === 'system' && msg.subtype === 'compact_boundary')
        )
      case 'hook_stop': {
        if (msg.type !== 'progress') return false
        const data = (msg as { data?: { hookEvent?: string } }).data
        return data?.hookEvent === 'Stop'
      }
      case 'hook_any':
        return msg.type === 'progress'
    }
  }

  // Lazy-compute pin target index and visibility
  let cachedPinIndex: number = -1
  let cachedPinMessagesRef: Message[] | null = null
  let cachedPinMode: PinMode | null = null

  const computePinCache = () => {
    if (cachedPinMessagesRef !== messages || cachedPinMode !== pinMode) {
      cachedPinIndex = -1
      for (let i = messages.length - 1; i >= 0; i--) {
        if (matchesPinMode(messages[i], pinMode)) {
          cachedPinIndex = i
          break
        }
      }
      cachedPinMessagesRef = messages
      cachedPinMode = pinMode
    }
  }

  const getLastPinIndex = (): number => {
    computePinCache()
    return cachedPinIndex
  }

  // For button visibility
  const checkHasPinTarget = (): boolean => {
    computePinCache()
    return cachedPinIndex >= 0
  }

  // Use $state for button visibility (updated on user interaction)
  let showPinButton = $state(false)

  // Update button visibility when messages or pinMode change
  $effect(() => {
    const _len = messages.length // Track changes
    const _mode = pinMode
    showPinButton = checkHasPinTarget()
  })

  // Track currently visible message index (used for debugging, kept for future use)
  let _currentVisibleIndex = $state(0)

  // Get currently visible message's index in the messages array
  const getCurrentVisibleMessageIndex = (): number => {
    if (!scrollContainer) return 0
    const containerRect = scrollContainer.getBoundingClientRect()
    const elements = scrollContainer.querySelectorAll('[data-msg-id]')

    for (let i = 0; i < elements.length; i++) {
      const el = elements[i] as HTMLElement
      const rect = el.getBoundingClientRect()
      // Find first element whose top is at or below the container top
      if (rect.top >= containerRect.top - 50) {
        // Return the message array index, not DOM index
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

  const scrollToPin = () => {
    const pinIdx = getLastPinIndex()
    if (pinIdx >= 0) {
      scrollToIndex(pinIdx)
    }
  }

  const selectPinMode = (mode: PinMode) => {
    showPinDropdown = false
    onPinModeChange?.(mode)
  }

  // Close dropdown when clicking outside
  const handleClickOutside = (e: MouseEvent) => {
    if (showPinDropdown) {
      const target = e.target as HTMLElement
      if (!target.closest('.pin-dropdown-container')) {
        showPinDropdown = false
      }
    }
  }

  // Navigate to previous splittable message
  const scrollToPrev = () => {
    const currentIdx = getCurrentVisibleMessageIndex()
    const indices = getSplittableIndices()
    // Find the previous splittable message index
    for (let i = indices.length - 1; i >= 0; i--) {
      if (indices[i] < currentIdx) {
        scrollToIndex(indices[i])
        return
      }
    }
    // If at first splittable message or before, go to top
    scrollToTop()
  }

  // Navigate to next splittable message
  const scrollToNext = () => {
    const currentIdx = getCurrentVisibleMessageIndex()
    const indices = getSplittableIndices()
    // Find the next splittable message index
    for (const idx of indices) {
      if (idx > currentIdx) {
        scrollToIndex(idx)
        return
      }
    }
    // If at last splittable message, go to bottom
    scrollToBottom()
  }

  const buttonClass =
    'p-1.5 text-sm rounded border border-gh-border hover:bg-gh-border-subtle text-gh-text-secondary hover:text-gh-text transition-colors bg-gh-bg'
</script>

<svelte:window onclick={handleClickOutside} />

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
      <span class="tooltip">Previous user message</span>
    </button>
    {#if showPinButton}
      <!-- svelte-ignore a11y_click_events_have_key_events -->
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div class="pin-dropdown-container relative">
        <button class="nav-btn {buttonClass}" onclick={scrollToPin}>
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
          <span class="tooltip">{PIN_MODE_LABELS[pinMode]}</span>
        </button>
        <button
          class="pin-mode-toggle p-0.5 rounded text-gh-text-secondary hover:text-gh-text hover:bg-gh-border-subtle transition-colors"
          onclick={() => (showPinDropdown = !showPinDropdown)}
          title="Change pin navigation mode"
          aria-label="Change pin navigation mode"
        >
          <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M19 9l-7 7-7-7"
            />
          </svg>
        </button>
        {#if showPinDropdown}
          <div
            class="pin-dropdown absolute top-full left-0 mt-1 py-1 bg-gh-bg border border-gh-border rounded-md shadow-lg z-50 min-w-[160px]"
            onclick={(e) => e.stopPropagation()}
          >
            {#each Object.entries(PIN_MODE_LABELS) as [mode, label]}
              <button
                class="w-full text-left px-3 py-1.5 text-xs hover:bg-gh-border-subtle transition-colors
                       {mode === pinMode ? 'text-gh-accent font-medium' : 'text-gh-text-secondary'}"
                onclick={() => selectPinMode(mode as PinMode)}
              >
                {label}
              </button>
            {/each}
          </div>
        {/if}
      </div>
    {/if}
    <button class="nav-btn {buttonClass}" onclick={scrollToNext}>
      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 9l7 7 7-7" />
      </svg>
      <span class="tooltip">Next user message</span>
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
