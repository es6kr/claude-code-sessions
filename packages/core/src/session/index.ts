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
} from './crud.js'

// Tree data operations
export { loadSessionTreeData, loadProjectTreeData } from './tree.js'

// Analysis and compression
export {
  analyzeSession,
  compressSession,
  extractProjectKnowledge,
  summarizeSession,
} from './analysis.js'

// Cleanup operations
export { previewCleanup, clearSessions } from './cleanup.js'

// Search
export { searchSessions } from './search.js'

// File tracking
export { getSessionFiles } from './files.js'
