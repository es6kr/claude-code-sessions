/**
 * Session tree data operations for VSCode extension
 */
import { Effect } from 'effect'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { getSessionsDir } from '../paths.js'
import {
  extractTextContent,
  extractTitle,
  getSessionSortTimestamp,
  isErrorSessionTitle,
  parseJsonlLines,
  tryParseJsonLine,
} from '../utils.js'
import { findLinkedAgents } from '../agents.js'
import { findLinkedTodos } from '../todos.js'
import { listProjects } from './projects.js'
import type {
  Message,
  SessionTreeData,
  SummaryInfo,
  SessionSortOptions,
  AgentInfo,
  ProjectTreeData,
  JsonlRecord,
} from '../types.js'

/**
 * Sort sessions based on sort options
 * Exported for testing purposes
 */
export const sortSessions = <T extends SessionTreeData>(
  sessions: T[],
  sort: SessionSortOptions
): T[] => {
  return sessions.sort((a, b) => {
    let comparison = 0

    switch (sort.field) {
      case 'summary': {
        // By pre-calculated sort timestamp (oldest summary timestamp, matches official extension)
        comparison = a.sortTimestamp - b.sortTimestamp
        break
      }
      case 'modified': {
        // By file modification time
        comparison = (a.fileMtime ?? 0) - (b.fileMtime ?? 0)
        break
      }
      case 'created': {
        // By session creation time
        const createdA = a.createdAt ? new Date(a.createdAt).getTime() : 0
        const createdB = b.createdAt ? new Date(b.createdAt).getTime() : 0
        comparison = createdA - createdB
        break
      }
      case 'updated': {
        // By last message timestamp
        const updatedA = a.updatedAt ? new Date(a.updatedAt).getTime() : 0
        const updatedB = b.updatedAt ? new Date(b.updatedAt).getTime() : 0
        comparison = updatedA - updatedB
        break
      }
      case 'messageCount': {
        // By number of messages
        comparison = a.messageCount - b.messageCount
        break
      }
      case 'title': {
        // Alphabetical by display title (customTitle > currentSummary > title)
        const titleA = a.customTitle ?? a.currentSummary ?? a.title
        const titleB = b.customTitle ?? b.currentSummary ?? b.title
        comparison = titleA.localeCompare(titleB)
        break
      }
    }

    // Apply sort order (desc = newest/largest first)
    return sort.order === 'desc' ? -comparison : comparison
  })
}

