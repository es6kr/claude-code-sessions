/**
 * Session management operations
 *
 * This file re-exports all session operations from the session/ directory
 * for backward compatibility.
 */

// Re-export everything from the session module
export {
  // Projects
  listProjects,
  // CRUD operations
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
  // Tree data
  loadSessionTreeData,
  loadProjectTreeData,
  // Analysis
  analyzeSession,
  compressSession,
  extractProjectKnowledge,
  summarizeSession,
  // Cleanup
  previewCleanup,
  clearSessions,
  // Search
  searchSessions,
  // Files
  getSessionFiles,
  // Validation
  validateChain,
  validateToolUseResult,
  deleteMessageWithChainRepair,
  type ValidationResult,
  type ChainError,
  type ToolUseResultError,
} from './session/index.js'
