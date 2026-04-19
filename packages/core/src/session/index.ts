/**
 * Session management operations - barrel exports
 */

// Projects
export { listProjects } from './projects.js'

// CRUD operations
export {
  listSessions,
  readSession,
  deleteMessage,
  restoreMessage,
  deleteSession,
  renameSession,
  moveSession,
  splitSession,
  updateSessionSummary,
  repairChain,
} from './crud.js'

// Tree data operations
export { loadSessionTreeData, loadProjectTreeData } from './tree.js'

// Cache utilities
export { getCachePath } from './cache.js'

// Analysis and compression
export {
  analyzeSession,
  compressSession,
  extractProjectKnowledge,
  summarizeSession,
} from './analysis.js'

// Streaming session metadata
export { listSessionsMeta } from './crud-streaming.js'

// Cleanup operations
export { previewCleanup, clearSessions } from './cleanup.js'

// Search
export { searchSessions } from './search.js'

// File tracking
export { getSessionFiles } from './files.js'

// Validation
export {
  validateChain,
  validateToolUseResult,
  deleteMessageWithChainRepair,
  type ValidationResult,
  type ChainError,
  type ToolUseResultError,
} from './validation.js'
