/**
 * Message content utilities
 */

import type { Content, Message } from '$lib/api'
import { maskHomePath } from '$lib/stores/config'

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
