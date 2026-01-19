/**
 * Utility functions for message processing
 */
import type {
  Message,
  MessagePayload,
  TextContent,
  AskUserQuestionResult,
  Project,
  SummaryInfo,
} from './types.js'
import { createLogger } from './logger.js'
import { pathToFolderName } from './paths.js'

const logger = createLogger('utils')

// Extract text content from message payload
export const extractTextContent = (message: MessagePayload | undefined): string => {
  if (!message) return ''

  const content = message.content
  if (!content) return ''

  // If content is string, return directly
  if (typeof content === 'string') return content

  // If content is array, extract text items
  if (Array.isArray(content)) {
    return content
      .filter((item): item is TextContent => typeof item === 'object' && item?.type === 'text')
      .map((item) => {
        if (item.text == null) {
          logger.warn('TextContent item has undefined or null text property')
          return ''
        }
        return item.text
      })
      .join('')
  }

  return ''
}

// Extract title from text content (remove IDE tags, use first line)
export const extractTitle = (text: string): string => {
  if (!text) return 'Untitled'

  // Remove IDE tags (<ide_opened_file>, <ide_selection>, etc.)
  let cleaned = text.replace(/<ide_[^>]*>[\s\S]*?<\/ide_[^>]*>/g, '').trim()

  if (!cleaned) return 'Untitled'

  // Use only content before \n\n or \n as title
  if (cleaned.includes('\n\n')) {
    cleaned = cleaned.split('\n\n')[0]
  } else if (cleaned.includes('\n')) {
    cleaned = cleaned.split('\n')[0]
  }

  // Limit to 100 characters
  if (cleaned.length > 100) {
    return cleaned.slice(0, 100) + '...'
  }

  return cleaned || 'Untitled'
}

// Check if message contains "Invalid API key"
export const isInvalidApiKeyMessage = (msg: Message): boolean => {
  const text = extractTextContent(msg.message)
  return text.includes('Invalid API key')
}

// Error patterns to exclude from tree view
const ERROR_SESSION_PATTERNS = [
  'API Error',
  'authentication_error',
  'Invalid API key',
  'OAuth token has expired',
  'Please run /login',
]

// Check if session title/summary indicates an error session
export const isErrorSessionTitle = (title: string | undefined): boolean => {
  if (!title) return false
  return ERROR_SESSION_PATTERNS.some((pattern) => title.includes(pattern))
}

// Check if a message is a continuation summary (from compact)
export const isContinuationSummary = (msg: Message): boolean => {
  // isCompactSummary flag is set by Claude Code for continuation summaries
  if (msg.isCompactSummary === true) return true

  // Fallback: check message content
  if (msg.type !== 'user') return false
  const text = extractTextContent(msg.message as MessagePayload | undefined)
  return text.startsWith('This session is being continued from')
}

/**
 * Get display title with fallback logic
 * Priority: customTitle > currentSummary (truncated) > title > fallback
 */
export const getDisplayTitle = (
  customTitle: string | undefined,
  currentSummary: string | undefined,
  title: string | undefined,
  maxLength = 60,
  fallback = 'Untitled'
): string => {
  if (customTitle) return customTitle
  if (currentSummary) {
    return currentSummary.length > maxLength
      ? currentSummary.slice(0, maxLength - 3) + '...'
      : currentSummary
  }
  if (title && title !== 'Untitled') return title
  return fallback
}

// Helper to replace message content with extracted text
const replaceMessageContent = (msg: Message, text: string): Message => ({
  ...msg,
  message: {
    ...msg.message,
    content: [{ type: 'text', text } satisfies TextContent],
  },
  toolUseResult: undefined,
})

// Clean up first message content when splitting session
// Handles: 1) tool rejection with reason, 2) AskUserQuestion responses
export const cleanupSplitFirstMessage = (msg: Message): Message => {
  const toolUseResult = msg.toolUseResult
  if (!toolUseResult) return msg

  // Case 1: AskUserQuestion response (toolUseResult is object with questions/answers)
  if (typeof toolUseResult === 'object' && 'answers' in toolUseResult) {
    const answers = (toolUseResult as AskUserQuestionResult).answers
    const qaText = Object.entries(answers)
      .map(([q, a]) => `Q: ${q}\nA: ${a}`)
      .join('\n\n')
    return replaceMessageContent(msg, qaText)
  }

  // Case 2: Tool rejection with reason (toolUseResult is string)
  if (typeof toolUseResult === 'string') {
    const rejectionMarker = 'The user provided the following reason for the rejection:'
    const rejectionIndex = toolUseResult.indexOf(rejectionMarker)
    if (rejectionIndex === -1) return msg

    const text = toolUseResult.slice(rejectionIndex + rejectionMarker.length).trim()
    if (!text) return msg
    return replaceMessageContent(msg, text)
  }

  return msg
}

/**
 * Mask home directory path with ~
 * Only masks the specified homeDir, not other users' paths
 */
export const maskHomePath = (text: string, homeDir: string): string => {
  if (!homeDir) return text

  // Escape special regex characters in homeDir
  const escapedHome = homeDir.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const regex = new RegExp(`${escapedHome}(?=[/\\\\]|$)`, 'g')

  return text.replace(regex, '~')
}

/**
 * Get session sort timestamp based on official Claude Code extension behavior
 *
 * CRITICAL ARCHITECTURE:
 * - Summary records have `leafUuid` but NO timestamp in the summary record itself
 * - `leafUuid` points to a message in ANOTHER session (cross-session reference)
 * - The timestamp for sorting must come from the TARGET message's timestamp
 * - Official extension uses leafUuid's target message timestamp for sorting/display
 *
 * Priority: summaries[0].timestamp (leafUuid-based) > createdAt
 */
export const getSessionSortTimestamp = (session: {
  summaries?: SummaryInfo[]
  createdAt?: string
}): string | undefined => {
  return session.summaries?.[0]?.timestamp ?? session.createdAt
}

/**
 * Sort projects with priority:
 * 1. Current project (if specified)
 * 2. Current user's home directory subpaths
 * 3. Others (alphabetically by displayName)
 */
export const sortProjects = (
  projects: Project[],
  options: {
    currentProjectName?: string | null
    homeDir?: string
    filterEmpty?: boolean
  } = {}
): Project[] => {
  const { currentProjectName, homeDir, filterEmpty = true } = options

  const filtered = filterEmpty ? projects.filter((p) => p.sessionCount > 0) : projects

  // Convert homeDir to folder name format for comparison with project.name
  // e.g., "/Users/david" -> "-Users-david"
  const homeDirPrefix = homeDir ? pathToFolderName(homeDir) : null

  return filtered.sort((a, b) => {
    // Current project always first
    if (currentProjectName) {
      if (a.name === currentProjectName) return -1
      if (b.name === currentProjectName) return 1
    }

    // Then prioritize current user's home directory paths
    // Compare using project.name (folder name format) with homeDirPrefix
    if (homeDirPrefix) {
      const aIsUserHome = a.name.startsWith(homeDirPrefix)
      const bIsUserHome = b.name.startsWith(homeDirPrefix)
      if (aIsUserHome && !bIsUserHome) return -1
      if (!aIsUserHome && bIsUserHome) return 1
    }

    // Finally sort by display name
    return a.displayName.localeCompare(b.displayName)
  })
}
