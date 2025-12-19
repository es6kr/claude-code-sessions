/**
 * Core types for Claude Code session management
 */

// Message content types
export interface ContentItem {
  type: string
  text?: string
  name?: string
  input?: unknown
}

export interface MessagePayload {
  role?: string
  content?: ContentItem[] | string
  model?: string
}

// Session message
export interface Message {
  uuid: string
  parentUuid?: string | null
  type: string
  message?: MessagePayload
  timestamp?: string
  sessionId?: string
  isCompactSummary?: boolean
  customTitle?: string
  summary?: string
}

// Session metadata
export interface SessionMeta {
  id: string
  projectName: string
  title?: string
  messageCount: number
  createdAt?: string
  updatedAt?: string
}

// Project info
export interface Project {
  name: string
  displayName: string
  path: string
  sessionCount: number
}

// Todo item
export interface TodoItem {
  content: string
  status: 'pending' | 'in_progress' | 'completed'
  activeForm?: string
}

export interface SessionTodos {
  sessionId: string
  sessionTodos: TodoItem[]
  agentTodos: { agentId: string; todos: TodoItem[] }[]
  hasTodos: boolean
}

// File change tracking
export interface FileChange {
  path: string
  action: 'created' | 'modified' | 'deleted'
  timestamp?: string
  messageUuid?: string
}

export interface SessionFilesSummary {
  sessionId: string
  projectName: string
  files: FileChange[]
  totalChanges: number
}

// Operation results
export interface DeleteSessionResult {
  success: boolean
  backupPath?: string
  deletedAgents: number
  deletedTodos?: number
}

export interface RenameSessionResult {
  success: boolean
  error?: string
}

export interface SplitSessionResult {
  success: boolean
  newSessionId?: string
  newSessionPath?: string
  movedMessageCount?: number
  duplicatedSummary?: boolean
  error?: string
}

export interface MoveSessionResult {
  success: boolean
  error?: string
}

export interface ClearSessionsResult {
  success: boolean
  deletedCount: number
  removedMessageCount?: number
  deletedOrphanAgentCount?: number
  deletedOrphanTodoCount?: number
}

export interface CleanupPreview {
  project: string
  emptySessions: SessionMeta[]
  invalidSessions: SessionMeta[]
  emptyWithTodosCount?: number
  orphanAgentCount?: number
  orphanTodoCount?: number
}

// Search result
export interface SearchResult {
  sessionId: string
  projectName: string
  title: string
  matchType: 'title' | 'content'
  snippet?: string
  messageUuid?: string
  timestamp?: string
}

// Summary message from session file
export interface SummaryInfo {
  summary: string
  leafUuid?: string
  timestamp?: string
}

// Agent info for tree display
export interface AgentInfo {
  id: string
  name?: string
  messageCount: number
}

// Session tree node with full data
export interface SessionTreeData {
  id: string
  projectName: string
  title: string // First user message title
  customTitle?: string // User-set custom title
  lastSummary?: string // Last summary text for display/tooltip
  messageCount: number
  createdAt?: string
  updatedAt?: string
  summaries: SummaryInfo[] // All summaries in reverse order (newest first)
  agents: AgentInfo[]
  todos: SessionTodos
  lastCompactBoundaryUuid?: string // UUID of last compact_boundary
}

// Project tree node with sessions
export interface ProjectTreeData {
  name: string
  displayName: string
  path: string
  sessionCount: number
  sessions: SessionTreeData[]
}