// Internal helper for loading session tree data
const loadSessionTreeDataInternal = (
  projectName: string,
  sessionId: string,
  summariesByTargetSession?: Map<string, SummaryInfo[]>,
  fileMtime?: number
) =>
  Effect.gen(function* () {
    const projectPath = path.join(getSessionsDir(), projectName)
    const filePath = path.join(projectPath, `${sessionId}.jsonl`)
    const content = yield* Effect.tryPromise(() => fs.readFile(filePath, 'utf-8'))
    const lines = content.trim().split('\n').filter(Boolean)
    const messages = parseJsonlLines<JsonlRecord>(lines, filePath)

    // Get summaries that TARGET this session (by leafUuid pointing to messages in this session)
    let summaries: SummaryInfo[]
    if (summariesByTargetSession) {
      // Project-wide loading: use pre-computed summaries targeting this session
      // Sort by timestamp ascending (oldest first), then by sourceFile descending (larger filename first)
      // Official extension shows the OLDEST summary as currentSummary, and prefers larger filenames when timestamps match
      summaries = [...(summariesByTargetSession.get(sessionId) ?? [])].sort((a, b) => {
        // 1. timestamp ascending (oldest first - official extension shows oldest as currentSummary)
        const timestampCmp = (a.timestamp ?? '').localeCompare(b.timestamp ?? '')
        if (timestampCmp !== 0) return timestampCmp
        // 2. sourceFile descending (larger filename first, e.g., b878041c > 355e3718)
        return (b.sourceFile ?? '').localeCompare(a.sourceFile ?? '')
      })
    } else {
      // Single session loading: need to search the entire project for summaries targeting this session
      summaries = []
      // Build uuid set for this session's messages
      const sessionUuids = new Set<string>()
      for (const msg of messages) {
        if (msg.uuid && typeof msg.uuid === 'string') {
          sessionUuids.add(msg.uuid)
        }
      }
      // Search all session files in the project for summaries with leafUuid pointing to this session
      const projectFiles = yield* Effect.tryPromise(() => fs.readdir(projectPath))
      const allJsonlFiles = projectFiles.filter((f) => f.endsWith('.jsonl'))
      for (const file of allJsonlFiles) {
        try {
          const otherFilePath = path.join(projectPath, file)
          const otherContent = yield* Effect.tryPromise(() => fs.readFile(otherFilePath, 'utf-8'))
          const otherLines = otherContent.trim().split('\n').filter(Boolean)
          for (let i = 0; i < otherLines.length; i++) {
            const msg = tryParseJsonLine<JsonlRecord>(otherLines[i], i + 1, otherFilePath)
            if (!msg) continue
            if (
              msg.type === 'summary' &&
              typeof msg.summary === 'string' &&
              typeof msg.leafUuid === 'string' &&
              sessionUuids.has(msg.leafUuid)
            ) {
              // This summary's leafUuid points to a message in THIS session
              const targetMsg = messages.find((m) => m.uuid === msg.leafUuid)
              summaries.push({
                summary: msg.summary as string,
                leafUuid: msg.leafUuid,
                timestamp:
                  (targetMsg?.timestamp as string) ?? (msg.timestamp as string | undefined),
                sourceFile: file,
              })
            }
          }
        } catch {
          // Skip unreadable files
        }
      }
    }
    // Sort by timestamp ascending (oldest first), then sourceFile descending
    // Official extension shows the OLDEST summary as currentSummary
    summaries.sort((a, b) => {
      const timestampCmp = (a.timestamp ?? '').localeCompare(b.timestamp ?? '')
      if (timestampCmp !== 0) return timestampCmp
      return (b.sourceFile ?? '').localeCompare(a.sourceFile ?? '')
    })

    // Find last compact_boundary
    let lastCompactBoundaryUuid: string | undefined
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i]
      if (msg.type === 'system' && msg.subtype === 'compact_boundary') {
        lastCompactBoundaryUuid = msg.uuid as string
        break
      }
    }

    // Get first user message
    const firstUserMsg = messages.find((m) => m.type === 'user') as Message | undefined

    // customTitle is stored as separate custom-title type line
    const customTitleMsg = messages.find((m) => m.type === 'custom-title') as
      | { type: 'custom-title'; customTitle?: string }
      | undefined
    const customTitle = customTitleMsg?.customTitle

    // Get title from first user message
    const title = firstUserMsg
      ? extractTitle(firstUserMsg.message)
      : summaries.length > 0
        ? '[Summary Only]'
        : `Session ${sessionId.slice(0, 8)}`

    // Count user/assistant messages
    const userAssistantMessages = messages.filter(
      (m) => m.type === 'user' || m.type === 'assistant'
    )
    const firstMessage = userAssistantMessages[0]
    const lastMessage = userAssistantMessages[userAssistantMessages.length - 1]

    // Find linked agents
    const linkedAgentIds = yield* findLinkedAgents(projectName, sessionId)

    // Load agent info (message counts)
    const agents: AgentInfo[] = []
    for (const agentId of linkedAgentIds) {
      const agentPath = path.join(projectPath, `${agentId}.jsonl`)
      try {
        const agentContent = yield* Effect.tryPromise(() => fs.readFile(agentPath, 'utf-8'))
        const agentLines = agentContent.trim().split('\n').filter(Boolean)
        const agentMsgs = agentLines.map((l) => JSON.parse(l) as JsonlRecord)
        const agentUserAssistant = agentMsgs.filter(
          (m) => m.type === 'user' || m.type === 'assistant'
        )

        // Try to extract agent name from first message
        let agentName: string | undefined
        const firstAgentMsg = agentMsgs.find((m) => m.type === 'user')
        if (firstAgentMsg) {
          const text = extractTextContent(firstAgentMsg.message as Message['message'])
          if (text) {
            agentName = extractTitle(text)
          }
        }

        agents.push({
          id: agentId,
          name: agentName,
          messageCount: agentUserAssistant.length,
        })
      } catch {
        // Agent file might not exist or be readable
        agents.push({
          id: agentId,
          messageCount: 0,
        })
      }
    }

    // Load todos
    const todos = yield* findLinkedTodos(sessionId, linkedAgentIds)

    // Pre-calculate sort timestamp for 'summary' field
    const createdAt = (firstMessage?.timestamp as string) ?? undefined
    const sortTimestamp = getSessionSortTimestamp({ summaries, createdAt })

    return {
      id: sessionId,
      projectName,
      title,
      customTitle,
      currentSummary: summaries[0]?.summary,
      messageCount:
        userAssistantMessages.length > 0
          ? userAssistantMessages.length
          : summaries.length > 0
            ? 1
            : 0,
      createdAt,
      updatedAt: (lastMessage?.timestamp as string) ?? undefined,
      fileMtime,
      sortTimestamp,
      summaries,
      agents,
      todos,
      lastCompactBoundaryUuid,
    } satisfies SessionTreeData
  })

// Public wrapper for single session (without global uuid map, leafUuid lookup is limited)
export const loadSessionTreeData = (projectName: string, sessionId: string) =>
  loadSessionTreeDataInternal(projectName, sessionId, undefined)

/** Default sort: by oldest summary timestamp (matches official extension) */
const DEFAULT_SORT: SessionSortOptions = { field: 'summary', order: 'desc' }

