/**
 * Message content utilities
 */

import type { Content, Message } from '$lib/api'

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
  const m = msg.message as { content?: Content } | undefined
  if (!m?.content) return ''
  return extractText(m.content)
}

/**
 * Parse command message content
 */
export const parseCommandMessage = (content?: string): { name: string; message: string } => {
  const name = content?.match(/<command-name>([^<]+)<\/command-name>/)?.[1] ?? ''
  const message = content?.match(/<command-message>([^<]+)<\/command-message>/)?.[1] ?? ''
  return { name, message }
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
