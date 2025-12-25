import { marked } from 'marked'
import { maskHomePath } from '$lib/stores/config'

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
 * Uses current user's home directory from appConfig store
 */
export const formatProjectName = (displayName: string): string => {
  return maskHomePath(displayName)
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

// Re-export from core
export { getDisplayTitle } from '@claude-sessions/core'
