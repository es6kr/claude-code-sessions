/**
 * Utility functions for message processing
 */
import { Effect } from 'effect'
import * as fs from 'node:fs/promises'
import type {
  Message,
  MessagePayload,
  TextContent,
  AskUserQuestionResult,
  SummaryInfo,
  SessionTodos,
} from './types.js'
import { createLogger } from './logger.js'

const logger = createLogger('utils')

// IDE tag pattern for removal
const IDE_TAG_PATTERN = /<ide_[^>]*>[\s\S]*?<\/ide_[^>]*>/g

// Extract text content from message payload
export const extractTextContent = (
  message: MessagePayload | undefined,
  options: { stripIdeTags?: boolean } = {}
): string => {
  if (!message) return ''

  const content = message.content
  if (!content) return ''

  let result: string

  // If content is string, return directly
  if (typeof content === 'string') {
    result = content
  } else if (Array.isArray(content)) {
    // If content is array, extract text items
    result = content
      .filter((item): item is TextContent => typeof item === 'object' && item?.type === 'text')
      .map((item) => {
        if (item.text == null) {
          logger.warn('TextContent item has undefined or null text property')
          return ''
        }
        return item.text
      })
      .join('')
  } else {
    result = ''
  }

  // Optionally strip IDE tags
  if (options.stripIdeTags) {
    result = result.replace(IDE_TAG_PATTERN, '').trim()
  }

  return result
}

/**
 * Parse command message content (e.g., slash commands like /commit)
 * Returns the command name and message extracted from XML tags
 */
export const parseCommandMessage = (
  content?: string
): { name: string; message: string; args: string } => {
  const name = content?.match(/<command-name>([^<]+)<\/command-name>/)?.[1] ?? ''
  const message = content?.match(/<command-message>([^<]+)<\/command-message>/)?.[1] ?? ''
  const args = content?.match(/<command-args>([^<]+)<\/command-args>/)?.[1]?.trim() ?? ''
  return { name, message, args }
}

// Extract title from message or text (strips IDE tags, uses first line)
export const extractTitle = (input: MessagePayload | string | undefined): string => {
  if (!input) return 'Untitled'

  // Extract text content with IDE tags stripped
  let text: string
  if (typeof input === 'string') {
    text = input.replace(IDE_TAG_PATTERN, '').trim()
  } else {
    text = extractTextContent(input, { stripIdeTags: true })
  }

  if (!text) return 'Untitled'

  // Check for slash command format (e.g., <command-name>/session</command-name>)
  const { name, args } = parseCommandMessage(text)
  if (name) return args ? `${name} ${args}` : name

  let cleaned = text.trim()
  if (!cleaned) return 'Untitled'

  // Use only content before \n\n or \n as title
  if (cleaned.includes('\n\n')) {
    cleaned = cleaned.split('\n\n')[0]
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
 * Also handles slash command format in title
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
  if (title && title !== 'Untitled') {
    // Check if title contains command-name tag (slash command)
    if (title.includes('<command-name>')) {
      const { name, args } = parseCommandMessage(title)
      if (name) return args ? `${name} ${args}` : name
    }
    return title
  }
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
 * Get sort timestamp for session (Unix timestamp ms)
 * Priority: summaries[0].timestamp > createdAt > 0
 */
export const getSessionSortTimestamp = (session: {
  summaries?: SummaryInfo[]
  createdAt?: string
}): number => {
  const timestampStr = session.summaries?.[0]?.timestamp ?? session.createdAt
  return timestampStr ? new Date(timestampStr).getTime() : 0
}

/**
 * Try to parse a single JSON line, returning null on failure with optional warning log
 * Use this when you want to skip invalid lines instead of throwing
 */
export const tryParseJsonLine = <T = Record<string, unknown>>(
  line: string,
  lineNumber: number,
  filePath?: string
): T | null => {
  try {
    return JSON.parse(line) as T
  } catch {
    if (filePath) {
      console.warn(`Skipping invalid JSON at line ${lineNumber} in ${filePath}`)
    }
    return null
  }
}

/**
 * Parse JSONL lines with detailed error messages including file path and line number
 * @throws Error with "Failed to parse line X in /path/to/file: original error"
 */
export const parseJsonlLines = <T = Record<string, unknown>>(
  lines: string[],
  filePath: string
): T[] => {
  return lines.map((line, idx) => {
    try {
      return JSON.parse(line) as T
    } catch (e) {
      const err = e as Error
      throw new Error(`Failed to parse line ${idx + 1} in ${filePath}: ${err.message}`)
    }
  })
}

/**
 * Read and parse JSONL file (Effect wrapper)
 * Combines file reading and JSONL parsing with proper error messages
 */
export const readJsonlFile = <T = Record<string, unknown>>(filePath: string) =>
  Effect.gen(function* () {
    const content = yield* Effect.tryPromise(() => fs.readFile(filePath, 'utf-8'))
    const lines = content.trim().split('\n').filter(Boolean)
    return parseJsonlLines<T>(lines, filePath)
  })

// ============================================================================
// UI Shared Utilities (VSCode Extension & Web UI)
// ============================================================================

/**
 * Format timestamp as relative time (e.g., "2h ago", "3d ago")
 * Used by both VSCode Extension tree view and Web UI
 *
 * @param timestamp - Unix timestamp (ms) or ISO date string
 * @returns Relative time string
 */
export const formatRelativeTime = (timestamp: number | string): string => {
  const date = typeof timestamp === 'string' ? new Date(timestamp) : new Date(timestamp)
  const now = new Date()
  const diff = now.getTime() - date.getTime()

  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)

  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  if (hours < 24) return `${hours}h ago`
  if (days < 7) return `${days}d ago`

  return date.toLocaleDateString()
}

/**
 * Calculate total todo count from session todos
 * Includes both session-level and agent-level todos
 */
export const getTotalTodoCount = (todos: SessionTodos): number => {
  return todos.sessionTodos.length + todos.agentTodos.reduce((sum, a) => sum + a.todos.length, 0)
}

/**
 * Check if session has sub-items (summaries, agents, or todos)
 * Used to determine if tree item should be expandable
 */
export const sessionHasSubItems = (data: {
  summaries: { length: number }
  agents: { length: number }
  todos: SessionTodos
}): boolean => {
  const todoCount = getTotalTodoCount(data.todos)
  return data.summaries.length > 0 || data.agents.length > 0 || todoCount > 0
}

/**
 * Get session tooltip text based on what's displayed as title
 * Shows complementary information to the displayed title + session ID
 *
 * Logic:
 * - If customTitle is displayed → show currentSummary
 * - If currentSummary is displayed → show original title
 * - If title is displayed → show currentSummary
 * - Always append session ID at the end
 */
export const getSessionTooltip = (session: {
  id: string
  title?: string
  customTitle?: string
  currentSummary?: string
}): string => {
  const { id, title, customTitle, currentSummary } = session
  let text: string
  // If customTitle is displayed, show currentSummary in tooltip
  if (customTitle && currentSummary) {
    text = currentSummary
  }
  // If currentSummary is displayed as title, show original title in tooltip
  else if (currentSummary && title && title !== 'Untitled') {
    text = title
  }
  // If title is displayed, show currentSummary if available
  else if (currentSummary) {
    text = currentSummary
  } else {
    text = title ?? 'No title'
  }

  // Append session ID
  text += `\n\nID: ${id}`

  return text
}

/**
 * Check if session can be moved to target project
 * Returns false if source and target are the same project
 */
export const canMoveSession = (sourceProject: string, targetProject: string): boolean => {
  return sourceProject !== targetProject
}
