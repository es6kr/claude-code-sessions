/**
 * Project tree store with session, agent, todo, and summary tracking
 */

import type { Message, SessionMeta } from '$lib/api'

/** Summary info extracted from session messages */
export interface SummaryInfo {
  uuid: string
  summary: string
  leafUuid?: string
  timestamp?: string // Derived from leafUuid message
  sessionId: string
}

/** Extended session with linked data */
export interface SessionNode {
  meta: SessionMeta
  agents: string[] // Agent file names
  todos: string[] // Todo file names
  summaries: SummaryInfo[] // Summary messages from session
  lastSummary?: SummaryInfo // Most recent summary for quick access
  messages?: Message[] // Loaded messages (lazy)
}

/** Project node with sessions */
export interface ProjectNode {
  name: string
  displayName: string
  path: string
  sessions: Map<string, SessionNode>
  expanded: boolean
  loading: boolean
}

/** Project tree state */
export interface ProjectTreeState {
  projects: Map<string, ProjectNode>
  selectedSessionId: string | null
  selectedProjectName: string | null
}

/**
 * Extract summary info from messages
 * Finds timestamp from leafUuid reference
 */
export const extractSummaries = (messages: Message[], sessionId: string): SummaryInfo[] => {
  const summaries: SummaryInfo[] = []
  const messageMap = new Map<string, Message>()

  // Build message lookup map
  for (const msg of messages) {
    if (msg.uuid) {
      messageMap.set(msg.uuid, msg)
    }
  }

  // Find summary messages and resolve timestamps
  for (const msg of messages) {
    if (msg.type === 'summary' && msg.summary) {
      const leafMsg = msg.leafUuid ? messageMap.get(msg.leafUuid) : undefined
      summaries.push({
        uuid: msg.uuid,
        summary: msg.summary,
        leafUuid: msg.leafUuid,
        timestamp: leafMsg?.timestamp ?? msg.timestamp,
        sessionId,
      })
    }
  }

  return summaries
}

/**
 * Get the last (most recent) summary from a list
 */
export const getLastSummary = (summaries: SummaryInfo[]): SummaryInfo | undefined => {
  if (summaries.length === 0) return undefined

  // Sort by timestamp descending, return first
  return [...summaries].sort((a, b) => {
    if (!a.timestamp) return 1
    if (!b.timestamp) return -1
    return b.timestamp.localeCompare(a.timestamp)
  })[0]
}

/**
 * Find compact_boundary message index
 */
export const findCompactBoundaryIndex = (messages: Message[]): number => {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i]
    // Check for compact_boundary type or isCompactSummary flag
    if (msg.type === 'compact_boundary' || (msg as Message & { isCompactSummary?: boolean }).isCompactSummary) {
      return i
    }
  }
  return -1
}

/**
 * Create initial project node
 */
export const createProjectNode = (
  name: string,
  displayName: string,
  path: string
): ProjectNode => ({
  name,
  displayName,
  path,
  sessions: new Map(),
  expanded: false,
  loading: false,
})

/**
 * Create session node from metadata
 */
export const createSessionNode = (meta: SessionMeta): SessionNode => ({
  meta,
  agents: [],
  todos: [],
  summaries: [],
  lastSummary: undefined,
  messages: undefined,
})