// Load all sessions tree data for a project
export const loadProjectTreeData = (projectName: string, sortOptions?: SessionSortOptions) =>
  Effect.gen(function* () {
    const project = (yield* listProjects).find((p) => p.name === projectName)
    if (!project) {
      return null
    }

    const sort = sortOptions ?? DEFAULT_SORT
    const projectPath = path.join(getSessionsDir(), projectName)
    const files = yield* Effect.tryPromise(() => fs.readdir(projectPath))
    const sessionFiles = files.filter((f) => f.endsWith('.jsonl') && !f.startsWith('agent-'))

    // Collect file modification times
    const fileMtimes = new Map<string, number>()
    yield* Effect.all(
      sessionFiles.map((file) =>
        Effect.gen(function* () {
          const filePath = path.join(projectPath, file)
          try {
            const stat = yield* Effect.tryPromise(() => fs.stat(filePath))
            fileMtimes.set(file.replace('.jsonl', ''), stat.mtimeMs)
          } catch {
            // Ignore stat errors
          }
        })
      ),
      { concurrency: 20 }
    )

    // Phase 1: Build global uuid map + collect all summaries from ALL sessions
    // This is needed because leafUuid can reference messages in other sessions
    const globalUuidMap = new Map<string, { sessionId: string; timestamp?: string }>()
    const allSummaries: Array<{
      summary: string
      leafUuid?: string
      timestamp?: string
      sourceFile: string
    }> = []

    // Read all .jsonl files (sessions + agents) to build uuid map and collect summaries
    const allJsonlFiles = files.filter((f) => f.endsWith('.jsonl'))
    yield* Effect.all(
      allJsonlFiles.map((file) =>
        Effect.gen(function* () {
          const filePath = path.join(projectPath, file)
          const fileSessionId = file.replace('.jsonl', '')
          try {
            const content = yield* Effect.tryPromise(() => fs.readFile(filePath, 'utf-8'))
            const lines = content.trim().split('\n').filter(Boolean)
            for (let i = 0; i < lines.length; i++) {
              const msg = tryParseJsonLine<JsonlRecord>(lines[i], i + 1, filePath)
              if (!msg) continue
              if (msg.uuid && typeof msg.uuid === 'string') {
                globalUuidMap.set(msg.uuid, {
                  sessionId: fileSessionId,
                  timestamp: msg.timestamp as string | undefined,
                })
              }
              // Also check messageId for file-history-snapshot type
              if (msg.messageId && typeof msg.messageId === 'string') {
                globalUuidMap.set(msg.messageId, {
                  sessionId: fileSessionId,
                  timestamp: (msg.snapshot as Record<string, unknown> | undefined)?.timestamp as
                    | string
                    | undefined,
                })
              }
              // Collect summaries with source file for sorting
              if (msg.type === 'summary' && typeof msg.summary === 'string') {
                allSummaries.push({
                  summary: msg.summary as string,
                  leafUuid: msg.leafUuid as string | undefined,
                  timestamp: msg.timestamp as string | undefined,
                  sourceFile: file,
                })
              }
            }
          } catch {
            // Skip unreadable files
          }
        })
      ),
      { concurrency: 20 }
    )

    // Phase 1.5: Build summariesByTargetSession map
    // Each summary's leafUuid points to a message in some session - that's the TARGET session
    const summariesByTargetSession = new Map<string, SummaryInfo[]>()
    for (const summaryData of allSummaries) {
      if (summaryData.leafUuid) {
        const targetInfo = globalUuidMap.get(summaryData.leafUuid)
        if (targetInfo) {
          const targetSessionId = targetInfo.sessionId
          if (!summariesByTargetSession.has(targetSessionId)) {
            summariesByTargetSession.set(targetSessionId, [])
          }
          summariesByTargetSession.get(targetSessionId)!.push({
            summary: summaryData.summary,
            leafUuid: summaryData.leafUuid,
            // Use summary's own timestamp for sorting, not the target message's timestamp
            timestamp: summaryData.timestamp ?? targetInfo.timestamp,
            sourceFile: summaryData.sourceFile,
          })
        }
      }
    }

    // Phase 2: Load session tree data with summaries targeting each session
    const sessions = yield* Effect.all(
      sessionFiles.map((file) => {
        const sessionId = file.replace('.jsonl', '')
        const mtime = fileMtimes.get(sessionId)
        return loadSessionTreeDataInternal(projectName, sessionId, summariesByTargetSession, mtime)
      }),
      { concurrency: 10 }
    )

    // Sort sessions based on sortOptions
    const sortedSessions = sortSessions(sessions, sort)

    // Filter out error sessions (API errors, authentication errors, etc.)
    const filteredSessions = sortedSessions.filter((s) => {
      // Check all possible title/summary fields for error patterns
      if (isErrorSessionTitle(s.title)) return false
      if (isErrorSessionTitle(s.customTitle)) return false
      if (isErrorSessionTitle(s.currentSummary)) return false
      return true
    })

    return {
      name: project.name,
      displayName: project.displayName,
      path: project.path,
      sessionCount: filteredSessions.length,
      sessions: filteredSessions,
    } as ProjectTreeData
  })
