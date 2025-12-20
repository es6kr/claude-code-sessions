/**
 * Core types for Claude Code session management
 */

// ============================================================================
// Base Types
// ============================================================================

/**
 * Base interface for objects with a type discriminator.
 * Used as a foundation for message and content types.
 */
export interface TypedObject {
  type: string
}

/**
 * Generic record for JSONL file lines.
 * Used when parsing session/agent files before type narrowing.
 */
export interface JsonlRecord extends TypedObject {
  [key: string]: unknown
}

// ============================================================================
// Message Content Types (Anthropic API format)
// ============================================================================

/**
 * Text content block in a message.
 * @see https://docs.anthropic.com/en/api/messages
 */
export interface TextContent {
  type: 'text'
  text: string
}

/**
 * Tool result content returned after tool execution.
 * Contains the output from a tool_use request.
 */
export interface ToolResultContent {
  type: 'tool_result'
  tool_use_id: string
  content: string
  is_error?: boolean
}

/**
 * Tool use request from the assistant.
 * Represents a function call with input parameters.
 */
export interface ToolUseContent {
  type: 'tool_use'
  id: string
  name: string
  input: unknown
}

/**
 * Union type for all message content blocks.
 * Includes known types and a fallback for unknown content types.
 */
export type ContentItem =
  | TextContent
  | ToolResultContent
  | ToolUseContent
  | {
      type: string
      text?: string
      name?: string
      input?: unknown
      content?: string
    }

/**
 * Message payload containing role and content.
 * Matches Anthropic API message structure.
 */
export interface MessagePayload {
  role?: string
  content?: ContentItem[] | string
  model?: string
}

// ============================================================================
// Session Message Types
// ============================================================================

/**
 * A single message in a Claude Code session.
 * Stored as a line in a JSONL session file.
 */
export interface Message extends TypedObject {
  /** Unique identifier for this message */
  uuid: string
  /** Parent message UUID for conversation threading */
  parentUuid?: string | null
  /** Session ID this message belongs to */
  sessionId?: string
  /** Timestamp in ISO format */
  timestamp?: string
  /** Message content (nested payload structure) */
  message?: MessagePayload
  /** Direct content (alternative to message.content) */
  content?: ContentItem[] | string
  /** User-defined custom title for this message */
  customTitle?: string
  /** Summary text for summary-type messages */
  summary?: string
  /** Flag indicating this is a context continuation summary */
  isCompactSummary?: boolean
  /** Tool use result text (for tool_result messages) */
  toolUseResult?: string
}

// ============================================================================
// Session & Project Metadata
// ============================================================================

/** Basic metadata for a session, used in listings and summaries */
export interface SessionMeta {
  id: string
  projectName: string
  title?: string
  messageCount: number
  createdAt?: string
  updatedAt?: string
}

/** Project directory information */
export interface Project {
  name: string
  displayName: string
  path: string
  sessionCount: number
}

// ============================================================================
// Todo Types
// ============================================================================

/** A single todo item from TodoWrite tool */
export interface TodoItem {
  content: string
  status: 'pending' | 'in_progress' | 'completed'
  /** Active form text shown during execution */
  activeForm?: string
}

/** Aggregated todos for a session including agent todos */
export interface SessionTodos {
  sessionId: string
  sessionTodos: TodoItem[]
  agentTodos: { agentId: string; todos: TodoItem[] }[]
  hasTodos: boolean
}

// ============================================================================
// File Change Tracking
// ============================================================================

/** A file modification recorded during a session */
export interface FileChange {
  path: string
  action: 'created' | 'modified' | 'deleted'
  timestamp?: string
  messageUuid?: string
}

/** Summary of all file changes in a session */
export interface SessionFilesSummary {
  sessionId: string
  projectName: string
  files: FileChange[]
  totalChanges: number
}

// ============================================================================
// Operation Results
// ============================================================================

/** Result of deleting a session */
export interface DeleteSessionResult {
  success: boolean
  backupPath?: string
  deletedAgents: number
  deletedTodos?: number
}

/** Result of renaming a session */
export interface RenameSessionResult {
  success: boolean
  error?: string
}

/** Result of splitting a session at a message */
export interface SplitSessionResult {
  success: boolean
  newSessionId?: string
  newSessionPath?: string
  movedMessageCount?: number
  duplicatedSummary?: boolean
  error?: string
}

/** Result of moving a session to another project */
export interface MoveSessionResult {
  success: boolean
  error?: string
}

/** Result of clearing empty/invalid sessions */
export interface ClearSessionsResult {
  success: boolean
  deletedCount: number
  removedMessageCount?: number
  deletedOrphanAgentCount?: number
  deletedOrphanTodoCount?: number
}

/** Preview of sessions that would be cleaned up */
export interface CleanupPreview {
  project: string
  emptySessions: SessionMeta[]
  invalidSessions: SessionMeta[]
  emptyWithTodosCount?: number
  orphanAgentCount?: number
  orphanTodoCount?: number
}

// ============================================================================
// Search Types
// ============================================================================

/** A search result matching a session or message */
export interface SearchResult {
  sessionId: string
  projectName: string
  title: string
  matchType: 'title' | 'content'
  snippet?: string
  messageUuid?: string
  timestamp?: string
}

// ============================================================================
// Tree View Types (for UI rendering)
// ============================================================================

/** Summary extracted from a session for display */
export interface SummaryInfo {
  summary: string
  leafUuid?: string
  timestamp?: string
}

/** Agent information for tree display */
export interface AgentInfo {
  id: string
  name?: string
  messageCount: number
}

/** Full session data for tree view rendering */
export interface SessionTreeData {
  id: string
  projectName: string
  /** First user message title */
  title: string
  /** User-set custom title */
  customTitle?: string
  /** Last summary text for display/tooltip */
  lastSummary?: string
  messageCount: number
  createdAt?: string
  updatedAt?: string
  /** All summaries in reverse order (newest first) */
  summaries: SummaryInfo[]
  agents: AgentInfo[]
  todos: SessionTodos
  /** UUID of last compact_boundary message */
  lastCompactBoundaryUuid?: string
}

/** Project with all sessions for tree view */
export interface ProjectTreeData {
  name: string
  displayName: string
  path: string
  sessionCount: number
  sessions: SessionTreeData[]
}
