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
 * AskUserQuestion tool response with questions and user answers.
 */
export interface AskUserQuestionResult {
  questions: Array<{
    question: string
    header: string
    options: Array<{ label: string; description: string }>
    multiSelect: boolean
  }>
  answers: Record<string, string>
}

/**
 * Tool use result - either a string (rejection reason) or AskUserQuestion response.
 */
export type ToolUseResult = string | AskUserQuestionResult

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
  /** Tool use result (string for rejections, AskUserQuestionResult for Q&A) */
  toolUseResult?: ToolUseResult
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
  /** Current (first) summary text for display/tooltip */
  currentSummary?: string
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

// ============================================================================
// Resume Session Types
// ============================================================================

/** Options for resuming a session */
export interface ResumeSessionOptions {
  /** Session ID to resume */
  sessionId: string
  /** Working directory for the claude process */
  cwd?: string
  /** Whether to fork the session instead of continuing */
  fork?: boolean
  /** Additional arguments to pass to claude */
  args?: string[]
}

/** Result of spawning a resume session process */
export interface ResumeSessionResult {
  success: boolean
  /** Process ID if spawned successfully */
  pid?: number
  /** Error message if failed */
  error?: string
}

// ============================================================================
// Session Analysis Types
// ============================================================================

/** Tool usage statistics */
export interface ToolUsageStats {
  /** Tool name */
  name: string
  /** Number of times used */
  count: number
  /** Number of errors */
  errorCount: number
}

/** Session analysis result for optimization */
export interface SessionAnalysis {
  sessionId: string
  projectName: string

  /** Session duration in minutes */
  durationMinutes: number

  /** Message statistics */
  stats: {
    totalMessages: number
    userMessages: number
    assistantMessages: number
    summaryCount: number
    snapshotCount: number
  }

  /** Tool usage breakdown */
  toolUsage: ToolUsageStats[]

  /** Files changed during session */
  filesChanged: string[]

  /** Detected patterns (e.g., repeated failures, common operations) */
  patterns: {
    type: string
    description: string
    count: number
  }[]

  /** Key decisions or milestones extracted from conversation */
  milestones: {
    timestamp?: string
    description: string
    messageUuid?: string
  }[]
}

/** Options for session compression */
export interface CompressSessionOptions {
  /** Keep first and last snapshots only */
  keepSnapshots?: 'first_last' | 'all' | 'none'
  /** Summarize tool outputs longer than this (0 = no limit) */
  maxToolOutputLength?: number
}

/** Result of session compression */
export interface CompressSessionResult {
  success: boolean
  originalSize: number
  compressedSize: number
  removedSnapshots: number
  truncatedOutputs: number
  error?: string
}

/** Extracted knowledge from sessions */
export interface ProjectKnowledge {
  projectName: string
  /** Common patterns across sessions */
  patterns: {
    type: string
    description: string
    frequency: number
    examples: string[]
  }[]
  /** Frequently modified files */
  hotFiles: {
    path: string
    modifyCount: number
    lastModified?: string
  }[]
  /** Common tool workflows */
  workflows: {
    sequence: string[]
    count: number
  }[]
  /** Learned decisions */
  decisions: {
    context: string
    decision: string
    sessionId: string
  }[]
}

// ============================================================================
// Session Summarization Types
// ============================================================================

/** A single line in conversation summary */
export interface ConversationLine {
  /** Message role */
  role: 'user' | 'assistant'
  /** Message content (truncated) */
  content: string
  /** Timestamp string (MM-DD HH:MM), only for user messages */
  timestamp?: string
}

/** Options for summarizing a session */
export interface SummarizeSessionOptions {
  /** Maximum number of messages to include */
  limit?: number
  /** Maximum length for each message content */
  maxLength?: number
}

/** Result of session summarization */
export interface SummarizeSessionResult {
  sessionId: string
  projectName: string
  /** Structured conversation lines */
  lines: ConversationLine[]
  /** Pre-formatted output string */
  formatted: string
}
