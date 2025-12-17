/**
 * Utility functions for message processing
 */
import type { ContentItem, Message, MessagePayload } from './types.js'

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
      .filter((item): item is ContentItem => typeof item === 'object' && item?.type === 'text')
      .map((item) => item.text ?? '')
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
export const isContinuationSummary = (msg: Record<string, unknown>): boolean => {
  // isCompactSummary flag is set by Claude Code for continuation summaries
  if (msg.isCompactSummary === true) return true

  // Fallback: check message content
  if (msg.type !== 'user') return false
  const text = extractTextContent(msg.message as MessagePayload | undefined)
  return text.startsWith('This session is being continued from')
}
