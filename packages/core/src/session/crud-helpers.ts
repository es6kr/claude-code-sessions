/**
 * Shared helpers for session CRUD operations
 * Extracted to avoid circular dependencies between crud.ts and crud-streaming.ts
 */
import type { SessionMeta } from '../types.js'

/** Filter session JSONL files from directory listing */
export const filterSessionFiles = (files: string[]): string[] =>
  files.filter((f) => f.endsWith('.jsonl') && !f.startsWith('agent-'))

/** Build SessionMeta from extracted fields */
export const buildSessionMeta = (
  sessionId: string,
  projectName: string,
  fields: {
    title?: string
    agentTitle?: string
    customTitle?: string
    currentSummary?: string
    userAssistantCount: number
    hasSummary: boolean
    firstTimestamp?: string
    lastTimestamp?: string
  }
): SessionMeta => ({
  id: sessionId,
  projectName,
  title:
    fields.title ?? (fields.hasSummary ? '[Summary Only]' : `Session ${sessionId.slice(0, 8)}`),
  agentTitle: fields.agentTitle,
  customTitle: fields.customTitle,
  currentSummary: fields.currentSummary,
  messageCount:
    fields.userAssistantCount > 0 ? fields.userAssistantCount : fields.hasSummary ? 1 : 0,
  createdAt: fields.firstTimestamp,
  updatedAt: fields.lastTimestamp,
})

/** Sort sessions by updatedAt descending */
export const sortSessionsByDate = (sessions: SessionMeta[]): SessionMeta[] =>
  sessions.sort((a, b) => {
    const dateA = a.updatedAt ? new Date(a.updatedAt).getTime() : 0
    const dateB = b.updatedAt ? new Date(b.updatedAt).getTime() : 0
    return dateB - dateA
  })
