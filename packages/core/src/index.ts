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
  DeleteSessionResult,
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
} from './types.js'

// Path utilities
export {
  getSessionsDir,
  getTodosDir,
  folderNameToDisplayPath,
  displayPathToFolderName,
  pathToFolderName,
  folderNameToPath,
  getRealPathFromSession,
} from './paths.js'

// Message utilities
export {
  extractTextContent,
  extractTitle,
  isInvalidApiKeyMessage,
  isContinuationSummary,
  getDisplayTitle,
  maskHomePath,
  sortProjects,
} from './utils.js'

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
export {
  listProjects,
  listSessions,
  readSession,
  deleteMessage,
  restoreMessage,
  deleteSession,
  renameSession,
  getSessionFiles,
  moveSession,
  splitSession,
  previewCleanup,
  clearSessions,
  searchSessions,
  loadSessionTreeData,
  loadProjectTreeData,
  updateSessionSummary,
} from './session.js'

// Logger
export type { Logger } from './logger.js'
export { setLogger, getLogger, createLogger } from './logger.js'
