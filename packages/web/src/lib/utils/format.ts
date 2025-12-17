import { marked } from 'marked'

/**
 * Format utilities for display
 */

// Configure marked for safe rendering
marked.setOptions({
  breaks: true,
  gfm: true,
})

/**
 * Format date string to locale string
 */
export const formatDate = (dateStr?: string): string => {
  if (!dateStr) return '-'
  return new Date(dateStr).toLocaleString()
}

/**
 * Truncate string with ellipsis
 */
export const truncate = (str: string, len: number): string =>
  str.length > len ? str.slice(0, len) + '...' : str

/**
 * Format project name for display
 * /Users/david/Sync/AI -> ~/Sync/AI
 */
export const formatProjectName = (displayName: string): string => {
  return displayName.replace(/^\/Users\/[^/]+/, '~')
}

/**
 * Render markdown to HTML
 */
export const renderMarkdown = (text: string): string => {
  try {
    return marked.parse(text) as string
  } catch {
    return text
  }
}
