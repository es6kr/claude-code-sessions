/**
 * Shared constants and utilities for tree view rendering
 * Used by both VSCode Extension and Web UI
 */

// ============================================================================
// Tree Item Types
// ============================================================================

/**
 * Tree item type discriminator
 * Used for identifying node types in both VSCode TreeView and Web UI
 */
export type TreeItemType =
  | 'project'
  | 'session'
  | 'summaries-group'
  | 'todos-group'
  | 'agents-group'
  | 'summary'
  | 'todo'
  | 'agent'

// ============================================================================
// Icon Mappings (Framework-agnostic)
// ============================================================================

/**
 * Icon definition with both VSCode codicon and emoji variants
 */
interface IconDef {
  /** VSCode codicon name (without 'codicon-' prefix) */
  codicon: string
  /** Emoji for web/terminal display */
  emoji: string
}

/**
 * Todo status icon with optional color
 */
interface TodoIconDef extends IconDef {
  /** Optional color for VSCode ThemeColor */
  color?: 'green' | 'yellow'
}

/**
 * Icon mappings for all tree item types
 * - Use `.codicon` for VSCode Extension (ThemeIcon)
 * - Use `.emoji` for Web UI and terminal
 */
export const TREE_ICONS = {
  project: { codicon: 'folder', emoji: '📁' },
  session: { codicon: 'comment-discussion', emoji: '💬' },
  'summaries-group': { codicon: 'history', emoji: '📝' },
  'todos-group': { codicon: 'checklist', emoji: '📋' },
  'agents-group': { codicon: 'hubot', emoji: '🤖' },
  summary: { codicon: 'note', emoji: '📝' },
  agent: { codicon: 'hubot', emoji: '🤖' },
  todo: {
    completed: { codicon: 'pass-filled', emoji: '✅', color: 'green' } as TodoIconDef,
    in_progress: { codicon: 'sync~spin', emoji: '🔄', color: 'yellow' } as TodoIconDef,
    pending: { codicon: 'circle-outline', emoji: '⭕' } as TodoIconDef,
  },
} as const

/**
 * Get todo icon based on status
 */
export const getTodoIcon = (status: 'pending' | 'in_progress' | 'completed'): TodoIconDef => {
  return TREE_ICONS.todo[status]
}

// ============================================================================
// Tree Node ID Generation
// ============================================================================

/**
 * Generate unique tree node ID for drag & drop and state management
 * Format: `{type}:{projectName}:{sessionId}[:agentId][:itemIndex]`
 *
 * @example
 * generateTreeNodeId('session', 'my-project', 'abc123')
 * // => 'session:my-project:abc123'
 *
 * generateTreeNodeId('todo', 'my-project', 'abc123', 'agent-1', 0)
 * // => 'todo:my-project:abc123:agent-1:0'
 */
export const generateTreeNodeId = (
  type: TreeItemType,
  projectName: string,
  sessionId: string,
  agentId?: string,
  itemIndex?: number
): string => {
  let id = `${type}:${projectName}:${sessionId}`
  if (agentId) id += `:${agentId}`
  if (itemIndex !== undefined) id += `:${itemIndex}`
  return id
}

/**
 * Parse tree node ID back to components
 */
export const parseTreeNodeId = (
  id: string
): {
  type: TreeItemType
  projectName: string
  sessionId: string
  agentId?: string
  itemIndex?: number
} | null => {
  const parts = id.split(':')
  if (parts.length < 3) return null

  const result: ReturnType<typeof parseTreeNodeId> = {
    type: parts[0] as TreeItemType,
    projectName: parts[1],
    sessionId: parts[2],
  }

  if (parts.length >= 4 && parts[3]) {
    result.agentId = parts[3]
  }

  if (parts.length >= 5 && parts[4]) {
    const idx = parseInt(parts[4], 10)
    if (!isNaN(idx)) {
      result.itemIndex = idx
    }
  }

  return result
}
