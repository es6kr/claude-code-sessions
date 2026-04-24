/**
 * @claude-sessions/core
 * Core library for Claude Code session management
 */

// Types
export type {
  ContentItem,
  MessagePayload,
  Message,
  SessionMeta,
  Project,
  TodoItem,
  SessionTodos,
  FileChange,
  SessionFilesSummary,
  BackupSessionInfo,
  DeleteSessionResult,
  RestoreSessionResult,
  RenameSessionResult,
  SplitSessionResult,
  MoveSessionResult,
  ClearSessionsResult,
  CleanupPreview,
  SearchResult,
  SummaryInfo,
  AgentInfo,
  SessionTreeData,
  ProjectTreeData,
  ResumeSessionOptions,
  ResumeSessionResult,
  ToolUsageStats,
  SessionAnalysis,
  CompressSessionOptions,
  CompressSessionResult,
  ProjectKnowledge,
  ConversationLine,
  SummarizeSessionOptions,
  SummarizeSessionResult,
  SessionIndexEntry,
  SessionsIndex,
  SessionSortField,
  SessionSortOrder,
  SessionSortOptions,
  TitleDisplayMode,
} from './types.js'

// Path utilities
export {
  getSessionsDir,
  getTodosDir,
  folderNameToDisplayPath,
  pathToFolderName,
  folderNameToPath,
  getRealPathFromSession,
  findProjectByWorkspacePath,
  expandHomePath,
} from './paths.js'

// Project utilities
export { sortProjects } from './projects.js'

// Message utilities
export {
  extractTextContent,
  extractTitle,
  isInvalidApiKeyMessage,
  isContinuationSummary,
  parseCommandMessage,
  getDisplayTitle,
  type DisplayTitleOptions,
  maskHomePath,
  getDisplaySortTimestamp,
  getSessionSortTimestamp,
  getSummarySortTimestamp,
  tryParseJsonLine,
  parseJsonlLines,
  readJsonlFile,
  // UI shared utilities
  formatRelativeTime,
  getTotalTodoCount,
  sessionHasSubItems,
  getSessionTooltip,
  canMoveSession,
  fileExists,
  groupSessionsByDate,
  type DateGroupKey,
  type DateGroup,
} from './utils.js'

// Tree view constants and utilities
export type { TreeItemType } from './tree-constants.js'
export { TREE_ICONS, getTodoIcon, generateTreeNodeId, parseTreeNodeId } from './tree-constants.js'

// Agent management
export {
  findLinkedAgents,
  findOrphanAgents,
  deleteOrphanAgents,
  loadAgentMessages,
} from './agents.js'

// Todo management
export {
  findLinkedTodos,
  sessionHasTodos,
  deleteLinkedTodos,
  findOrphanTodos,
  deleteOrphanTodos,
} from './todos.js'

// Session operations
export { sortSessions } from './session/tree.js'

export {
  listProjects,
  listSessions,
  readSession,
  deleteMessage,
  restoreMessage,
  deleteSession,
  listBackupSessions,
  restoreSession,
  renameSession,
  getSessionFiles,
  analyzeSession,
  compressSession,
  extractProjectKnowledge,
  summarizeSession,
  moveSession,
  splitSession,
  previewCleanup,
  clearSessions,
  searchSessions,
  loadSessionTreeData,
  loadProjectTreeData,
  getCachePath,
  updateSessionSummary,
  repairChain,
} from './session.js'

// Note: resumeSession is exported from '@claude-sessions/core/server'
// It uses child_process and should only be used in server/Node.js environments

// Sessions index file (official Claude Code extension format)
export {
  loadSessionsIndex,
  getIndexEntryDisplayTitle,
  sortIndexEntriesByModified,
  hasSessionsIndex,
} from './session/index-file.js'

// Logger
export type { Logger } from './logger.js'
export { setLogger, getLogger, createLogger } from './logger.js'

// Validation utilities
export type {
  GenericMessage,
  ChainError,
  ToolUseResultError,
  ProgressError,
  ValidationResult,
} from './session/validation.js'
export {
  validateChain,
  validateToolUseResult,
  validateProgressMessages,
  deleteMessageWithChainRepair,
  repairParentUuidChain,
  autoRepairChain,
} from './session/validation.js'
