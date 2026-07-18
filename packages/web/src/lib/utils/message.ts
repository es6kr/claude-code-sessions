/**
 * Message content utilities
 */

import type { Content, ContentItem, Message } from '$lib/api'
import { maskHomePath } from '$lib/stores/config'

/**
 * Normalize Content into a uniform ContentItem array for inspection.
 *
 * Content can be a string, a single ContentItem, or an array of ContentItems
 * (see api.ts). Categorization logic must look at the items inside, so each
 * shape is normalized to the array form here.
 *
 * - `string` -> `[{ type: 'text', text }]`
 * - single `ContentItem` -> `[item]`
 * - `ContentItem[]` -> pass through
 */
export const normalizeContent = (content: Content): ContentItem[] => {
  if (typeof content === 'string') {
    return [{ type: 'text', text: content } as ContentItem]
  }
  if (Array.isArray(content)) return content
  return [content]
}

export type MessageCategory =
  | 'assistant'
  | 'metadata'
  | 'progress'
  | 'summary'
  | 'system'
  | 'thinking'
  | 'tool_result'
  | 'tool_use'
  | 'user'

const METADATA_TYPES = new Set([
  'agent-name',
  'compact_boundary',
  'custom-title',
  'file-history-snapshot',
  'queue-operation',
])

type CategoryContentItem = ContentItem & {
  text?: string
  thinking?: string
}

export const getMessageCategory = (msg: Message): MessageCategory => {
  if (METADATA_TYPES.has(msg.type)) return 'metadata'
  if (msg.type === 'progress') return 'progress'
  if (msg.type === 'summary') return 'summary'
  if (msg.type === 'system') return 'system'
  if (msg.type === 'human') return 'user'

  if (msg.type === 'user') {
    const m = msg.message as { content?: Content } | undefined
    if (m?.content) {
      const items = normalizeContent(m.content)
      if (items[0]?.type === 'tool_result') return 'tool_result'
    }
    return 'user'
  }

  if (msg.type === 'assistant') {
    const m = msg.message as { content?: Content } | undefined
    if (m?.content) {
      const items = normalizeContent(m.content) as CategoryContentItem[]
      if (items.some((c) => c?.type === 'tool_use')) return 'tool_use'
      const hasText = items.some((c) => c?.type === 'text' && c?.text?.trim())
      if (!hasText && items.some((c) => c?.type === 'thinking')) return 'thinking'
    }
    return 'assistant'
  }

  return 'metadata'
}

/**
 * Per-message capability flags for UI affordances (issue #123 Scope (b)).
 *
 * Derived from the message's ContentItem types via a single type-aware
 * function so capability policy (including the tool_use <-> tool_result
 * pairing invariant) lives here, not in components.
 */
export interface Capabilities {
  canEdit: boolean
  canDelete: boolean
  canCopy: boolean
  canExport: boolean
  canConvert: boolean
  canExtract: boolean
}

/**
 * canDelete is universally true (behavior-preserving: the Delete affordance
 * has never been content-gated). The remaining flags start false and are
 * granted per content type below.
 */
const BASE_CAPABILITIES: Capabilities = {
  canEdit: false,
  canDelete: true,
  canCopy: false,
  canExport: false,
  canConvert: false,
  canExtract: false,
}

const EDITABLE_MESSAGE_TYPES = new Set(['user', 'human', 'assistant'])

/**
 * Compute the capability set for a message from its content shape.
 *
 * Capability matrix (issue #123):
 * - `text`: edit/copy/export
 * - `tool_result`: edit/copy/export/convert/extract
 * - `thinking`: edit/copy/export/convert
 * - `tool_use`: copy only (editing would break tool_use <-> tool_result pairing)
 * - unknown types: delete only
 *
 * Pairing invariant: a sibling `tool_use` block anywhere in the content blocks
 * the mutating capabilities (edit/convert) in EVERY branch — matching
 * getMessageCategory, which classifies any tool_use-bearing message as
 * `tool_use` regardless of block order (e.g. `[thinking, tool_use]`).
 */
export const getCapabilities = (msg: Message): Capabilities => {
  if (!EDITABLE_MESSAGE_TYPES.has(msg.type)) return { ...BASE_CAPABILITIES }

  const m = msg.message as { content?: Content } | undefined
  if (!m?.content) return { ...BASE_CAPABILITIES }

  const items = normalizeContent(m.content)
  const primary = items[0]?.type
  const hasToolUse = items.some((c) => c?.type === 'tool_use')
  const editable = !!msg.uuid

  switch (primary) {
    case 'text':
      return {
        ...BASE_CAPABILITIES,
        canEdit: editable && !hasToolUse,
        canCopy: true,
        canExport: true,
      }
    case 'tool_result':
      return {
        ...BASE_CAPABILITIES,
        canEdit: editable && !hasToolUse,
        canCopy: true,
        canExport: true,
        canConvert: !hasToolUse,
        canExtract: true,
      }
    case 'thinking':
      return {
        ...BASE_CAPABILITIES,
        canEdit: editable && !hasToolUse,
        canCopy: true,
        canExport: true,
        canConvert: !hasToolUse,
      }
    case 'tool_use':
      return { ...BASE_CAPABILITIES, canCopy: true }
    default:
      return { ...BASE_CAPABILITIES }
  }
}

export const MESSAGE_CATEGORY_LABELS: Record<MessageCategory, string> = {
  assistant: 'Assistant',
  metadata: 'Metadata',
  progress: 'Progress',
  summary: 'Summary',
  system: 'System',
  thinking: 'Thinking',
  tool_result: 'Tool Result',
  tool_use: 'Tool Use',
  user: 'User',
}

