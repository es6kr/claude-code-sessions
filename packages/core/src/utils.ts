/**
 * Utility functions for message processing
 */
import type { Message, MessagePayload, TextContent } from './types.js'
import { createLogger } from './logger.js'

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

// Clean up first message content when splitting session
// Uses toolUseResult field to extract the actual user message from tool rejection
export const cleanupSplitFirstMessage = (msg: Message): Message => {
  const toolUseResult = msg.toolUseResult
  if (!toolUseResult) return msg

  // Extract rejection reason from toolUseResult
  const rejectionMarker = 'The user provided the following reason for the rejection:'
  const rejectionIndex = toolUseResult.indexOf(rejectionMarker)
  if (rejectionIndex === -1) return msg

  const text = toolUseResult.slice(rejectionIndex + rejectionMarker.length).trim()
  if (!text) return msg

  // Replace message content with extracted text
  return {
    ...msg,
    message: {
      ...msg.message,
      content: [{ type: 'text', text } satisfies TextContent],
    },
    toolUseResult: undefined,
  }
}