export const ALL_MESSAGE_CATEGORIES = Object.keys(MESSAGE_CATEGORY_LABELS) as MessageCategory[]

export const DEFAULT_VISIBLE_CATEGORIES: MessageCategory[] = [
  'assistant',
  'metadata',
  'summary',
  'user',
]

/**
 * Replace home directory paths with ~ in text content
 * Uses current user's home directory from appConfig store
 */
export const maskHomePaths = (text: string): string => {
  return maskHomePath(text)
}

/**
 * Recursively extract text from Content
 */
const extractText = (content: Content): string => {
  if (typeof content === 'string') return content

  if (Array.isArray(content)) {
    return content.map(extractText).join('')
  }

  // Single ContentItem
  if (content.type === 'text') return content.text ?? ''

  // thinking type - skip (displayed separately in MessageItem)
  if (content.type === 'thinking') {
    return ''
  }

  // tool_result - extract inner content
  if (content.type === 'tool_result') {
    return content.content ? extractText(content.content) : '0'
  }

  if (content.content) return extractText(content.content)

  return ''
}

/**
 * Extract displayable content from message
 */
export const getMessageContent = (msg: Message): string => {
  let content = ''

  // Check msg.summary for summary type messages
  if (msg.summary) {
    content = msg.summary
  }
  // Check msg.content (for system messages)
  else if (msg.content) {
    content = extractText(msg.content)
  }
  // Check msg.message.content (for user/assistant messages)
  else {
    const m = msg.message as { content?: Content } | undefined
    if (m?.content) {
      content = extractText(m.content)
    }
  }

  // Mask home directory paths for privacy
  return maskHomePaths(content)
}

// Re-export from core
export { parseCommandMessage } from '@claude-sessions/core'

/**
 * Hook info from stop_hook_summary message
 */
export interface HookInfo {
  command: string
}

/**
 * Parsed stop_hook_summary data
 */
export interface StopHookSummaryData {
  hookCount: number
  hookInfos: HookInfo[]
  hookErrors: string[]
  preventedContinuation: boolean
  stopReason: string
  hasOutput: boolean
  level: string
}

/**
 * Parse stop_hook_summary message data
 */
export const parseStopHookSummary = (msg: unknown): StopHookSummaryData | null => {
  const m = msg as Record<string, unknown>
  if (m?.subtype !== 'stop_hook_summary') return null

  return {
    hookCount: (m.hookCount as number) ?? 0,
    hookInfos: (m.hookInfos as HookInfo[]) ?? [],
    hookErrors: (m.hookErrors as string[]) ?? [],
    preventedContinuation: (m.preventedContinuation as boolean) ?? false,
    stopReason: (m.stopReason as string) ?? '',
    hasOutput: (m.hasOutput as boolean) ?? false,
    level: (m.level as string) ?? 'info',
  }
}

/**
 * Parsed turn_duration data
 */
export interface TurnDurationData {
  durationMs: number
  durationFormatted: string
}

/**
 * Parse turn_duration message data
 */
export const parseTurnDuration = (msg: unknown): TurnDurationData | null => {
  const m = msg as Record<string, unknown>
  if (m?.subtype !== 'turn_duration') return null

  const durationMs = (m.durationMs as number) ?? 0
  const seconds = Math.round(durationMs / 1000)
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60

  const durationFormatted =
    minutes > 0 ? `${minutes}m ${remainingSeconds}s` : `${remainingSeconds}s`

  return { durationMs, durationFormatted }
}

/**
 * Hook progress data from progress message
 */
export interface HookProgressData {
  type: 'hook_progress'
  hookEvent: string
  hookName: string
  command?: string
}

/**
 * Parsed progress data
 */
export interface ProgressData {
  type: string
  hookEvent?: string
  hookName?: string
  command?: string
}

/**
 * Parse progress message data
 */
export const parseProgress = (msg: unknown): ProgressData | null => {
  const m = msg as Record<string, unknown>
  if (m?.type !== 'progress') return null

  const data = m.data as Record<string, unknown> | undefined
  if (!data) return null

  return {
    type: (data.type as string) ?? 'unknown',
    hookEvent: data.hookEvent as string | undefined,
    hookName: data.hookName as string | undefined,
    command: data.command as string | undefined,
  }
}

/**
 * Parsed IDE tag segment
 */
export interface IdeTagSegment {
  type: 'text' | 'ide_tag'
  content: string
  tag?: string // tag name for ide_tag type
}

/**
 * Parse IDE tags from message content, returning segments
 */
export const parseIdeTags = (content: string): IdeTagSegment[] => {
  const segments: IdeTagSegment[] = []
  const regex = /<(ide_[^>]+)>([\s\S]*?)<\/\1>/g

  let lastIndex = 0
  let match

  while ((match = regex.exec(content)) !== null) {
    // Add text before this tag
    if (match.index > lastIndex) {
      const text = content.slice(lastIndex, match.index).trim()
      if (text) {
        segments.push({ type: 'text', content: text })
      }
    }

    // Add the IDE tag
    segments.push({
      type: 'ide_tag',
      tag: match[1],
      content: match[2].trim(),
    })

    lastIndex = regex.lastIndex
  }

  // Add remaining text after last tag
  if (lastIndex < content.length) {
    const text = content.slice(lastIndex).trim()
    if (text) {
      segments.push({ type: 'text', content: text })
    }
  }

  return segments
}
